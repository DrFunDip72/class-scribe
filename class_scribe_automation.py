from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, TypeVar
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from supabase import Client, create_client


ROOT = Path(__file__).resolve().parent
STATE_ROOT = ROOT / ".worker-state"
SECRET_ROOT = ROOT / ".worker-secrets"
ENV_PATH = ROOT / ".env.worker.local"
RCLONE_CONFIG = SECRET_ROOT / "rclone.conf"
GITHUB_TOKEN_PATH = SECRET_ROOT / "github-course-export.token"
STATE_PATH = STATE_ROOT / "class-scribe-automation.json"
LOG_PATH = STATE_ROOT / "class-scribe-automation.log"
MOUNTAIN = ZoneInfo("America/Denver")
SUPPORTED_SOURCE_EXTENSIONS = {
    ".aac", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".webm"
}
COURSE_REPOSITORIES = {
    "HRM-391": "HRM-391",
    "PSE-390": "PSE-390",
    "STRAT-392": "STRAT-392",
    "PHIL-201": "PHIL-201",
}
COURSE_PATTERNS = {
    "HRM-391": (
        r"(?<![A-Z0-9])HRM[\W_]*391(?![A-Z0-9])",
        r"(?<![A-Z0-9])HUMAN[\W_]+RESOURCES?(?:[\W_]+MANAGEMENT)?[\W_]*391(?![A-Z0-9])",
    ),
    "PSE-390": (
        r"(?<![A-Z0-9])PSE[\W_]*390(?![A-Z0-9])",
        r"(?<![A-Z0-9])PSE(?![A-Z0-9])",
    ),
    "STRAT-392": (
        r"(?<![A-Z0-9])STRAT(?:EGY)?[\W_]*392(?![A-Z0-9])",
        r"(?<![A-Z0-9])STRATEGIC[\W_]+MANAGEMENT[\W_]*392(?![A-Z0-9])",
    ),
    "PHIL-201": (
        r"(?<![A-Z0-9])PHIL(?:O|OSOPHY)?[\W_]*201(?![A-Z0-9])",
        r"(?<![A-Z0-9])PHIL(?:O|OSOPHY)?(?![A-Z0-9])",
    ),
}
MONTHS = {
    "JAN": 1, "JANUARY": 1, "FEB": 2, "FEBRUARY": 2,
    "MAR": 3, "MARCH": 3, "APR": 4, "APRIL": 4,
    "MAY": 5, "JUN": 6, "JUNE": 6, "JUL": 7, "JULY": 7,
    "AUG": 8, "AUGUST": 8, "SEP": 9, "SEPT": 9, "SEPTEMBER": 9,
    "OCT": 10, "OCTOBER": 10, "NOV": 11, "NOVEMBER": 11,
    "DEC": 12, "DECEMBER": 12,
}
GITHUB_API = "https://api.github.com"
GITHUB_OWNER = "DrFunDip72"
FLUXPROMPT_INPUT_IDS = (
    "varInputNode_1785963273043_0.6691",
    "varInputNode_1785963273305_0.3299",
    "varInputNode_1787543733759_0.7895",
    "varInputNode_1787543754846_0.6423",
)
T = TypeVar("T")


@dataclass(frozen=True)
class ParsedRecording:
    course_code: str
    lecture_date: date
    source_part: int | None


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_publishable_key: str
    worker_email: str
    worker_password: str
    owner_email: str
    transcription_tier: str
    drive_source: str
    drive_desktop_folder: Path
    rclone_path: Path | None
    fluxprompt_api_key: str | None
    fluxprompt_api_url: str
    fluxprompt_flow_id: str
    site_url: str
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:4b"


@dataclass(frozen=True)
class FormattedTranscript:
    markdown: str
    section_count: int
    paragraph_count: int
    used_ai: bool


class AutomationError(RuntimeError):
    pass


class PublicNoteConflict(AutomationError):
    pass


def configure_logging() -> None:
    STATE_ROOT.mkdir(exist_ok=True)
    handler = RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler, logging.StreamHandler()])
    logging.getLogger("httpx").setLevel(logging.WARNING)


def read_env(path: Path = ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        raise AutomationError("The worker environment file is missing")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def find_rclone() -> Path:
    command = shutil.which("rclone")
    if command:
        return Path(command)
    profiles = {Path.home(), ROOT.parents[1]}
    candidates = [
        candidate
        for profile in profiles
        for candidate in (profile / "AppData/Local/Microsoft/WinGet/Packages").glob(
            "Rclone.Rclone_*/rclone-*-windows-amd64/rclone.exe"
        )
    ]
    if not candidates:
        raise AutomationError("rclone is not installed")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def load_settings() -> Settings:
    env = read_env()
    required = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "WORKER_EMAIL", "WORKER_PASSWORD")
    missing = [key for key in required if not env.get(key)]
    if missing:
        raise AutomationError("Worker configuration is incomplete")
    tier = env.get("DRIVE_IMPORT_TRANSCRIPTION_TIER", "high").lower()
    if tier not in {"fast", "balanced", "high"}:
        raise AutomationError("DRIVE_IMPORT_TRANSCRIPTION_TIER must be fast, balanced, or high")
    drive_source = env.get("DRIVE_IMPORT_SOURCE", "rclone").lower()
    if drive_source not in {"desktop", "rclone", "hybrid"}:
        raise AutomationError("DRIVE_IMPORT_SOURCE must be desktop, rclone, or hybrid")
    return Settings(
        supabase_url=env["SUPABASE_URL"],
        supabase_publishable_key=env["SUPABASE_PUBLISHABLE_KEY"],
        worker_email=env["WORKER_EMAIL"],
        worker_password=env["WORKER_PASSWORD"],
        owner_email=env.get("DRIVE_IMPORT_OWNER_EMAIL", "jmaximum72@gmail.com").lower(),
        transcription_tier=tier,
        drive_source=drive_source,
        drive_desktop_folder=Path(env.get("DRIVE_DESKTOP_FOLDER", r"G:\My Drive\URecorder")),
        rclone_path=find_rclone() if drive_source in {"rclone", "hybrid"} else None,
        fluxprompt_api_key=env.get("FLUXPROMPT_API_KEY") or None,
        fluxprompt_api_url=env.get("FLUXPROMPT_API_URL", "https://api.fluxprompt.ai/flux/api-v2"),
        fluxprompt_flow_id=env.get("FLUXPROMPT_FLOW_ID", "2000e2ec-450e-4da3-9d7f-0061adfe1c17"),
        site_url=env.get("SITE_URL", "https://class-scribe-ruddy.vercel.app"),
        ollama_url=env.get("OLLAMA_URL", "http://127.0.0.1:11434"),
        ollama_model=env.get("OLLAMA_MODEL", "qwen3:4b"),
    )


