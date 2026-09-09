"""Run three local Whisper configurations against one audio file.

This is an operator-only quality experiment. It never uploads audio or writes to
Supabase. Output stays under the ignored .transcriber-benchmarks directory unless
an explicit output directory is supplied.
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import types
from dataclasses import asdict, dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from statistics import fmean
from typing import Any

import numpy as np

from worker import ROOT, resolve_ffmpeg_path


@dataclass(frozen=True)
class TranscriberConfiguration:
    key: str
    model: str
    beam_size: int
    language: str | None
    condition_on_previous_text: bool = True


CONFIGURATIONS = (
    TranscriberConfiguration("baseline-small-beam1", "small", 1, None),
    TranscriberConfiguration("small-en-beam5", "small.en", 5, "en"),
    TranscriberConfiguration("medium-en-beam5", "medium.en", 5, "en"),
)

NEXT_GENERATION_CONFIGURATIONS = (
    TranscriberConfiguration("current-high-medium-en", "medium.en", 5, "en"),
    TranscriberConfiguration(
        "distil-large-v3",
        "distil-large-v3",
        5,
        "en",
        condition_on_previous_text=False,
    ),
    TranscriberConfiguration("turbo", "turbo", 5, "en"),
)

SUITES = {
    "production": CONFIGURATIONS,
    "next-gen": NEXT_GENERATION_CONFIGURATIONS,
}


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-.")
    return cleaned or "recording"


def normalized_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", text.lower())


def word_similarity(left: str, right: str) -> float:
    """Return pairwise word-sequence agreement, not transcription accuracy."""
    left_words = normalized_words(left)
    right_words = normalized_words(right)
    if not left_words and not right_words:
        return 1.0
    return SequenceMatcher(None, left_words, right_words).ratio()


def timestamp_overrun_seconds(
    segments: list[dict[str, Any]],
    audio_duration_seconds: float,
) -> float:
    """Return how far the last segment extends beyond the decoded audio."""
    final_end = max((float(item["end"]) for item in segments), default=0.0)
    return round(max(0.0, final_end - audio_duration_seconds), 3)


def words_starting_after_audio(
    segments: list[dict[str, Any]],
    audio_duration_seconds: float,
) -> int:
    """Count words in segments that begin after the decoded audio ends."""
    return sum(
        len(normalized_words(str(item["text"])))
        for item in segments
        if float(item["start"]) >= audio_duration_seconds
    )


def decode_audio(audio_path: Path, sampling_rate: int = 16_000) -> np.ndarray:
    ffmpeg = resolve_ffmpeg_path(os.environ.get("FFMPEG_PATH"))
    descriptor, raw_name = tempfile.mkstemp(prefix="class-scribe-benchmark-", suffix=".f32")
    os.close(descriptor)
    raw_path = Path(raw_name)
    command = [
        str(ffmpeg),
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
            raise RuntimeError("FFmpeg could not decode the benchmark recording")
        audio = np.fromfile(raw_path, dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError("No audio stream was found in the benchmark recording")
        return audio
    finally:
        raw_path.unlink(missing_ok=True)


def run_configuration(
    configuration: TranscriberConfiguration,
    audio: np.ndarray,
    sampling_rate: int = 16_000,
) -> dict[str, Any]:
    # The production worker uses this shim because Windows Smart App Control blocks
    # PyAV's unsigned extension. NumPy audio bypasses PyAV decoding entirely.
    if "av" not in sys.modules:
        sys.modules["av"] = types.ModuleType("av")
    from faster_whisper import WhisperModel

    print(
        f"Loading {configuration.model} on CPU INT8 "
        f"(beam {configuration.beam_size})...",
        flush=True,
    )
    started = time.monotonic()
    model = WhisperModel(configuration.model, device="cpu", compute_type="int8")
    options: dict[str, Any] = {
        "beam_size": configuration.beam_size,
        "vad_filter": True,
        "vad_parameters": {"min_silence_duration_ms": 500},
        "condition_on_previous_text": configuration.condition_on_previous_text,
    }
    if configuration.language:
        options["language"] = configuration.language
    try:
        segment_stream, info = model.transcribe(audio, **options)
        segments: list[dict[str, Any]] = []
        transcript_parts: list[str] = []
        for segment in segment_stream:
            text = segment.text.strip()
            if not text:
                continue
            transcript_parts.append(text)
            segments.append({
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": text,
                "avg_logprob": getattr(segment, "avg_logprob", None),
                "no_speech_prob": getattr(segment, "no_speech_prob", None),
                "compression_ratio": getattr(segment, "compression_ratio", None),
            })
        transcript = " ".join(transcript_parts).strip()
        if not transcript:
            raise RuntimeError("No speech was detected")
        elapsed = time.monotonic() - started
        logprobs = [
            float(item["avg_logprob"])
            for item in segments
            if item["avg_logprob"] is not None
        ]
        no_speech = [
            float(item["no_speech_prob"])
            for item in segments
            if item["no_speech_prob"] is not None
        ]
        duration_seconds = audio.size / sampling_rate
        return {
            "configuration": asdict(configuration),
            "detected_language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "audio_seconds": round(duration_seconds, 3),
            "elapsed_seconds": round(elapsed, 3),
            "real_time_factor": round(elapsed / duration_seconds, 4),
            "word_count": len(normalized_words(transcript)),
            "character_count": len(transcript),
            "segment_count": len(segments),
            "timestamp_overrun_seconds": timestamp_overrun_seconds(
                segments,
                duration_seconds,
            ),
            "words_starting_after_audio": words_starting_after_audio(
                segments,
                duration_seconds,
            ),
            "mean_avg_logprob": round(fmean(logprobs), 5) if logprobs else None,
            "mean_no_speech_probability": round(fmean(no_speech), 5) if no_speech else None,
            "transcript": transcript,
            "segments": segments,
        }
    finally:
        del model
        gc.collect()


def write_outputs(output_dir: Path, source: Path, results: list[dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=False)
    for result in results:
        key = result["configuration"]["key"]
        transcript_path = output_dir / f"{key}.md"
        transcript_path.write_text(
            "\n".join([
                f"# {source.name} — {key}",
                "",
                f"- Model: `{result['configuration']['model']}`",
                f"- Beam size: `{result['configuration']['beam_size']}`",
                f"- Language: `{result['configuration']['language'] or 'auto-detect'}`",
                (
                    "- Previous-text conditioning: "
                    f"`{result['configuration']['condition_on_previous_text']}`"
                ),
                f"- CPU time: `{result['elapsed_seconds']} seconds`",
                "",
                "## Transcript",
                "",
                result["transcript"],
                "",
            ]),
            encoding="utf-8",
        )
        (output_dir / f"{key}.segments.json").write_text(
            json.dumps(result["segments"], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    comparisons: list[dict[str, Any]] = []
    for left_index, left in enumerate(results):
        for right in results[left_index + 1:]:
            comparisons.append({
                "left": left["configuration"]["key"],
                "right": right["configuration"]["key"],
                "word_sequence_similarity": round(
                    word_similarity(left["transcript"], right["transcript"]),
                    5,
                ),
            })

    metrics = {
        "source_filename": source.name,
        "created_at": datetime.now().astimezone().isoformat(),
        "results": [
            {
                key: value
                for key, value in result.items()
                if key not in {"transcript", "segments"}
            }
            for result in results
        ],
        "comparisons": comparisons,
        "warning": (
            "Pairwise similarity measures model agreement, not accuracy. "
            "Use retained source audio or a human reference to judge correctness."
        ),
    }
    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    report_lines = [
        f"# Transcriber comparison — {source.name}",
        "",
        (
            "> Pairwise similarity measures agreement between models, not correctness. "
            "Listen to the retained source audio when choosing the production configuration."
        ),
        "",
        (
            "| Configuration | Model | Beam | Words | Seconds | "
            "Real-time factor | Timestamp overrun | Words after audio | Avg. log probability |"
        ),
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for result in results:
        config = result["configuration"]
        report_lines.append(
            f"| [{config['key']}]({config['key']}.md) | `{config['model']}` | "
            f"{config['beam_size']} | {result['word_count']} | "
            f"{result['elapsed_seconds']} | {result['real_time_factor']} | "
            f"{result['timestamp_overrun_seconds']}s | "
            f"{result['words_starting_after_audio']} | "
            f"{result['mean_avg_logprob'] if result['mean_avg_logprob'] is not None else 'n/a'} |"
        )
    report_lines.extend(["", "## Pairwise word-sequence similarity", ""])
    for comparison in comparisons:
        report_lines.append(
            f"- `{comparison['left']}` vs. `{comparison['right']}`: "
            f"{comparison['word_sequence_similarity']:.1%}"
        )
    report_lines.extend([
        "",
        "## Review checklist",
        "",
        "- Verify professor, student, institution, and company names.",
        "- Verify course-specific and technical vocabulary.",
        "- Compare quiet speech, prayers, room discussion, and overlapping speakers.",
        "- Check repeated phrases and invented speech during silence.",
        "- Choose a model only after comparing quality against processing time.",
        "",
    ])
    (output_dir / "comparison.md").write_text(
        "\n".join(report_lines),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Compare Class Scribe's baseline Whisper configuration with "
            "two higher-quality candidates."
        )
    )
    parser.add_argument("audio", type=Path, help="Local audio or video file to transcribe")
    parser.add_argument(
        "--suite",
        choices=tuple(SUITES),
        default="production",
        help=(
            "production compares the deployed baseline candidates; next-gen compares "
            "medium.en, distil-large-v3, and turbo"
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for private benchmark output (must not already exist)",
    )
    args = parser.parse_args()
    source = args.audio.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Audio file does not exist: {source}")
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir
        else ROOT / ".transcriber-benchmarks" / f"{safe_name(source.stem)}-{timestamp}"
    )
    if output_dir.exists():
        parser.error(f"Output directory already exists: {output_dir}")

    print(f"Decoding {source.name} once for all three configurations...", flush=True)
    audio = decode_audio(source)
    results: list[dict[str, Any]] = []
    for configuration in SUITES[args.suite]:
        result = run_configuration(configuration, audio)
        results.append(result)
        print(
            f"Finished {configuration.key}: {result['word_count']} words in "
            f"{result['elapsed_seconds']} seconds.",
            flush=True,
        )
    write_outputs(output_dir, source, results)
    print(f"Comparison report: {output_dir / 'comparison.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
