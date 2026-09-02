"""Sequential local worker for Class Scribe.

Polls Supabase outbound, transcribes one recording with faster-whisper,
summarizes it with local Ollama, saves the result, and removes the source audio.
It never exposes a port or logs transcript content.
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import html
import json
import logging
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import types
import uuid
from pathlib import Path
from typing import Any, Callable, TypeVar

import httpx
import numpy as np
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from postgrest.types import ReturnMethod
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush
from supabase import Client, create_client

ROOT = Path(__file__).resolve().parent
VERSION = "1.4.1"
LOG = logging.getLogger("class-scribe-worker")
T = TypeVar("T")


def acquire_single_instance() -> object | None:
    """Hold a Windows named mutex so startup/manual launches cannot duplicate work."""
    if os.name != "nt":
        return object()

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    handle = kernel32.CreateMutexW(None, False, "Global\\ClassScribeQueueWorker")
    if not handle:
        error_code = ctypes.get_last_error()
        # A SYSTEM-owned global mutex may deny a non-elevated manual process
        # before Windows can report ERROR_ALREADY_EXISTS. In either case,
        # another worker owns the cross-session singleton.
        if error_code == 5:  # ERROR_ACCESS_DENIED
            return None
        raise OSError(error_code, "Could not create the worker mutex")
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
    fluxprompt_api_key: str | None = Field(default=None, alias="FLUXPROMPT_API_KEY")
    fluxprompt_api_url: str = Field(default="https://api.fluxprompt.ai/flux/api-v2", alias="FLUXPROMPT_API_URL")
    fluxprompt_flow_id: str = Field(default="2000e2ec-450e-4da3-9d7f-0061adfe1c17", alias="FLUXPROMPT_FLOW_ID")
    site_url: str = Field(default="https://class-scribe-ruddy.vercel.app", alias="SITE_URL")
    ffmpeg_path: str | None = Field(default=None, alias="FFMPEG_PATH")


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.db: Client = create_client(settings.supabase_url, settings.supabase_publishable_key)
        self.model: Any | None = None
        self.stopping = False
        self.temp_root = ROOT / ".worker-temp"
        self.temp_root.mkdir(exist_ok=True)
        self.secret_root = ROOT / ".worker-secrets"
        self.vapid_key_path = self.secret_root / "vapid_private_key.pem"
        self.vapid: Vapid01 | None = None
        self.ffmpeg_path: Path | None = None

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

    def enqueue_email_delivery(self, job: dict[str, Any], *, failed: bool = False) -> None:
        preference_rows = self.retry(
            lambda: self.db.table("notification_preferences")
            .select(
                "email_notifications_enabled,email_address,notify_each_recording,"
                "notify_batch_complete,notify_failures"
            )
            .eq("user_id", job["user_id"])
            .execute()
        ).data or []
        if not preference_rows:
            return
        preferences = preference_rows[0]
        recipient = preferences.get("email_address")
        if not preferences.get("email_notifications_enabled") or not recipient:
            return

        event_key: str | None = None
        delivery_kind: str | None = None
        batch_size = 1
        if failed:
            if preferences.get("notify_failures"):
                event_key = f"job:{job['id']}:failed:{job.get('attempt_count', 0)}"
                delivery_kind = "failed"
        elif preferences.get("notify_each_recording"):
            event_key = f"job:{job['id']}:completed"
            delivery_kind = "recording"
        elif preferences.get("notify_batch_complete"):
            batch_jobs = self.retry(
                lambda: self.db.table("transcription_jobs")
                .select("id,status").eq("batch_id", job["batch_id"]).execute()
            ).data or []
            if batch_jobs and all(item["status"] == "completed" for item in batch_jobs):
                event_key = f"batch:{job['batch_id']}:completed"
                delivery_kind = "batch"
                batch_size = len(batch_jobs)

        if not event_key or not delivery_kind:
            return

        event = {
            "job_id": job["id"],
            "user_id": job["user_id"],
            "state": "pending",
            "event_key": event_key,
            "delivery_kind": delivery_kind,
            "recipient": str(recipient).lower().strip(),
            "payload": {"batch_size": batch_size, "url": "/dashboard"},
            "attempt_count": 0,
            "next_attempt_at": iso_now(),
            "last_error": None,
            "delivered_at": None,
            "external_reference": None,
        }
        existing = self.retry(
            lambda: self.db.table("completion_events")
            .select("job_id").eq("job_id", job["id"]).execute()
        ).data or []
        if existing:
            self.retry(
                lambda: self.db.table("completion_events").update(
                    event, returning=ReturnMethod.minimal
                ).eq("job_id", job["id"]).execute()
            )
        else:
            self.retry(
                lambda: self.db.table("completion_events").insert(
                    event, returning=ReturnMethod.minimal
                ).execute()
            )

    def process_email_deliveries(self) -> None:
        if not self.settings.fluxprompt_api_key:
            return
        deliveries = self.retry(
            lambda: self.db.table("completion_events")
            .select("id,user_id,recipient,delivery_kind,payload,attempt_count")
            .in_("state", ["pending", "failed"])
            .lt("attempt_count", 3)
            .lte("next_attempt_at", iso_now())
            .order("created_at")
            .limit(20)
            .execute()
        ).data or []
        for delivery in deliveries:
            attempt_count = int(delivery["attempt_count"]) + 1
            try:
                preferences = self.retry(
                    lambda: self.db.table("notification_preferences")
                    .select("email_notifications_enabled,email_address")
                    .eq("user_id", delivery["user_id"])
                    .maybe_single()
                    .execute()
                ).data
                if (
                    not preferences
                    or not preferences.get("email_notifications_enabled")
                    or preferences.get("email_address") != delivery["recipient"]
                ):
                    self.retry(
                        lambda: self.db.table("completion_events").update({
                            "state": "delivered",
                            "delivered_at": iso_now(),
                            "last_error": None,
                            "external_reference": "email-disabled-before-delivery",
                        }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                    )
                    continue
                send_fluxprompt_email(self.settings, delivery)
            except Exception as error:
                self.retry(
                    lambda: self.db.table("completion_events").update({
                        "state": "failed",
                        "attempt_count": attempt_count,
                        "next_attempt_at": iso_after(minutes=min(60, 2 ** attempt_count)),
                        "last_error": email_error_message(error),
                    }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )
                LOG.warning("A completion email could not be delivered (attempt %d of 3).", attempt_count)
            else:
                self.retry(
                    lambda: self.db.table("completion_events").update({
                        "state": "delivered",
                        "attempt_count": attempt_count,
                        "delivered_at": iso_now(),
                        "last_error": None,
                        "external_reference": "fluxprompt-accepted",
                    }, returning=ReturnMethod.minimal).eq("id", delivery["id"]).execute()
                )

    def ensure_model(self) -> Any:
        if self.model is None:
            # faster-whisper imports PyAV even when callers provide an already-decoded
            # NumPy array. Smart App Control blocks PyAV's unsigned native extension on
            # this Windows host, so provide an inert import shim and decode with the
            # separately installed FFmpeg executable instead.
            if "av" not in sys.modules:
                sys.modules["av"] = types.ModuleType("av")
            from faster_whisper import WhisperModel

            LOG.info("Loading Whisper model '%s' on CPU (INT8).", self.settings.whisper_model)
            self.model = WhisperModel(self.settings.whisper_model, device="cpu", compute_type="int8")
            LOG.info("Whisper model loaded.")
        return self.model

    def ensure_ffmpeg(self) -> Path:
        if self.ffmpeg_path is None:
            self.ffmpeg_path = resolve_ffmpeg_path(self.settings.ffmpeg_path)
            LOG.info("Using FFmpeg for local audio decoding.")
        return self.ffmpeg_path

    def decode_audio(self, audio_path: Path, sampling_rate: int = 16_000) -> np.ndarray:
        raw_path = self.temp_root / f"{uuid.uuid4()}.f32"
        command = [
            str(self.ensure_ffmpeg()),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(audio_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(sampling_rate),
            "-f",
            "f32le",
            str(raw_path),
        ]
        try:
            completed = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False,
                timeout=4 * 60 * 60,
            )
            if completed.returncode != 0:
                raise RuntimeError("FFmpeg could not decode this recording")
            audio = np.fromfile(raw_path, dtype=np.float32)
            if audio.size == 0:
                raise RuntimeError("No audio stream was found in this recording")
            return audio
        except subprocess.TimeoutExpired as error:
            raise RuntimeError("FFmpeg timed out while decoding this recording") from error
        finally:
            raw_path.unlink(missing_ok=True)

    def job_parts(self, job: dict[str, Any]) -> list[dict[str, Any]]:
        parts = self.retry(
            lambda: self.db.table("transcription_job_parts")
            .select("part_index,storage_path,mime_type,size_bytes")
            .eq("job_id", job["id"])
            .order("part_index")
            .execute()
        ).data or []
        if parts:
            return parts
        return [{
            "part_index": 0,
            "storage_path": job["storage_path"],
            "mime_type": job["mime_type"],
            "size_bytes": job["size_bytes"],
        }]

    def download(self, storage_path: str, target: Path) -> None:
        content = self.retry(lambda: self.db.storage.from_("recordings").download(storage_path))
        target.write_bytes(content)

    def transcribe(
        self,
        job: dict[str, Any],
        audio_path: Path,
        *,
        part_index: int = 0,
        part_count: int = 1,
        timestamp_offset: float = 0,
    ) -> tuple[str, list[dict[str, Any]], str | None, float | None]:
        model = self.ensure_model()
        audio = self.decode_audio(audio_path)
        segments_iter, info = model.transcribe(
            audio,
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
                segments.append({
                    "start": round(timestamp_offset + float(segment.start), 2),
                    "end": round(timestamp_offset + float(segment.end), 2),
                    "text": text,
                })
            if time.monotonic() - last_touch > 45:
                part_fraction = min(1.0, float(segment.end) / duration) if duration else 0.4
                overall_fraction = (part_index + part_fraction) / max(1, part_count)
                stage = "Transcribing audio locally"
                if part_count > 1:
                    stage = f"Transcribing part {part_index + 1} of {part_count}"
                self.touch_job(
                    job["id"],
                    status="transcribing",
                    progress=10 + int(overall_fraction * 65),
                    stage=stage,
                )
                last_touch = time.monotonic()
            if self.stopping:
                raise InterruptedError("Worker is shutting down")
        transcript = " ".join(transcript_parts).strip()
        if not transcript:
            raise RuntimeError("No speech was detected in this recording")
        if duration is None and segments:
            duration = max(0.0, float(segments[-1]["end"]) - timestamp_offset)
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
                "You are creating faithful, scan-friendly study-guide notes from part of a class lecture. "
                "Return JSON only. Write a 2-4 sentence factual overview in summary. Create up to 10 ordered "
                "key points that capture only the concepts, definitions, processes, and examples stated in "
                "this lecture section. Prefer compact 'Concept — explanation' wording. Every statement must "
                "be directly supported by the supplied lecture text: never add background knowledge, likely "
                "details, or examples from outside it, and never pad a short section to reach a target count. Include "
                "explicit assignments, deadlines, questions, or study actions in action_items. "
                "Do not invent details. If there are no action items, use an empty array.\n\n"
                f"LECTURE SECTION {index + 1}/{len(chunks)}:\n{chunk}"
            )
            notes.append(self.ollama_json(prompt))
        if len(notes) == 1:
            return finalize_study_guide(notes[0])
        combined = json.dumps(notes, ensure_ascii=False)
        self.touch_job(job_id, status="summarizing", progress=94, stage="Combining lecture notes")
        combined_notes = self.ollama_json(
            "Combine these ordered section notes into one streamlined study guide. Return JSON only. "
            "Preserve lecture order and important facts while removing repetition. The summary must be a "
            "2-4 sentence overview. Produce up to 14 concise key points using 'Concept — explanation' wording "
            "where useful; prioritize core topics, definitions, comparisons, and process steps, and keep only "
            "the most instructive examples. Use only facts present in the supplied section notes, never outside "
            "knowledge, and do not pad the list to reach a target count. Include only "
            "genuine assignments or study actions in action_items; use an empty array when none exist.\n\n"
            f"SECTION NOTES:\n{combined}"
        )
        return finalize_study_guide(combined_notes)

    def complete(
        self,
        job: dict[str, Any],
        transcript: str,
        segments: list[dict[str, Any]],
        language: str | None,
        duration: float | None,
        notes: dict[str, Any],
        elapsed: float,
        storage_paths: list[str],
    ) -> None:
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
            self.retry(lambda: self.db.storage.from_("recordings").remove(storage_paths), attempts=3)
        except Exception:
            LOG.warning("Job %s completed, but source audio-part cleanup needs attention.", short_id(job["id"]))
        try:
            self.enqueue_push_deliveries(job)
            self.process_push_deliveries()
        except Exception:
            LOG.warning("Job %s completed, but its notification will be retried later.", short_id(job["id"]))
        try:
            self.enqueue_email_delivery(job)
            self.process_email_deliveries()
        except Exception:
            LOG.warning("Job %s completed, but its email will be retried later.", short_id(job["id"]))

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
        try:
            self.enqueue_email_delivery(job, failed=True)
            self.process_email_deliveries()
        except Exception:
            LOG.warning("The failure email for job %s will be retried later.", short_id(job["id"]))
        LOG.error("Job %s failed: %s", short_id(job["id"]), message)

    def process(self, job: dict[str, Any]) -> None:
        started = time.monotonic()
        temp_paths: list[Path] = []
        LOG.info("Starting job %s (%s).", short_id(job["id"]), safe_filename(job.get("original_filename", "")))
        try:
            self.heartbeat("processing", job["id"])
            parts = self.job_parts(job)
            part_count = len(parts)
            storage_paths = [str(part["storage_path"]) for part in parts]
            transcripts: list[str] = []
            segments: list[dict[str, Any]] = []
            language: str | None = None
            duration = 0.0

            for part_index, part in enumerate(parts):
                suffix = safe_suffix(str(part.get("storage_path", "recording.m4a")))
                fd, path_string = tempfile.mkstemp(
                    prefix=f"{job['id']}-part-{part_index + 1}-",
                    suffix=suffix,
                    dir=self.temp_root,
                )
                os.close(fd)
                audio_path = Path(path_string)
                temp_paths.append(audio_path)
                download_stage = "Downloading private audio"
                if part_count > 1:
                    download_stage = f"Downloading part {part_index + 1} of {part_count}"
                self.touch_job(
                    job["id"],
                    status="transcribing",
                    progress=7 + int((part_index / part_count) * 3),
                    stage=download_stage,
                )
                self.download(str(part["storage_path"]), audio_path)
                transcribe_stage = "Transcribing audio locally"
                if part_count > 1:
                    transcribe_stage = f"Transcribing part {part_index + 1} of {part_count}"
                self.touch_job(
                    job["id"],
                    status="transcribing",
                    progress=10 + int((part_index / part_count) * 65),
                    stage=transcribe_stage,
                )
                part_transcript, part_segments, part_language, part_duration = self.transcribe(
                    job,
                    audio_path,
                    part_index=part_index,
                    part_count=part_count,
                    timestamp_offset=duration,
                )
                transcripts.append(part_transcript)
                segments.extend(part_segments)
                if language is None and part_language:
                    language = part_language
                duration += part_duration or 0
                audio_path.unlink(missing_ok=True)

            transcript = " ".join(transcripts).strip()
            self.touch_job(job["id"], status="summarizing", progress=78, stage="Preparing study notes")
            notes = self.summarize(job["id"], transcript)
            self.complete(
                job,
                transcript,
                segments,
                language,
                duration or None,
                notes,
                time.monotonic() - started,
                storage_paths,
            )
            LOG.info("Completed job %s in %.1f seconds.", short_id(job["id"]), time.monotonic() - started)
        except Exception as error:
            self.fail(job, error)
        finally:
            for audio_path in temp_paths:
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
        if self.settings.fluxprompt_api_key:
            try:
                self.process_email_deliveries()
            except Exception:
                LOG.warning("Pending completion emails could not be checked.")
        else:
            LOG.info("Completion email delivery is disabled until FLUXPROMPT_API_KEY is configured.")
        while not self.stopping:
            try:
                self.heartbeat("idle")
                try:
                    self.process_push_deliveries()
                except Exception:
                    LOG.warning("Pending completion notifications could not be checked.")
                try:
                    self.process_email_deliveries()
                except Exception:
                    LOG.warning("Pending completion emails could not be checked.")
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


def resolve_ffmpeg_path(configured_path: str | None = None) -> Path:
    """Find the installed FFmpeg binary for both the owner and SYSTEM task."""
    candidates: list[Path] = []
    if configured_path:
        candidates.append(Path(configured_path).expanduser())

    on_path = shutil.which("ffmpeg")
    if on_path:
        candidates.append(Path(on_path))

    owner_root = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT.parent
    winget_root = owner_root / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if winget_root.exists():
        candidates.extend(winget_root.glob("Gyan.FFmpeg_*/*/bin/ffmpeg.exe"))
        candidates.extend(winget_root.glob("Gyan.FFmpeg_*/ffmpeg-*/bin/ffmpeg.exe"))
    candidates.extend([
        Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/ffmpeg/bin/ffmpeg.exe"),
    ])

    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError("FFmpeg is not installed or FFMPEG_PATH is invalid")


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
        body = (
            "Your recording is ready. Click to view your notes."
            if batch_size == 1
            else f"All {batch_size} recordings are ready. Click to view your notes."
        )
        return {
            "title": "Your class notes are ready",
            "body": body,
            "url": f"/jobs/{job_id}" if batch_size == 1 else "/dashboard",
            "tag": f"batch-{batch_id}-completed",
        }
    return {
        "title": "Your class notes are ready",
        "body": "One transcription is complete. Click to view your notes.",
        "url": f"/jobs/{job_id}",
        "tag": f"job-{job_id}-completed",
    }


FLUXPROMPT_INPUT_IDS = (
    "varInputNode_1785963273043_0.6691",
    "varInputNode_1785963273305_0.3299",
    "varInputNode_1787543733759_0.7895",
    "varInputNode_1787543754846_0.6423",
)


def build_email_content(kind: str, *, batch_size: int, site_url: str) -> tuple[str, str]:
    dashboard_url = f"{site_url.rstrip('/')}/dashboard"
    escaped_url = html.escape(dashboard_url, quote=True)
    if kind == "failed":
        subject = "A Class Scribe recording needs attention"
        eyebrow = "Processing update"
        headline = "A recording needs your attention"
        message = "We could not finish one recording. Open your private dashboard to review it or try again."
        button = "Review my dashboard"
    elif kind == "batch" and batch_size > 1:
        subject = "Your Class Scribe notes are ready"
        eyebrow = "Batch complete"
        headline = f"All {batch_size} recordings are ready"
        message = "Your private transcripts and study guides are waiting in Class Scribe."
        button = "View my class notes"
    else:
        subject = "Your Class Scribe notes are ready"
        eyebrow = "Notes ready"
        headline = "Your recording is ready"
        message = "Your private transcript and study guide are waiting in Class Scribe."
        button = "View my class notes"

    body = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{html.escape(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6f3;color:#15231e;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{html.escape(headline)} — open your private Class Scribe dashboard.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f6f3;">
      <tr>
        <td align="center" style="padding:36px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dfe7e2;border-radius:18px;box-shadow:0 12px 38px rgba(21,35,30,.08);overflow:hidden;">
            <tr>
              <td style="padding:26px 30px;background:#0e513c;color:#ffffff;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:42px;height:42px;border-radius:12px;background:#ffffff;color:#187a59;text-align:center;font-size:22px;font-weight:700;">CS</td>
                    <td style="padding-left:12px;font-size:18px;font-weight:700;letter-spacing:-.2px;">Class Scribe</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 30px 32px;">
                <p style="margin:0 0 10px;color:#187a59;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">{html.escape(eyebrow)}</p>
                <h1 style="margin:0 0 14px;color:#15231e;font-size:30px;line-height:1.18;letter-spacing:-.8px;">{html.escape(headline)}</h1>
                <p style="margin:0 0 26px;color:#596761;font-size:16px;line-height:1.65;">{html.escape(message)}</p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:10px;background:#187a59;">
                      <a href="{escaped_url}" style="display:inline-block;padding:14px 21px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">{html.escape(button)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:25px 0 0;color:#78837f;font-size:12px;line-height:1.6;">For privacy, this email contains no recording names, transcripts, or summaries. Sign in to Class Scribe to view your saved results.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px auto 0;max-width:520px;color:#89938f;font-size:11px;line-height:1.55;">You received this because email notifications are enabled in your Class Scribe account. You can turn them off from the dashboard.</p>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return subject, body


def build_fluxprompt_payload(subject: str, body: str, recipient: str) -> dict[str, Any]:
    values = (subject, body, recipient, "")
    return {
        "variableInputs": [
            {"inputId": input_id, "inputText": value}
            for input_id, value in zip(FLUXPROMPT_INPUT_IDS, values, strict=True)
        ]
    }


def extract_fluxprompt_response_text(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    inner = data.get("data")
    if isinstance(inner, dict):
        messages = inner.get("message")
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            text = messages[0].get("text")
            if isinstance(text, str) and text:
                return text
    for key in ("output", "result", "message", "text", "response", "content", "answer"):
        value = data.get(key)
        if isinstance(value, str) and value:
            return value
    for key in ("data", "outputs", "choices", "results"):
        nested = data.get(key)
        if not isinstance(nested, list) or not nested or not isinstance(nested[0], dict):
            continue
        item = nested[0]
        for item_key in ("text", "content", "output", "result", "message"):
            value = item.get(item_key)
            if isinstance(value, str) and value:
                return value
        message = item.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content:
                return content
    return None


def send_fluxprompt_email(settings: Settings, delivery: dict[str, Any]) -> str:
    if not settings.fluxprompt_api_key:
        raise RuntimeError("FluxPrompt email delivery is not configured")
    payload = delivery.get("payload") if isinstance(delivery.get("payload"), dict) else {}
    subject, body = build_email_content(
        str(delivery.get("delivery_kind") or "recording"),
        batch_size=max(1, int(payload.get("batch_size") or 1)),
        site_url=settings.site_url,
    )
    with httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        response = client.post(
            settings.fluxprompt_api_url,
            params={
                "flowId": settings.fluxprompt_flow_id,
                "sessionId": f"class-scribe-{delivery['id']}",
            },
            headers={"api-key": settings.fluxprompt_api_key},
            json=build_fluxprompt_payload(subject, body, str(delivery["recipient"])),
        )
        response.raise_for_status()
        try:
            response_data = response.json()
        except json.JSONDecodeError as error:
            raise RuntimeError("FluxPrompt returned an invalid response") from error
    response_text = extract_fluxprompt_response_text(response_data)
    if not response_text:
        raise RuntimeError("FluxPrompt returned no delivery confirmation")
    return response_text


def email_error_message(error: Exception) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        return f"Email service returned HTTP {error.response.status_code}"
    if isinstance(error, httpx.TimeoutException):
        return "Email service timed out"
    if isinstance(error, httpx.ConnectError):
        return "Email service is unavailable"
    return type(error).__name__[:120]


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


def finalize_study_guide(notes: dict[str, Any]) -> dict[str, Any]:
    summary = str(notes.get("summary", "")).strip()
    key_points = clean_list(notes.get("key_points"))
    regular_points: list[str] = []
    takeaway: str | None = None
    for point in key_points:
        if re.match(r"^big takeaway\s*(?:—|-|:)", point, flags=re.IGNORECASE):
            takeaway = point
        else:
            regular_points.append(point)
    if takeaway is None and summary:
        first_sentence = re.split(r"(?<=[.!?])\s+", summary, maxsplit=1)[0].strip()
        takeaway = f"Big takeaway — {first_sentence}"
    if takeaway:
        regular_points = regular_points[:14] + [takeaway]
    return {
        "summary": summary,
        "key_points": regular_points,
        "action_items": clean_list(notes.get("action_items")),
    }


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
    parser.add_argument("--test-email", metavar="ADDRESS", help="Send a sample completion email and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        settings = Settings()
    except Exception:
        LOG.error("Worker configuration is missing or invalid. Copy .env.worker.example to .env.worker.local.")
        return 2
    if args.test_email:
        recipient = args.test_email.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
            LOG.error("The test email address is invalid.")
            return 2
        try:
            send_fluxprompt_email(settings, {
                "id": f"test-{uuid.uuid4()}",
                "recipient": recipient,
                "delivery_kind": "batch",
                "payload": {"batch_size": 3},
            })
        except Exception as error:
            LOG.error("The sample completion email could not be sent: %s", email_error_message(error))
            return 1
        LOG.info("The sample completion email was accepted by FluxPrompt.")
        return 0
    instance_handle = acquire_single_instance()
    if instance_handle is None:
        LOG.info("Another Class Scribe worker is already running; exiting.")
        return 0
    worker = Worker(settings)
    def stop(_signum: int, _frame: Any) -> None:
        worker.stopping = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    return worker.run(once=args.once)


if __name__ == "__main__":
    raise SystemExit(main())