def retry(operation: Callable[[], T], attempts: int = 4) -> T:
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


def normalize_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    return "".join(char for char in normalized if not unicodedata.combining(char)).upper()


def _safe_date(year: int, month: int, day: int) -> date | None:
    if year < 100:
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_recording_name(
    name: str,
    modified_time: datetime,
    *,
    enforce_schedule: bool = True,
) -> ParsedRecording:
    stem = normalize_name(Path(name).stem)
    course_hits: list[tuple[str, tuple[int, int]]] = []
    for code, patterns in COURSE_PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, stem)
            if match:
                course_hits.append((code, match.span()))
                break
    courses = {code for code, _span in course_hits}
    if len(courses) != 1:
        raise AutomationError("The filename does not contain one unambiguous supported class")
    course_code = next(iter(courses))

    masked = stem
    for _code, (start, end) in sorted(course_hits, key=lambda item: item[1][0], reverse=True):
        masked = masked[:start] + (" " * (end - start)) + masked[end:]

    part_match = re.search(r"\b(?:PART|PT)[\W_]*0*([1-9][0-9]?)\b", masked)
    source_part = int(part_match.group(1)) if part_match else None
    if part_match:
        masked = masked[:part_match.start()] + " " * (part_match.end() - part_match.start()) + masked[part_match.end():]

    candidates: set[date] = set()
    for match in re.finditer(r"(?<!\d)(20\d{2})[\s._-]+(0?[1-9]|1[0-2])[\s._-]+(0?[1-9]|[12]\d|3[01])(?!\d)", masked):
        parsed = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if parsed:
            candidates.add(parsed)
    for match in re.finditer(r"(?<!\d)(0?[1-9]|1[0-2])[\s._-]+(0?[1-9]|[12]\d|3[01])[\s._-]+(20\d{2}|\d{2})(?!\d)", masked):
        parsed = _safe_date(int(match.group(3)), int(match.group(1)), int(match.group(2)))
        if parsed:
            candidates.add(parsed)

    month_names = "|".join(sorted(MONTHS, key=len, reverse=True))
    for match in re.finditer(
        rf"\b({month_names})[\s._-]+(0?[1-9]|[12]\d|3[01])(?:ST|ND|RD|TH)?(?:[,]?[\s._-]+(20\d{{2}}|\d{{2}}))?\b",
        masked,
    ):
        year = int(match.group(3)) if match.group(3) else modified_time.astimezone(MOUNTAIN).year
        parsed = _safe_date(year, MONTHS[match.group(1)], int(match.group(2)))
        if parsed:
            candidates.add(parsed)

    if not candidates:
        for match in re.finditer(r"(?<!\d)(0?[1-9]|1[0-2])[\s._-]+(0?[1-9]|[12]\d|3[01])(?![\s._-]*\d)", masked):
            parsed = _safe_date(modified_time.astimezone(MOUNTAIN).year, int(match.group(1)), int(match.group(2)))
            if parsed:
                if parsed > modified_time.astimezone(MOUNTAIN).date() + timedelta(days=45):
                    parsed = _safe_date(parsed.year - 1, parsed.month, parsed.day)
                if parsed:
                    candidates.add(parsed)

    if len(candidates) != 1:
        raise AutomationError("The filename does not contain one unambiguous lecture date")
    lecture_date = next(iter(candidates))
    if enforce_schedule and canonical_class_date(lecture_date, course_code) is None:
        raise AutomationError("The filename date does not match the configured class schedule")
    return ParsedRecording(course_code, lecture_date, source_part)


def canonical_class_date(lecture_date: date, course_code: str) -> date | None:
    """Map an observed recording date to its scheduled day, tolerating a one-day-early label."""
    allowed_weekdays = {2} if course_code == "STRAT-392" else {0, 2}
    if lecture_date.weekday() in allowed_weekdays:
        return lecture_date
    next_day = lecture_date + timedelta(days=1)
    return next_day if next_day.weekday() in allowed_weekdays else None


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"notified_issues": {}, "last_drive_scan": None, "last_audit_week": None}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, Any]) -> None:
    STATE_ROOT.mkdir(exist_ok=True)
    temporary = STATE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(temporary, STATE_PATH)


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def rclone_json(settings: Settings) -> list[dict[str, Any]]:
    if not RCLONE_CONFIG.exists():
        raise AutomationError("Google Drive authorization is missing")
    if settings.rclone_path is None:
        raise AutomationError("rclone is not configured as the Drive source")
    command = [
        str(settings.rclone_path), "--config", str(RCLONE_CONFIG), "lsjson", "urecorder:",
        "--recursive", "--files-only", "--hash", "--min-age", "10m",
        "--contimeout", "20s", "--timeout", "2m",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=5 * 60, check=False)
    if completed.returncode != 0:
        raise AutomationError("Google Drive listing failed")
    try:
        rows = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise AutomationError("Google Drive returned invalid metadata") from error
    return rows if isinstance(rows, list) else []


def desktop_drive_json(settings: Settings, now: datetime | None = None) -> list[dict[str, Any]]:
    folder = settings.drive_desktop_folder
    try:
        available = folder.is_dir()
    except OSError as error:
        raise AutomationError("Google Drive for desktop is not running or URecorder is unavailable") from error
    if not available:
        raise AutomationError("Google Drive for desktop is not running or URecorder is unavailable")
    minimum_age = (now or datetime.now(timezone.utc)) - timedelta(minutes=10)
    rows: list[dict[str, Any]] = []
    try:
        paths = sorted((path for path in folder.rglob("*") if path.is_file()), key=lambda path: str(path).casefold())
    except OSError as error:
        raise AutomationError("Google Drive for desktop could not list URecorder") from error
    for path in paths:
        try:
            stat = path.stat()
        except OSError:
            continue
        modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
        if modified > minimum_age:
            continue
        relative = path.relative_to(folder).as_posix()
        stable_id = hashlib.sha256(relative.casefold().encode("utf-8")).hexdigest()
        rows.append({
            "Path": relative,
            "ID": f"desktop:{stable_id}",
            "Size": stat.st_size,
            "ModTime": modified.isoformat(),
            "LocalPath": str(path),
        })
    return rows


