"""Sequential local worker for Class Scribe.

Polls Supabase outbound, transcribes one recording with faster-whisper,
summarizes it with local Ollama, saves the result, and removes the source audio.
It never exposes a port or logs transcript content.
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import json
import logging
import os
import re
import signal
import socket
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, TypeVar

import httpx
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from faster_whisper import WhisperModel
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from postgrest.types import ReturnMethod
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush
from supabase import Client, create_client

ROOT = Path(__file__).resolve().parent
VERSION = "1.1.0"
LOG = logging.getLogger("class-scribe-worker")
T = TypeVar("T")


def acquire_single_instance() -> object | None:
    """Hold a Windows named mutex so startup/manual launches cannot duplicate work."""
    if os.name != "nt":
        return object()

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    handle = kernel32.CreateMutexW(None, False, "Local\\ClassScribeQueueWorker")
    if not handle:
        raise OSError(ctypes.get_last_error(), "Could not create the worker mutex")
    if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
        kernel32.CloseHandle(handle)
        return None
    return handle


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env.worker.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_publishable_key: str = Field(alias="SUPABASE_PUBLISHABLE_KEY")
    worker_email: str = Field(alias="WORKER_EMAIL")
    worker_password: str = Field(alias="WORKER_PASSWORD")
    worker_id: str = Field(default_factory=lambda: f"{socket.gethostname().lower()}-cpu", alias="WORKER_ID")
    whisper_model: str = Field(default="small", alias="WHISPER_MODEL")
    ollama_model: str = Field(default="qwen3:4b", alias="OLLAMA_MODEL")
    ollama_url: str = Field(default="http://127.0.0.1:11434", alias="OLLAMA_URL")
    poll_seconds: float = Field(default=8, ge=2, le=60, alias="POLL_SECONDS")
    vapid_subject: str = Field(default="https://class-scribe-ruddy.vercel.app", alias="VAPID_SUBJECT")


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.db: Client = create_client(settings.supabase_url, settings.supabase_publishable_key)
        self.model: WhisperModel | None = None
        self.stopping = False
        self.temp_root = ROOT / ".worker-temp"
        self.temp_root.mkdir(exist_ok=True)
        self.secret_root = ROOT / ".worker-secrets"
        self.vapid_key_path = self.secret_root / "vapid_private_key.pem"
        self.vapid: Vapid01 | None = None

    def retry(self, operation: Callable[[], T], attempts: int = 4) -> T:
        delay = 1.0
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                return operation()
            except Exception as error:
                last_error = error
                if attempt == attempts - 1:
                    break
                time.sleep(delay)
                delay = min(delay * 2, 8)
        assert last_error is not None
        raise last_error

    def heartbeat(self, state: str, job_id: str | None = None) -> None:
        payload = {
            "worker_id": self.settings.worker_id,
            "state": state,
            "current_job_id": job_id,
            "version": VERSION,
            "last_seen_at": iso_now(),
        }
        self.retry(lambda: self.db.table("worker_heartbeats").upsert(payload).execute(), attempts=3)

    def touch_job(self, job_id: str, *, status: str, progress: int, stage: str) -> None:
        payload = {
            "status": status,
            "progress": max(0, min(99, progress)),
            "stage": stage,
            "lease_expires_at": iso_after(minutes=20),
        }
        self.retry(lambda: self.db.table("transcription_jobs").update(payload).eq("id", job_id).execute())
        self.heartbeat("processing", job_id)

    def claim(self) -> dict[str, Any] | None:
        response = self.retry(
            lambda: self.db.rpc("claim_next_job", {"p_worker_id": self.settings.worker_id}).execute()
        )
        rows = response.data or []
        return rows[0] if rows else None

    def ensure_push_identity(self) -> None:
        self.secret_root.mkdir(exist_ok=True)
        key_existed = self.vapid_key_path.exists()
        self.vapid = Vapid01.from_file(str(self.vapid_key_path))
        if not key_existed:
            try:
                os.chmod(self.vapid_key_path, 0o600)
            except OSError:
                pass
            LOG.info("Created the local Web Push signing identity.")

        public_key = vapid_public_key(self.vapid)
        existing = self.retry(
            lambda: self.db.table("notification_configuration")
            .select("public_value").eq("key", "web_push").execute()
        ).data or []
        if existing and existing[0]["public_value"] != public_key:
            self.retry(
                lambda: self.db.table("push_subscriptions")
                .delete(returning=ReturnMethod.minimal)
                .neq("id", "00000000-0000-0000-0000-000000000000").execute()
            )
            LOG.warning("The Web Push identity changed; users must enable notifications again.")
        self.retry(
            lambda: self.db.table("notification_configuration").upsert({
                "key": "web_push",
                "public_value": public_key,
            }, on_conflict="key", returning=ReturnMethod.minimal).execute()
        )

    def enqueue_push_deliveries(self, job: dict[str, Any], *, failed: bool = False) -> None:
        subscriptions = self.retry(
            lambda: self.db.table("push_subscriptions")
            .select("id").eq("user_id", job["user_id"]).execute()
        ).data or []
        if not subscriptions:
            return

        preferences_rows = self.retry(
            lambda: self.db.table("notification_preferences")
            .select("notify_each_recording,notify_batch_complete,notify_failures")
            .eq("user_id", job["user_id"]).execute()
        ).data or []
        preferences = preferences_rows[0] if preferences_rows else {
            "notify_each_recording": False,
            "notify_batch_complete": True,
            "notify_failures": True,
        }

        event_key: str | None = None
        payload: dict[str, Any] | None = None
        if failed:
            if preferences["notify_failures"]:
                event_key = f"job:{job['id']}:failed:{job.get('attempt_count', 0)}"
                payload = build_push_payload("failed", job_id=job["id"], batch_id=job["batch_id"])
        elif preferences["notify_each_recording"]:
            event_key = f"job:{job['id']}:completed"
            payload = build_push_payload("recording", job_id=job["id"], batch_id=job["batch_id"])
        elif preferences["notify_batch_complete"]:
            batch_jobs = self.retry(
                lambda: self.db.table("transcription_jobs")
                .select("id,status").eq("batch_id", job["batch_id"]).execute()
            ).data or []
            if batch_jobs and all(item["status"] == "completed" for item in batch_jobs):
                event_key = f"batch:{job['batch_id']}:completed"
                payload = build_push_payload(
                    "batch",
                    job_id=job["id"],
                    batch_id=job["batch_id"],
                    batch_size=len(batch_jobs),
                )

        if not event_key or not payload:
            return

        for subscription in subscriptions:
            existing = self.retry(
                lambda subscription_id=subscription["id"]: self.db.table("push_notification_deliveries")
                .select("id").eq("subscription_id", subscription_id).eq("event_key", event_key).execute()
            ).data or []
            if existing:
                continue
            self.retry(
                lambda subscription_id=subscription["id"]: self.db.table("push_notification_deliveries").insert({
                    "subscription_id": subscription_id,
                    "user_id": job["user_id"],
                    "event_key": event_key,
                    "payload": payload,
                }, returning=ReturnMethod.minimal).execute()
            )

    def process_push_deliveries(self) -> None:
        if self.vapid is None:
            return
        deliveries = self.retry(
            lambda: self.db.table("push_notification_deliveries")
            .select("id,subscription_id,payload,attempt_count")
            .in_("state", ["pending", "failed"])
            .lt("attempt_count", 3)
            .lte("next_attempt_at", iso_now())
            .order("created_at")
            .limit(20)
            .execute()
        ).data or []
        for delivery in deliveries:
            subscriptions = self.retry(
                lambda: self.db.table("push_subscriptions")
                .select("endpoint,p256dh,auth_key")
                .eq("id", delivery["subscription_id"]).execute()
            ).data or []
            if not subscriptions:
                self.retry(
                    lambda: self.db.table("push_notification_deliveries")
                    .delete(returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )
                continue
            subscription = subscriptions[0]
            attempt_count = int(delivery["attempt_count"]) + 1
            try:
                webpush(
                    subscription_info={
                        "endpoint": subscription["endpoint"],
                        "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth_key"]},
                    },
                    data=json.dumps(delivery["payload"], separators=(",", ":")),
                    vapid_private_key=str(self.vapid_key_path),
                    vapid_claims={"sub": self.settings.vapid_subject},
                    ttl=86_400,
                    timeout=15,
                )
            except WebPushException as error:
                status_code = getattr(getattr(error, "response", None), "status_code", None)
                if status_code in {404, 410}:
                    self.retry(
                        lambda: self.db.table("push_subscriptions")
                        .delete(returning=ReturnMethod.minimal).eq("id", delivery["subscription_id"]).execute()
                    )
                    LOG.info("Removed an expired Web Push subscription.")
                    continue
                self.retry(
                    lambda: self.db.table("push_notification_deliveries").update({
                        "state": "failed",
                        "attempt_count": attempt_count,
                        "next_attempt_at": iso_after(minutes=min(60, 2 ** attempt_count)),
                        "last_error": push_error_message(error),
                    }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )
                LOG.warning("A completion notification could not be delivered (attempt %d of 3).", attempt_count)
            except Exception as error:
                self.retry(
                    lambda: self.db.table("push_notification_deliveries").update({
                        "state": "failed",
                        "attempt_count": attempt_count,
                        "next_attempt_at": iso_after(minutes=min(60, 2 ** attempt_count)),
                        "last_error": push_error_message(error),
                    }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )
                LOG.warning("A completion notification could not be delivered (attempt %d of 3).", attempt_count)
            else:
                self.retry(
                    lambda: self.db.table("push_notification_deliveries").update({
                        "state": "sent",
                        "attempt_count": attempt_count,
                        "sent_at": iso_now(),
                        "last_error": None,
                    }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )

    def ensure_model(self) -> WhisperModel:
        if self.model is None:
            LOG.info("Loading Whisper model '%s' on CPU (INT8).", self.settings.whisper_model)
            self.model = WhisperModel(self.settings.whisper_model, device="cpu", compute_type="int8")
            LOG.info("Whisper model loaded.")
        return self.model

    def download(self, job: dict[str, Any], target: Path) -> None:
        content = self.retry(lambda: self.db.storage.from_("recordings").download(job["storage_path"]))
        target.write_bytes(content)

    def transcribe(self, job: dict[str, Any], audio_path: Path) -> tuple[str, list[dict[str, Any]], str | None, float | None]:
        model = self.ensure_model()
        segments_iter, info = model.transcribe(
            str(audio_path),
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=True,
        )
        segments: list[dict[str, Any]] = []
        transcript_parts: list[str] = []
        duration = float(info.duration) if info.duration else None
        last_touch = time.monotonic()
        for segment in segments_iter:
            text = segment.text.strip()
            if text:
                transcript_parts.append(text)
                segments.append({"start": round(float(segment.start), 2), "end": round(float(segment.end), 2), "text": text})
            if time.monotonic() - last_touch > 45:
                fraction = min(1.0, float(segment.end) / duration) if duration else 0.4
                self.touch_job(job["id"], status="transcribing", progress=10 + int(fraction * 65), stage="Transcribing audio locally")
                last_touch = time.monotonic()
            if self.stopping:
                raise InterruptedError("Worker is shutting down")
        transcript = " ".join(transcript_parts).strip()
        if not transcript:
            raise RuntimeError("No speech was detected in this recording")
        return transcript, segments, getattr(info, "language", None), duration

    def ollama_json(self, prompt: str) -> dict[str, Any]:
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "key_points": {"type": "array", "items": {"type": "string"}},
                "action_items": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "key_points", "action_items"],
        }
        payload = {
            "model": self.settings.ollama_model,
            "prompt": prompt + "\n/no_think",
            "stream": False,
            "think": False,
            "format": schema,
            "options": {"temperature": 0.2, "num_ctx": 16384},
        }

        def request() -> dict[str, Any]:
            with httpx.Client(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
                response = client.post(f"{self.settings.ollama_url.rstrip('/')}/api/generate", json=payload)
                response.raise_for_status()
                return response.json()

        raw = self.retry(request, attempts=3).get("response", "").strip()
        parsed = parse_json_object(strip_thinking(raw))
        summary = str(parsed.get("summary", "")).strip()
        if not summary:
            raise RuntimeError("The local summary model returned no summary")
        return {"summary": summary, "key_points": clean_list(parsed.get("key_points")), "action_items": clean_list(parsed.get("action_items"))}

    def summarize(self, job_id: str, transcript: str) -> dict[str, Any]:
        chunks = chunk_text(transcript, max_chars=12_000)
        notes: list[dict[str, Any]] = []
        for index, chunk in enumerate(chunks):
            self.touch_job(job_id, status="summarizing", progress=78 + int((index / max(1, len(chunks))) * 14), stage=f"Summarizing section {index + 1} of {len(chunks)}")
            prompt = (
                "You are creating faithful study notes from part of a class lecture. "
                "Return JSON only. Write a concise factual summary, 3-8 important key points, "
                "and explicit assignments, deadlines, questions, or study actions. "
                "Do not invent details. If there are no action items, use an empty array.\n\n"
                f"LECTURE SECTION {index + 1}/{len(chunks)}:\n{chunk}"
            )
            notes.append(self.ollama_json(prompt))
        if len(notes) == 1:
            return notes[0]
        combined = json.dumps(notes, ensure_ascii=False)
        self.touch_job(job_id, status="summarizing", progress=94, stage="Combining lecture notes")
        return self.ollama_json(
            "Combine these ordered section notes into one cohesive set of class notes. "
            "Return JSON only. Preserve important facts, remove duplicates, produce a useful "
            "2-5 paragraph summary, 5-12 key points, and only genuine action items.\n\n"
            f"SECTION NOTES:\n{combined}"
        )

    def complete(self, job: dict[str, Any], transcript: str, segments: list[dict[str, Any]], language: str | None, duration: float | None, notes: dict[str, Any], elapsed: float) -> None:
        result = {
            "job_id": job["id"],
            "user_id": job["user_id"],
            "detected_language": language,
            "transcript": transcript,
            "summary": notes["summary"],
            "key_points": notes["key_points"],
            "action_items": notes["action_items"],
            "segments": segments,
            "transcription_model": f"faster-whisper/{self.settings.whisper_model}-cpu-int8",
            "summary_model": f"ollama/{self.settings.ollama_model}",
            "processing_seconds": round(elapsed, 2),
        }
        existing_result = self.retry(
            lambda: self.db.table("transcription_results")
            .select("job_id").eq("job_id", job["id"]).execute()
        ).data
        if existing_result:
            self.retry(lambda: self.db.table("transcription_results").update(
                result, returning=ReturnMethod.minimal
            ).eq("job_id", job["id"]).execute())
        else:
            self.retry(lambda: self.db.table("transcription_results").insert(
                result, returning=ReturnMethod.minimal
            ).execute())

        event = {"job_id": job["id"], "user_id": job["user_id"], "state": "pending"}
        existing_event = self.retry(
            lambda: self.db.table("completion_events")
            .select("job_id").eq("job_id", job["id"]).execute()
        ).data
        if existing_event:
            self.retry(lambda: self.db.table("completion_events").update(
                event, returning=ReturnMethod.minimal
            ).eq("job_id", job["id"]).execute())
        else:
            self.retry(lambda: self.db.table("completion_events").insert(
                event, returning=ReturnMethod.minimal
            ).execute())
        self.retry(lambda: self.db.table("transcription_jobs").update({
            "status": "completed",
            "progress": 100,
            "stage": "Notes ready",
            "duration_seconds": duration,
            "completed_at": iso_now(),
            "claimed_by": None,
            "lease_expires_at": None,
            "error_code": None,
            "error_message": None,
        }).eq("id", job["id"]).execute())
        try:
            self.retry(lambda: self.db.storage.from_("recordings").remove([job["storage_path"]]), attempts=3)
        except Exception:
            LOG.warning("Job %s completed, but source audio cleanup needs attention.", short_id(job["id"]))
        try:
            self.enqueue_push_deliveries(job)
            self.process_push_deliveries()
        except Exception:
            LOG.warning("Job %s completed, but its notification will be retried later.", short_id(job["id"]))

    def fail(self, job: dict[str, Any], error: Exception) -> None:
        if isinstance(error, InterruptedError):
            LOG.warning("Job %s interrupted; its lease will return it to the queue.", short_id(job["id"]))
            return
        message = public_error(error)
        try:
            self.retry(lambda: self.db.table("transcription_jobs").update({
                "status": "failed",
                "progress": 0,
                "stage": "Processing failed",
                "claimed_by": None,
                "lease_expires_at": None,
                "error_code": type(error).__name__[:80],
                "error_message": message,
            }).eq("id", job["id"]).execute())
        except Exception:
            LOG.error("Could not persist failure state for job %s.", short_id(job["id"]))
        try:
            self.enqueue_push_deliveries(job, failed=True)
            self.process_push_deliveries()
        except Exception:
            LOG.warning("The failure notification for job %s will be retried later.", short_id(job["id"]))
        LOG.error("Job %s failed: %s", short_id(job["id"]), message)

    def process(self, job: dict[str, Any]) -> None:
        started = time.monotonic()
        suffix = safe_suffix(job.get("original_filename", "recording.mp3"))
        fd, path_string = tempfile.mkstemp(prefix=f"{job['id']}-", suffix=suffix, dir=self.temp_root)
        os.close(fd)
        audio_path = Path(path_string)
        LOG.info("Starting job %s (%s).", short_id(job["id"]), safe_filename(job.get("original_filename", "")))
        try:
            self.heartbeat("processing", job["id"])
            self.touch_job(job["id"], status="transcribing", progress=7, stage="Downloading private audio")
            self.download(job, audio_path)
            self.touch_job(job["id"], status="transcribing", progress=10, stage="Transcribing audio locally")
            transcript, segments, language, duration = self.transcribe(job, audio_path)
            self.touch_job(job["id"], status="summarizing", progress=78, stage="Preparing study notes")
            notes = self.summarize(job["id"], transcript)
            self.complete(job, transcript, segments, language, duration, notes, time.monotonic() - started)
            LOG.info("Completed job %s in %.1f seconds.", short_id(job["id"]), time.monotonic() - started)
        except Exception as error:
            self.fail(job, error)
        finally:
            audio_path.unlink(missing_ok=True)
            try:
                self.heartbeat("idle")
            except Exception:
                LOG.warning("Could not send the final idle heartbeat.")

    def run(self, once: bool = False) -> int:
        LOG.info("Class Scribe worker %s starting as '%s'.", VERSION, self.settings.worker_id)
        self.retry(lambda: self.db.auth.sign_in_with_password({
            "email": self.settings.worker_email,
            "password": self.settings.worker_password,
        }))
        try:
            self.ensure_push_identity()
            self.process_push_deliveries()
        except Exception as error:
            LOG.warning("Web Push initialization is unavailable: %s", public_error(error))
        while not self.stopping:
            try:
                self.heartbeat("idle")
                try:
                    self.process_push_deliveries()
                except Exception:
                    LOG.warning("Pending completion notifications could not be checked.")
                job = self.claim()
                if job:
                    self.process(job)
                    if once:
                        return 0
                elif once:
                    LOG.info("No queued jobs.")
                    return 0
            except Exception as error:
                LOG.error("Queue check failed: %s", public_error(error))
                if once:
                    return 1
            for _ in range(max(1, int(self.settings.poll_seconds * 2))):
                if self.stopping:
                    break
                time.sleep(0.5)
        try:
            self.heartbeat("offline")
        except Exception:
            pass
        LOG.info("Worker stopped.")
        return 0


def iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def iso_after(*, minutes: int) -> str:
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def short_id(value: str) -> str:
    return value.split("-")[0]


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._ -]", "_", value)[:100]


def safe_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in {".mp3", ".m4a", ".wav", ".flac", ".ogg", ".webm", ".mp4"} else ".audio"


def vapid_public_key(vapid: Vapid01) -> str:
    raw = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def build_push_payload(kind: str, *, job_id: str, batch_id: str, batch_size: int = 1) -> dict[str, Any]:
    if kind == "failed":
        return {
            "title": "Class Scribe needs attention",
            "body": "A recording could not be processed. Click to review it.",
            "url": "/dashboard",
            "tag": f"job-{job_id}-failed",
        }
    if kind == "batch":
        noun = "recording is" if batch_size == 1 else "recordings are"
        return {
            "title": "Your class notes are ready",
            "body": f"All {batch_size} {noun} ready. Click to view your notes.",
            "url": f"/jobs/{job_id}" if batch_size == 1 else "/dashboard",
            "tag": f"batch-{batch_id}-completed",
        }
    return {
        "title": "Your class notes are ready",
        "body": "One transcription is complete. Click to view your notes.",
        "url": f"/jobs/{job_id}",
        "tag": f"job-{job_id}-completed",
    }


def push_error_message(error: Exception) -> str:
    if isinstance(error, WebPushException):
        status_code = getattr(getattr(error, "response", None), "status_code", None)
        return f"Push service returned HTTP {status_code}" if status_code else "Push service rejected the message"
    return type(error).__name__[:120]


def strip_thinking(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    fence = chr(96) * 3
    return text.strip().removeprefix(fence + "json").removesuffix(fence).strip()


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise RuntimeError("The local summary model returned invalid JSON") from None
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError:
            raise RuntimeError("The local summary model returned invalid JSON") from None
    if not isinstance(value, dict):
        raise RuntimeError("The local summary model returned an invalid result")
    return value


def clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()][:15]


def chunk_text(text: str, max_chars: int) -> list[str]:
    paragraphs = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(" ".join(current))
                current, length = [], 0
            chunks.extend(paragraph[index:index + max_chars] for index in range(0, len(paragraph), max_chars))
        elif current and length + len(paragraph) + 1 > max_chars:
            chunks.append(" ".join(current))
            current, length = [paragraph], len(paragraph)
        else:
            current.append(paragraph)
            length += len(paragraph) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks or [text]


def public_error(error: Exception) -> str:
    if isinstance(error, httpx.ConnectError):
        return "The local Ollama service is not available."
    message = str(error).replace("\n", " ").strip()
    if "service_role" in message.lower() or "authorization" in message.lower():
        return "Worker authentication failed. Check the local worker environment."
    return (message or type(error).__name__)[:300]


def main() -> int:
    parser = argparse.ArgumentParser(description="Class Scribe local queue worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    instance_handle = acquire_single_instance()
    if instance_handle is None:
        LOG.info("Another Class Scribe worker is already running; exiting.")
        return 0
    try:
        settings = Settings()
    except Exception:
        LOG.error("Worker configuration is missing or invalid. Copy .env.worker.example to .env.worker.local.")
        return 2
    worker = Worker(settings)
    def stop(_signum: int, _frame: Any) -> None:
        worker.stopping = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    return worker.run(once=args.once)


if __name__ == "__main__":
    raise SystemExit(main())