def merge_drive_files(
    desktop_rows: list[dict[str, Any]],
    cloud_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge the two views by relative path, preferring the newest complete version."""
    merged: dict[str, dict[str, Any]] = {}
    for row in [*cloud_rows, *desktop_rows]:
        path = str(row.get("Path") or "").replace("\\", "/")
        if not path:
            continue
        key = path.casefold()
        current = merged.get(key)
        if current is None:
            merged[key] = row
            continue
        try:
            current_time = parse_timestamp(str(current.get("ModTime") or ""))
            candidate_time = parse_timestamp(str(row.get("ModTime") or ""))
        except ValueError:
            current_time = candidate_time = datetime.min.replace(tzinfo=timezone.utc)
        if candidate_time > current_time or (
            candidate_time == current_time and row.get("LocalPath") and not current.get("LocalPath")
        ):
            merged[key] = row
    return [merged[key] for key in sorted(merged)]


def list_drive_files(settings: Settings) -> list[dict[str, Any]]:
    if settings.drive_source == "desktop":
        return desktop_drive_json(settings)
    if settings.drive_source == "rclone":
        return rclone_json(settings)

    desktop_rows: list[dict[str, Any]] = []
    cloud_rows: list[dict[str, Any]] = []
    desktop_error: Exception | None = None
    cloud_error: Exception | None = None
    try:
        desktop_rows = desktop_drive_json(settings)
    except Exception as error:
        desktop_error = error
        logging.warning("Drive desktop listing unavailable; using cloud fallback")
    try:
        cloud_rows = rclone_json(settings)
    except Exception as error:
        cloud_error = error
        logging.warning("Drive cloud fallback unavailable; using desktop listing")
    if desktop_error and cloud_error:
        raise AutomationError("Both Google Drive discovery sources are unavailable")
    return merge_drive_files(desktop_rows, cloud_rows)


def download_drive_file(settings: Settings, remote_path: str, destination: Path) -> None:
    if settings.rclone_path is None:
        raise AutomationError("rclone is not configured as the Drive source")
    command = [
        str(settings.rclone_path), "--config", str(RCLONE_CONFIG), "copyto",
        f"urecorder:{remote_path}", str(destination), "--retries", "5",
        "--low-level-retries", "10", "--retries-sleep", "5s",
        "--contimeout", "20s", "--timeout", "5m", "--partial-suffix", ".partial",
    ]
    completed = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=3 * 60 * 60, check=False)
    if completed.returncode != 0 or not destination.exists():
        raise AutomationError("Google Drive download failed")


def materialize_drive_file(settings: Settings, drive_file: dict[str, Any], destination: Path) -> None:
    local_path = drive_file.get("LocalPath")
    if not local_path:
        download_drive_file(settings, str(drive_file["Path"]), destination)
        return
    source = Path(str(local_path))
    try:
        before = source.stat()
        shutil.copyfile(source, destination)
        after = source.stat()
    except OSError as error:
        raise AutomationError("Google Drive for desktop could not hydrate the recording") from error
    if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
        destination.unlink(missing_ok=True)
        raise AutomationError("The Google Drive recording changed while it was being copied")


def find_ffmpeg() -> str:
    command = shutil.which("ffmpeg")
    if command:
        return command
    profiles = {Path.home(), ROOT.parents[1]}
    candidates = [
        candidate
        for profile in profiles
        for candidate in (profile / "AppData/Local/Microsoft/WinGet/Packages").glob("Gyan.FFmpeg_*/**/ffmpeg.exe")
    ]
    if not candidates:
        raise AutomationError("FFmpeg is not installed")
    return str(max(candidates, key=lambda path: path.stat().st_mtime))


def prepare_audio(source: Path, output_root: Path) -> list[Path]:
    output_root.mkdir(parents=True, exist_ok=True)
    output_pattern = output_root / "part-%04d.m4a"
    command = [
        find_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k",
        "-f", "segment", "-segment_time", "600", "-reset_timestamps", "1", str(output_pattern),
    ]
    completed = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=4 * 60 * 60, check=False)
    if completed.returncode != 0:
        raise AutomationError("FFmpeg could not prepare the Drive recording")
    parts = sorted(output_root.glob("part-*.m4a"))
    if not parts or len(parts) > 32:
        raise AutomationError("Prepared audio produced an invalid number of parts")
    if any(part.stat().st_size < 1 or part.stat().st_size > 52_428_800 for part in parts):
        raise AutomationError("A prepared audio part is outside the Storage size limit")
    return parts


def connect_supabase(settings: Settings) -> Client:
    db = create_client(settings.supabase_url, settings.supabase_publishable_key)
    retry(lambda: db.auth.sign_in_with_password({"email": settings.worker_email, "password": settings.worker_password}))
    return db


def same_drive_version(row: dict[str, Any], drive_file: dict[str, Any]) -> bool:
    if str(row.get("drive_file_id")) != str(drive_file.get("ID")):
        return False
    try:
        left = parse_timestamp(str(row["drive_modified_time"])).astimezone(timezone.utc)
        right = parse_timestamp(str(drive_file["ModTime"])).astimezone(timezone.utc)
        return abs((left - right).total_seconds()) < 0.001
    except (KeyError, TypeError, ValueError):
        return False


def matching_existing_jobs(db: Client, parsed: ParsedRecording) -> list[dict[str, Any]]:
    window_start = datetime.combine(parsed.lecture_date - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    window_end = datetime.combine(parsed.lecture_date + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc)
    rows = retry(
        lambda: db.table("transcription_jobs")
        .select("id,user_id,original_filename,status,created_at")
        .gte("created_at", window_start.isoformat())
        .lt("created_at", window_end.isoformat())
        .in_("status", ["queued", "transcribing", "summarizing", "completed"])
        .execute()
    ).data or []
    matches: list[dict[str, Any]] = []
    for row in rows:
        try:
            existing = parse_recording_name(str(row.get("original_filename") or ""), parse_timestamp(str(row["created_at"])))
        except Exception:
            continue
        if (
            existing.course_code == parsed.course_code
            and existing.lecture_date == parsed.lecture_date
            and existing.source_part == parsed.source_part
        ):
            matches.append(row)
    return matches


def issue_once(settings: Settings, state: dict[str, Any], key: str, message: str) -> None:
    logging.warning("Automation review needed: %s", message)
    notified = state.setdefault("notified_issues", {})
    if key in notified:
        return
    if settings.fluxprompt_api_key:
        try:
            send_automation_email(
                settings,
                "Class Scribe needs your attention",
                "One automated class recording or course archive needs review. No recording name or transcript is included in this email. Open Class Scribe to review the saved work.",
            )
        except Exception:
            logging.warning("The automation review email could not be delivered")
    notified[key] = datetime.now(timezone.utc).isoformat()
    save_state(state)


def import_drive_files(
    settings: Settings,
    db: Client,
    state: dict[str, Any],
    *,
    only_paths: set[str] | None = None,
    force_new: bool = False,
) -> int:
    imported = 0
    cutoff: datetime | None = None
    if only_paths is None:
        cutoff_raw = state.get("import_not_before")
        if cutoff_raw:
            cutoff = parse_timestamp(str(cutoff_raw)).astimezone(timezone.utc)
        else:
            local_now = datetime.now(MOUNTAIN)
            cutoff = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            state["import_not_before"] = cutoff.isoformat()
            save_state(state)
    files = list_drive_files(settings)
    requested = {path.replace("\\", "/").casefold() for path in only_paths or set()}
    if requested:
        available = {str(row.get("Path") or "").replace("\\", "/").casefold() for row in files}
        missing = sorted(requested - available)
        if missing:
            raise AutomationError(f"Requested Drive recording was not found or is less than 10 minutes old: {missing[0]}")
    for drive_file in files:
        remote_path = str(drive_file.get("Path") or "")
        drive_id = str(drive_file.get("ID") or "")
        size = int(drive_file.get("Size") or 0)
        modified_raw = str(drive_file.get("ModTime") or "")
        if not remote_path or not drive_id or size < 1 or Path(remote_path).suffix.lower() not in SUPPORTED_SOURCE_EXTENSIONS:
            continue
        if requested and remote_path.replace("\\", "/").casefold() not in requested:
            continue
        issue_key = f"drive:{drive_id}:{modified_raw}"
        try:
            modified = parse_timestamp(modified_raw)
            if cutoff is not None and modified.astimezone(timezone.utc) < cutoff:
                continue
            parsed = parse_recording_name(
                Path(remote_path).name,
                modified,
                enforce_schedule=not requested,
            )
            if cutoff is not None and parsed.lecture_date < cutoff.astimezone(MOUNTAIN).date():
                continue
        except Exception as error:
            issue_once(settings, state, issue_key, str(error))
            continue

        existing = retry(
            lambda: db.table("drive_ingestions")
            .select("id,drive_file_id,drive_modified_time,status")
            .eq("drive_file_id", drive_id).execute()
        ).data or []
        if not force_new and any(same_drive_version(row, drive_file) for row in existing):
            continue

        logical_existing = retry(
            lambda: db.table("drive_ingestions")
            .select("id,source_filename,drive_size_bytes,source_part,status")
            .eq("course_code", parsed.course_code)
            .eq("lecture_date", parsed.lecture_date.isoformat())
            .execute()
        ).data or []
        if not force_new and any(
            normalize_name(str(row.get("source_filename") or "")) == normalize_name(Path(remote_path).name)
            and int(row.get("drive_size_bytes") or 0) == size
            and row.get("source_part") == parsed.source_part
            for row in logical_existing
        ):
            continue

        try:
            matching_jobs = [] if force_new else matching_existing_jobs(db, parsed)
            if len(matching_jobs) > 1:
                issue_once(settings, state, issue_key, "More than one existing Class Scribe job matches this Drive recording")
                continue
            if len(matching_jobs) == 1:
                linked = retry(lambda: db.rpc("link_drive_ingestion_to_existing_job", {
                    "p_owner_email": settings.owner_email,
                    "p_drive_file_id": drive_id,
                    "p_drive_modified_time": modified.isoformat(),
                    "p_drive_size_bytes": size,
                    "p_source_filename": Path(remote_path).name,
                    "p_course_code": parsed.course_code,
                    "p_lecture_date": parsed.lecture_date.isoformat(),
                    "p_source_part": parsed.source_part,
                    "p_job_id": matching_jobs[0]["id"],
                }).execute()).data or []
                if not linked:
                    raise AutomationError("The existing Class Scribe job could not be linked")
                state.setdefault("notified_issues", {}).pop(issue_key, None)
                save_state(state)
                logging.info("Linked Drive recording %s to an existing %s job", drive_id[-8:], parsed.course_code)
                continue
        except Exception:
            logging.exception("Drive recording %s could not be matched to existing work", drive_id[-8:])
            issue_once(settings, state, issue_key, "A Drive recording could not be matched to existing Class Scribe work")
            continue

        job_id = str(uuid.uuid4())
        with tempfile.TemporaryDirectory(prefix="class-scribe-drive-", dir=STATE_ROOT) as temporary:
            temp_root = Path(temporary)
            source = temp_root / f"source{Path(remote_path).suffix.lower()}"
            try:
                materialize_drive_file(settings, drive_file, source)
                if source.stat().st_size != size:
                    raise AutomationError("The downloaded Drive file size did not match its metadata")
                parts = prepare_audio(source, temp_root / "parts")
                response = retry(lambda: db.rpc("begin_drive_ingestion", {
                    "p_owner_email": settings.owner_email,
                    "p_drive_file_id": drive_id,
                    "p_drive_modified_time": modified.isoformat(),
                    "p_drive_size_bytes": size,
                    "p_source_filename": Path(remote_path).name,
                    "p_course_code": parsed.course_code,
                    "p_lecture_date": parsed.lecture_date.isoformat(),
                    "p_source_part": parsed.source_part,
                    "p_job_id": job_id,
                    "p_transcription_tier": settings.transcription_tier,
                }).execute())
                rows = response.data or []
                if not rows:
                    raise AutomationError("Supabase did not create the Drive ingestion")
                ingestion = rows[0]
                if ingestion.get("status") != "uploading":
                    continue
                job_id = str(ingestion["job_id"])
                manifests: list[dict[str, Any]] = []
                bucket = db.storage.from_("recordings")
                for index, part in enumerate(parts, start=1):
                    storage_path = f"{ingestion['user_id']}/{job_id}/part-{index:04d}.m4a"
                    options = {"content-type": "audio/mp4", "upsert": "true", "cache-control": "3600"}
                    retry(lambda p=part, sp=storage_path: bucket.upload(sp, p, options.copy()), attempts=5)
                    manifests.append({
                        "storage_path": storage_path,
                        "extension": "m4a",
                        "mime_type": "audio/mp4",
                        "size_bytes": part.stat().st_size,
                    })
                retry(lambda: db.rpc("queue_drive_ingestion", {
                    "p_ingestion_id": ingestion["id"], "p_parts": manifests,
                }).execute())
                imported += 1
                state.setdefault("notified_issues", {}).pop(issue_key, None)
                save_state(state)
                logging.info("Queued Drive recording %s for %s on %s", drive_id[-8:], parsed.course_code, parsed.lecture_date)
            except Exception as error:
                logging.exception("Drive recording %s could not be queued", drive_id[-8:])
                try:
                    rows = db.table("drive_ingestions").select("id").eq("job_id", job_id).execute().data or []
                    if rows:
                        db.table("drive_ingestions").update({"error_message": str(error)[:300]}).eq("id", rows[0]["id"]).execute()
                except Exception:
                    pass
                issue_once(settings, state, issue_key, "A Drive recording could not be queued")
    state["last_drive_scan"] = datetime.now(timezone.utc).isoformat()
    save_state(state)
    return imported


def quality_issues(job: dict[str, Any], result: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    transcript = str(result.get("transcript") or "").strip()
    summary = str(result.get("summary") or "").strip()
    segments = result.get("segments") if isinstance(result.get("segments"), list) else []
    if len(transcript.split()) < 50:
        issues.append("transcript is unexpectedly short")
    if len(summary.split()) < 12:
        issues.append("summary is unexpectedly short")
    if not segments:
        issues.append("timestamped segments are missing")
    normalized_segments = [
        re.sub(r"\W+", " ", str(segment.get("text") or "").lower()).strip()
        for segment in segments if isinstance(segment, dict)
    ]
    normalized_segments = [text for text in normalized_segments if len(text.split()) >= 4]
    if len(normalized_segments) >= 12:
        _text, count = Counter(normalized_segments).most_common(1)[0]
        if count >= 5 and count / len(normalized_segments) >= 0.18:
            issues.append("the transcript repeats one segment excessively")
    duration = float(job.get("duration_seconds") or 0)
    segment_ends = [float(segment.get("end") or 0) for segment in segments if isinstance(segment, dict)]
    if duration > 0 and segment_ends:
        last_end = max(segment_ends)
        if last_end > duration + max(30, duration * 0.03):
            issues.append("timestamps continue beyond the recording")
    return issues


def format_timestamp(seconds: float) -> str:
    whole = max(0, int(seconds))
    return f"{whole // 3600}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def transcript_segments(result: dict[str, Any]) -> list[dict[str, Any]]:
    raw_segments = result.get("segments") if isinstance(result.get("segments"), list) else []
    normalized: list[dict[str, Any]] = []
    for segment in raw_segments:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        normalized.append({
            "start": float(segment.get("start") or 0),
            "end": float(segment.get("end") or segment.get("start") or 0),
            "text": text,
        })
    return normalized


def chunk_transcript_segments(
    segments: list[dict[str, Any]],
    *,
    window_seconds: float = 360,
) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    chunk_start = 0.0
    for segment in segments:
        start = float(segment["start"])
        if current and start - chunk_start >= window_seconds:
            chunks.append(current)
            current = []
        if not current:
            chunk_start = start
        current.append(segment)
    if current:
        chunks.append(current)
    return chunks


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[1].strip()
    fence = chr(96) * 3
    cleaned = cleaned.removeprefix(fence + "json").removesuffix(fence).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise AutomationError("The transcript formatter returned invalid JSON") from None
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError:
            raise AutomationError("The transcript formatter returned invalid JSON") from None
    if not isinstance(value, dict):
        raise AutomationError("The transcript formatter returned an invalid result")
    return value


def request_transcript_structure(
    settings: Settings,
    segments: list[dict[str, Any]],
    section_number: int,
    section_count: int,
) -> dict[str, Any]:
    schema = {
        "type": "object",
        "properties": {
            "heading": {"type": "string"},
            "paragraph_starts": {"type": "array", "items": {"type": "integer"}},
        },
        "required": ["heading", "paragraph_starts"],
    }
    source = "\n".join(
        f"{index}|{format_timestamp(float(segment['start']))}|{segment['text']}"
        for index, segment in enumerate(segments)
    )
    prompt = (
        "Organize this class-transcript window without rewriting, correcting, summarizing, or omitting any words. "
        "Return JSON only. Supply a short factual topic heading and 3-8 paragraph_starts indexes. Indexes refer "
        "to the numbered source segments, must include 0, and should mark natural topic or paragraph boundaries. "
        "Do not return transcript text.\n\n"
        f"WINDOW {section_number}/{section_count}:\n{source}\n/no_think"
    )
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "format": schema,
        "options": {"temperature": 0.1, "num_ctx": 8192},
    }

    def request() -> dict[str, Any]:
        with httpx.Client(timeout=httpx.Timeout(180, connect=10)) as client:
            response = client.post(f"{settings.ollama_url.rstrip('/')}/api/generate", json=payload)
            response.raise_for_status()
            return response.json()

    raw = str(retry(request, attempts=2).get("response") or "").strip()
    if not raw:
        raise AutomationError("The transcript formatter returned no response")
    return _parse_json_object(raw)


def _validated_structure(plan: dict[str, Any], segment_count: int, fallback_heading: str) -> tuple[str, list[int]]:
    heading = re.sub(r"[\r\n#*_`]+", " ", str(plan.get("heading") or "")).strip()
    heading = re.sub(r"\s+", " ", heading)[:90].strip()
    if not heading:
        heading = fallback_heading
    raw_starts = plan.get("paragraph_starts")
    if not isinstance(raw_starts, list):
        raise AutomationError("The transcript formatter omitted paragraph boundaries")
    starts = sorted({
        value for value in raw_starts
        if isinstance(value, int) and not isinstance(value, bool) and 0 <= value < segment_count
    })
    if 0 not in starts:
        starts.insert(0, 0)
    if len(starts) > 10:
        raise AutomationError("The transcript formatter returned too many paragraph boundaries")
    return heading, starts


def _enforce_paragraph_size(
    segments: list[dict[str, Any]],
    requested_starts: list[int],
    *,
    max_words: int = 170,
) -> list[int]:
    starts = set(requested_starts)
    starts.add(0)
    words_in_paragraph = 0
    for index, segment in enumerate(segments):
        segment_words = max(1, len(str(segment["text"]).split()))
        if index in starts and index != 0:
            words_in_paragraph = 0
        elif words_in_paragraph and words_in_paragraph + segment_words > max_words:
            starts.add(index)
            words_in_paragraph = 0
        words_in_paragraph += segment_words
    return sorted(starts)


def format_transcript_markdown(
    result: dict[str, Any],
    planner: Callable[[list[dict[str, Any]], int, int], dict[str, Any]],
) -> FormattedTranscript:
    segments = transcript_segments(result)
    if not segments:
        fallback = str(result.get("transcript") or "").strip()
        return FormattedTranscript(fallback, 0, 1 if fallback else 0, False)

    chunks = chunk_transcript_segments(segments)
    markdown: list[str] = []
    rendered_identity: list[tuple[float, str]] = []
    paragraph_count = 0
    used_ai = True
    planner_available = True
    for section_index, chunk in enumerate(chunks, start=1):
        fallback_heading = f"Lecture discussion — {format_timestamp(float(chunk[0]['start']))}"
        try:
            if not planner_available:
                raise AutomationError("The transcript formatter is unavailable for this document")
            heading, requested_starts = _validated_structure(
                planner(chunk, section_index, len(chunks)), len(chunk), fallback_heading
            )
        except Exception as error:
            used_ai = False
            planner_available = False
            heading, requested_starts = fallback_heading, [0]
            logging.warning(
                "Transcript formatting section %d/%d used deterministic fallback (%s)",
                section_index,
                len(chunks),
                type(error).__name__,
            )
        starts = _enforce_paragraph_size(chunk, requested_starts)
        markdown.extend([f"### {heading}", ""])
        for start_index, end_index in zip(starts, starts[1:] + [len(chunk)], strict=True):
            paragraph: list[str] = []
            for segment in chunk[start_index:end_index]:
                text = str(segment["text"])
                timestamp = format_timestamp(float(segment["start"]))
                paragraph.append(f"**({timestamp})** {text}")
                rendered_identity.append((float(segment["start"]), text))
            markdown.extend([" ".join(paragraph), ""])
            paragraph_count += 1

    source_identity = [(float(segment["start"]), str(segment["text"])) for segment in segments]
    if rendered_identity != source_identity:
        raise AutomationError("Formatted transcript identity verification failed")
    return FormattedTranscript(
        "\n".join(markdown).rstrip(), len(chunks), paragraph_count, used_ai
    )


def render_note(
    ingestion: dict[str, Any],
    result: dict[str, Any],
    *,
    formatted_transcript: FormattedTranscript | None = None,
) -> str:
    course_title = str(ingestion["course_code"]).replace("-", " ")
    lecture_date = date.fromisoformat(str(ingestion["lecture_date"]))
    lines = [
        "---",
        f"class_scribe_id: {ingestion['job_id']}",
        f"course: {yaml_string(course_title)}",
        f"lecture_date: {lecture_date.isoformat()}",
        "source: google-drive-automation",
        f"transcription_model: {yaml_string(str(result.get('transcription_model') or 'unknown'))}",
        f"summary_model: {yaml_string(str(result.get('summary_model') or 'unknown'))}",
        f"transcript_formatting: {yaml_string('local-ai-structure-preserving' if formatted_transcript else 'raw-segments')}",
        "---",
        "",
        f"# {course_title} — {lecture_date.strftime('%B')} {lecture_date.day}, {lecture_date.year}",
        "",
        "## Summary",
        "",
        str(result.get("summary") or "").strip(),
        "",
        "## Key Points",
        "",
    ]
    key_points = result.get("key_points") if isinstance(result.get("key_points"), list) else []
    lines.extend(f"- {str(point).strip()}" for point in key_points if str(point).strip())
    if not key_points:
        lines.append("- No key points were generated.")
    lines.extend(["", "## Action Items", ""])
    action_items = result.get("action_items") if isinstance(result.get("action_items"), list) else []
    lines.extend(f"- {str(item).strip()}" for item in action_items if str(item).strip())
    if not action_items:
        lines.append("- No explicit assignments or action items were identified.")
    lines.extend(["", "## Transcript", ""])
    segments = transcript_segments(result)
    if formatted_transcript:
        lines.append(formatted_transcript.markdown)
    elif segments:
        for segment in segments:
            lines.append(f"({format_timestamp(float(segment.get('start') or 0))}) {str(segment['text']).strip()}")
    else:
        lines.append(str(result.get("transcript") or "").strip())
    return "\n".join(lines).rstrip() + "\n"


class GitHubClient:
    def __init__(self, token: str) -> None:
        self.client = httpx.Client(
            base_url=GITHUB_API,
            timeout=httpx.Timeout(30, connect=10),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Class-Scribe-Automation",
            },
        )

    def close(self) -> None:
        self.client.close()

    def get_note(self, repository: str, path: str) -> dict[str, Any] | None:
        response = self.client.get(f"/repos/{GITHUB_OWNER}/{repository}/contents/{quote(path, safe='/')}", params={"ref": "main"})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    def publish(self, repository: str, path: str, content: str, job_id: str) -> str:
        existing = self.get_note(repository, path)
        payload: dict[str, Any] = {
            "message": f"Add automated class notes for {Path(path).stem}",
            "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
            "branch": "main",
        }
        if existing:
            existing_text = base64.b64decode(existing.get("content", "")).decode("utf-8")
            if f"class_scribe_id: {job_id}" not in existing_text:
                raise PublicNoteConflict("A different note already exists at the target GitHub path")
            if existing_text == content:
                return str(existing["sha"])
            payload["sha"] = existing["sha"]
            payload["message"] = f"Refresh automated class notes for {Path(path).stem}"
        response = self.client.put(
            f"/repos/{GITHUB_OWNER}/{repository}/contents/{quote(path, safe='/')}", json=payload
        )
        response.raise_for_status()
        sha = str(response.json()["content"]["sha"])
        readback = self.get_note(repository, path)
        if not readback:
            raise AutomationError("GitHub readback failed")
        readback_bytes = base64.b64decode(readback.get("content", ""))
        if hashlib.sha256(readback_bytes).digest() != hashlib.sha256(content.encode("utf-8")).digest():
            raise AutomationError("GitHub content verification failed")
        return sha

    def note_paths(self, repository: str) -> list[str]:
        response = self.client.get(f"/repos/{GITHUB_OWNER}/{repository}/git/trees/main", params={"recursive": "1"})
        response.raise_for_status()
        return [
            str(item.get("path")) for item in response.json().get("tree", [])
            if item.get("type") == "blob" and str(item.get("path", "")).startswith("notes/")
        ]


def note_path(ingestion: dict[str, Any]) -> str:
    lecture_date = date.fromisoformat(str(ingestion["lecture_date"]))
    suffix = f"-part-{int(ingestion['source_part'])}" if ingestion.get("source_part") else ""
    return f"notes/{lecture_date.year}/{lecture_date.isoformat()}{suffix}.md"


def inference_queue_is_busy(db: Client) -> bool:
    rows = retry(
        lambda: db.table("transcription_jobs").select("id")
        .in_("status", ["queued", "transcribing", "summarizing"]).limit(1).execute()
    ).data or []
    return bool(rows)


def export_completed(settings: Settings, db: Client, state: dict[str, Any]) -> int:
    if not GITHUB_TOKEN_PATH.exists():
        raise AutomationError("The GitHub automation token is missing")
    token = GITHUB_TOKEN_PATH.read_text(encoding="utf-8").strip()
    github = GitHubClient(token)
    exported = 0
    try:
        queue_busy = inference_queue_is_busy(db)
        if queue_busy:
            logging.info("Deferring owner transcript formatting while the inference queue is active")
        ingestions = retry(
            lambda: db.table("drive_ingestions").select("*")
            .in_("status", ["queued", "processing", "completed"]).order("created_at").execute()
        ).data or []
        for ingestion in ingestions:
            job_rows = retry(
                lambda job_id=ingestion["job_id"]: db.table("transcription_jobs")
                .select("id,status,duration_seconds,error_code").eq("id", job_id).execute()
            ).data or []
            if not job_rows:
                continue
            job = job_rows[0]
            if job["status"] == "failed":
                db.table("drive_ingestions").update({"status": "failed", "error_message": "Transcription failed"}).eq("id", ingestion["id"]).execute()
                issue_once(settings, state, f"job:{ingestion['job_id']}:failed", "An imported transcription failed")
                continue
            if job["status"] in {"transcribing", "summarizing"}:
                if ingestion["status"] != "processing":
                    db.table("drive_ingestions").update({"status": "processing"}).eq("id", ingestion["id"]).execute()
                continue
            if job["status"] != "completed":
                continue
            results = retry(
                lambda job_id=ingestion["job_id"]: db.table("transcription_results")
                .select("*").eq("job_id", job_id).execute()
            ).data or []
            if not results:
                continue
            result = results[0]
            issues = quality_issues(job, result)
            if issues:
                message = "; ".join(issues)[:300]
                db.table("drive_ingestions").update({"status": "needs_review", "error_message": message}).eq("id", ingestion["id"]).execute()
                issue_once(settings, state, f"job:{ingestion['job_id']}:quality", "A completed transcription failed the publishing quality check")
                continue
            if queue_busy:
                continue
            repository = COURSE_REPOSITORIES[str(ingestion["course_code"])]
            path = note_path(ingestion)
            try:
                formatted = format_transcript_markdown(
                    result,
                    lambda chunk, section_number, section_count: request_transcript_structure(
                        settings, chunk, section_number, section_count
                    ),
                )
                content = render_note(ingestion, result, formatted_transcript=formatted)
                sha = retry(lambda: github.publish(repository, path, content, str(ingestion["job_id"])), attempts=3)
            except PublicNoteConflict as error:
                db.table("drive_ingestions").update({"status": "needs_review", "error_message": str(error)}).eq("id", ingestion["id"]).execute()
                issue_once(settings, state, f"job:{ingestion['job_id']}:conflict", str(error))
                continue
            db.table("drive_ingestions").update({
                "status": "exported", "github_repository": repository,
                "github_path": path, "github_sha": sha, "error_message": None,
            }).eq("id", ingestion["id"]).execute()
            exported += 1
            logging.info(
                "Published %s note for %s with %d transcript sections and %d paragraphs",
                repository,
                ingestion["lecture_date"],
                formatted.section_count,
                formatted.paragraph_count,
            )
    finally:
        github.close()
        token = ""
    return exported


def send_automation_email(settings: Settings, subject: str, message: str) -> None:
    if not settings.fluxprompt_api_key:
        return
    safe_message = html.escape(message)
    safe_url = html.escape(settings.site_url, quote=True)
    body = f"""<!doctype html><html><body style="margin:0;background:#f3f6f3;font-family:Arial,sans-serif;color:#15231e"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dfe7e2;border-radius:18px"><tr><td style="padding:24px 30px;background:#0e513c;color:#fff;font-size:20px;font-weight:700">Class Scribe</td></tr><tr><td style="padding:32px 30px"><h1 style="font-size:26px;margin:0 0 16px">{html.escape(subject)}</h1><p style="font-size:16px;line-height:1.6;color:#596761">{safe_message}</p><p><a href="{safe_url}" style="display:inline-block;padding:13px 20px;background:#187a59;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Open Class Scribe</a></p><p style="font-size:12px;color:#78837f;margin-top:24px">For privacy, this email contains no recording names, transcripts, or summaries.</p></td></tr></table></td></tr></table></body></html>"""
    values = (subject, body, settings.owner_email, "")
    payload = {"variableInputs": [
        {"inputId": input_id, "inputText": value}
        for input_id, value in zip(FLUXPROMPT_INPUT_IDS, values, strict=True)
    ]}
    with httpx.Client(timeout=httpx.Timeout(30, connect=10)) as client:
        response = client.post(
            settings.fluxprompt_api_url,
            params={"flowId": settings.fluxprompt_flow_id, "sessionId": f"class-scribe-automation-{uuid.uuid4()}"},
            headers={"api-key": settings.fluxprompt_api_key}, json=payload,
        )
        response.raise_for_status()


def expected_week_dates(reference: date, course_code: str) -> set[date]:
    monday = reference - timedelta(days=reference.weekday())
    offsets = (2,) if course_code == "STRAT-392" else (0, 2)
    return {
        monday + timedelta(days=offset)
        for offset in offsets
        if monday + timedelta(days=offset) <= reference
    }


def audit_repositories(
    settings: Settings,
    reference: date | None = None,
    *,
    send_email: bool = True,
) -> dict[str, Any]:
    reference = reference or datetime.now(MOUNTAIN).date()
    if not GITHUB_TOKEN_PATH.exists():
        raise AutomationError("The GitHub automation token is missing")
    token = GITHUB_TOKEN_PATH.read_text(encoding="utf-8").strip()
    github = GitHubClient(token)
    results: dict[str, Any] = {}
    problems = 0
    try:
        for course_code, repository in COURSE_REPOSITORIES.items():
            expected = expected_week_dates(reference, course_code)
            paths = github.note_paths(repository)
            monday = reference - timedelta(days=reference.weekday())
            sunday = monday + timedelta(days=6)
            dated_paths: dict[date, list[str]] = {}
            for path in paths:
                match = re.fullmatch(r"notes/\d{4}/(\d{4}-\d{2}-\d{2})(?:-part-\d+)?\.md", path)
                if not match:
                    continue
                try:
                    path_date = date.fromisoformat(match.group(1))
                except ValueError:
                    continue
                if monday <= path_date <= sunday:
                    dated_paths.setdefault(path_date, []).append(path)
            covered: dict[date, list[str]] = {}
            unexpected: list[date] = []
            for actual_day, items in dated_paths.items():
                class_day = canonical_class_date(actual_day, course_code)
                if class_day in expected:
                    covered.setdefault(class_day, []).extend(items)
                else:
                    unexpected.append(actual_day)
            missing = sorted(expected - set(covered))
            unexpected.sort()
            duplicates = {
                day.isoformat(): len(items)
                for day, items in covered.items()
                if len(items) > 1
            }
            problems += len(missing) + len(unexpected) + sum(count - 1 for count in duplicates.values())
            results[course_code] = {
                "expected": len(expected), "found": sum(len(items) for items in covered.values()),
                "missing": [day.isoformat() for day in missing],
                "unexpected": [day.isoformat() for day in unexpected],
                "duplicates": duplicates,
            }
    finally:
        github.close()
        token = ""

    rows = "".join(
        f"{course}: expected {details['expected']}, found {details['found']}. "
        for course, details in results.items()
    )
    subject = "Class Scribe weekly archive check"
    message = ("All expected weekly course notes are present. " if problems == 0 else f"The weekly archive check found {problems} missing course note(s). ") + rows
    if send_email:
        send_automation_email(settings, subject, message)
    logging.info("Weekly GitHub audit finished with %d missing note(s)", problems)
    week_start = reference - timedelta(days=reference.weekday())
    return {"week": week_start.isoformat(), "problems": problems, "courses": results}


def should_scan_drive(now: datetime, state: dict[str, Any]) -> bool:
    if now.weekday() in {0, 2}:
        return True
    if now.weekday() not in {1, 3}:
        return False
    previous_class_day = now.date() - timedelta(days=1)
    raw = state.get("last_drive_scan")
    if not raw:
        return True
    try:
        return parse_timestamp(str(raw)).astimezone(MOUNTAIN).date() < previous_class_day
    except ValueError:
        return True


def run_hourly(settings: Settings, force_import: bool = False) -> dict[str, int]:
    state = load_state()
    db = connect_supabase(settings)
    imported = 0
    scan_drive = force_import or should_scan_drive(datetime.now(MOUNTAIN), state)
    logging.info("Hourly automation pass started; Drive scan=%s", scan_drive)
    if scan_drive:
        imported = import_drive_files(settings, db, state)
    exported = export_completed(settings, db, state)
    logging.info("Hourly automation pass completed; imported=%d exported=%d", imported, exported)
    return {"imported": imported, "exported": exported}


def main() -> int:
    parser = argparse.ArgumentParser(description="Class Scribe Google Drive and GitHub automation")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run", help="Run the scheduled import/export pass")
    run_parser.add_argument("--force-import", action="store_true")
    parse_parser = subparsers.add_parser("parse", help="Preview filename parsing")
    parse_parser.add_argument("filename")
    import_parser = subparsers.add_parser(
        "import-path",
        help="Import one exact Drive path, including an owner-approved off-schedule backfill",
    )
    import_parser.add_argument("path")
    import_parser.add_argument(
        "--force-new",
        action="store_true",
        help="Queue a fresh job instead of linking matching Class Scribe work",
    )
    audit_parser = subparsers.add_parser("audit", help="Run the weekly GitHub audit")
    audit_parser.add_argument("--dry-run", action="store_true", help="Check repositories without sending email")
    args = parser.parse_args()
    configure_logging()
    try:
        if args.command == "parse":
            parsed = parse_recording_name(args.filename, datetime.now(timezone.utc))
            print(json.dumps({
                "course_code": parsed.course_code,
                "lecture_date": parsed.lecture_date.isoformat(),
                "source_part": parsed.source_part,
            }))
            return 0
        settings = load_settings()
        if args.command == "import-path":
            state = load_state()
            imported = import_drive_files(
                settings,
                connect_supabase(settings),
                state,
                only_paths={args.path},
                force_new=args.force_new,
            )
            print(json.dumps({"imported": imported}))
            return 0
        if args.command == "audit":
            print(json.dumps(audit_repositories(settings, send_email=not args.dry_run), indent=2))
            return 0
        print(json.dumps(run_hourly(settings, force_import=args.force_import)))
        return 0
    except Exception as error:
        logging.exception("Automation pass failed")
        print(f"Automation failed: {type(error).__name__}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
