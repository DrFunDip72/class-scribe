import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from class_scribe_automation import (
    AutomationError,
    InferenceQueueBusy,
    PublishedAudio,
    TranscriptFormatterUnavailable,
    Settings,
    canonical_class_date,
    desktop_drive_json,
    expected_week_dates,
    format_transcript_markdown,
    merge_drive_files,
    note_class_scribe_id,
    parse_recording_name,
    quality_issues,
    render_note,
    resolve_drive_recording,
    same_drive_version,
    should_scan_drive,
)


class FilenameParsingTests(unittest.TestCase):
    modified = datetime(2026, 9, 14, 16, tzinfo=timezone.utc)

    def test_accepts_separator_and_case_variants(self) -> None:
        cases = {
            "HRM-391_2026-09-14.mp3": ("HRM-391", "2026-09-14", None),
            "hrm 391 lecture 9-14-26.MP3": ("HRM-391", "2026-09-14", None),
            "PSE390 September 14 2026.m4a": ("PSE-390", "2026-09-14", None),
            "pse 9-14.m4a": ("PSE-390", "2026-09-14", None),
            "PHIL_201 class 9.14.mp3": ("PHIL-201", "2026-09-14", None),
            "philo 201 9-14.m4a": ("PHIL-201", "2026-09-14", None),
            "Phil 9-14.m4a": ("PHIL-201", "2026-09-14", None),
            "strat 392 9-8.m4a": ("STRAT-392", "2026-09-08", None),
            "strategy 392 sept-16-2026 pt2.mp3": ("STRAT-392", "2026-09-16", 2),
        }
        for filename, expected in cases.items():
            with self.subTest(filename=filename):
                parsed = parse_recording_name(filename, self.modified)
                self.assertEqual((parsed.course_code, parsed.lecture_date.isoformat(), parsed.source_part), expected)

    def test_rejects_ambiguous_or_wrong_schedule(self) -> None:
        for filename in ("lecture 2026-09-14.mp3", "HRM391 PSE390 2026-09-14.mp3", "STRAT392 2026-09-14.mp3"):
            with self.subTest(filename=filename), self.assertRaises(AutomationError):
                parse_recording_name(filename, self.modified)

    def test_explicit_backfill_can_accept_an_off_schedule_date(self) -> None:
        parsed = parse_recording_name(
            "HRM 391 9-8.m4a",
            self.modified,
            enforce_schedule=False,
        )
        self.assertEqual(parsed.course_code, "HRM-391")
        self.assertEqual(parsed.lecture_date.isoformat(), "2026-09-08")


class PublishingTests(unittest.TestCase):
    def test_hybrid_listing_prefers_newest_version_and_local_ties(self) -> None:
        cloud_old = {"Path": "PHIL 9-14.m4a", "ModTime": "2026-09-14T23:00:00Z", "ID": "cloud-old"}
        cloud_only = {"Path": "cloud-only.m4a", "ModTime": "2026-09-14T23:00:00Z", "ID": "cloud-only"}
        desktop_new = {
            "Path": "phil 9-14.m4a", "ModTime": "2026-09-14T23:01:00+00:00",
            "ID": "desktop-new", "LocalPath": "G:/My Drive/URecorder/phil 9-14.m4a",
        }
        merged = merge_drive_files([desktop_new], [cloud_old, cloud_only])
        self.assertEqual([row["ID"] for row in merged], ["cloud-only", "desktop-new"])

    def test_one_day_early_recording_covers_scheduled_class(self) -> None:
        self.assertEqual(
            canonical_class_date(datetime(2026, 9, 8).date(), "STRAT-392"),
            datetime(2026, 9, 9).date(),
        )
        self.assertIsNone(canonical_class_date(datetime(2026, 9, 14).date(), "STRAT-392"))

    def test_desktop_drive_listing_is_stable_and_respects_minimum_age(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            recording = folder / "PSE 9-14.m4a"
            recording.write_bytes(b"audio")
            settings = Settings(
                supabase_url="https://example.supabase.co",
                supabase_publishable_key="test",
                worker_email="worker@example.com",
                worker_password="test",
                owner_email="owner@example.com",
                transcription_tier="high",
                drive_source="desktop",
                drive_desktop_folder=folder,
                rclone_path=None,
                fluxprompt_api_key=None,
                fluxprompt_api_url="https://example.com",
                fluxprompt_flow_id="test",
                site_url="https://example.com",
            )
            future = datetime.now(timezone.utc) + timedelta(days=3650)
            first = desktop_drive_json(settings, now=future)
            second = desktop_drive_json(settings, now=future)
            self.assertEqual(first, second)
            self.assertEqual(first[0]["Path"], recording.name)
            self.assertTrue(first[0]["ID"].startswith("desktop:"))

    def test_desktop_drive_listing_includes_numbered_reconnect_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            drive_root = Path(temporary)
            folder = drive_root / "URecorder"
            reconnect = drive_root / "URecorder (1)"
            folder.mkdir()
            reconnect.mkdir()
            (folder / "HRM 9-16.m4a").write_bytes(b"first")
            (reconnect / "PSE 9-16.m4a").write_bytes(b"second")
            settings = Settings(
                supabase_url="https://example.supabase.co",
                supabase_publishable_key="test",
                worker_email="worker@example.com",
                worker_password="test",
                owner_email="owner@example.com",
                transcription_tier="high",
                drive_source="desktop",
                drive_desktop_folder=folder,
                rclone_path=None,
                fluxprompt_api_key=None,
                fluxprompt_api_url="https://example.com",
                fluxprompt_flow_id="test",
                site_url="https://example.com",
            )
            rows = desktop_drive_json(settings, now=datetime.now(timezone.utc) + timedelta(days=1))
            self.assertEqual(sorted(row["Path"] for row in rows), ["HRM 9-16.m4a", "PSE 9-16.m4a"])
            reconnect_row = next(row for row in rows if row["Path"] == "PSE 9-16.m4a")
            self.assertIn("URecorder (1)", reconnect_row["LocalPath"])

    def test_drive_version_comparison_handles_postgres_timestamp_format(self) -> None:
        row = {"drive_file_id": "abc", "drive_modified_time": "2026-09-14T16:45:22.732+00:00"}
        drive_file = {"ID": "abc", "ModTime": "2026-09-14T16:45:22.732Z"}
        self.assertTrue(same_drive_version(row, drive_file))

    def test_quality_gate_detects_repetition(self) -> None:
        repeated = "this is the same repeated lecture phrase"
        result = {
            "transcript": " ".join([repeated] * 20),
            "summary": "This summary contains enough words to satisfy the minimum quality threshold for a normal completed class lecture.",
            "segments": [{"start": i * 5, "end": i * 5 + 4, "text": repeated} for i in range(20)],
        }
        issues = quality_issues({"duration_seconds": 100}, result)
        self.assertTrue(any("repeats" in issue for issue in issues))

    def test_quality_gate_ignores_malformed_segment_entries(self) -> None:
        result = {
            "transcript": "word " * 60,
            "summary": "This summary contains enough words to satisfy the minimum quality threshold for a normal completed class lecture.",
            "segments": [None, "bad-segment"],
        }
        issues = quality_issues({"duration_seconds": 100}, result)
        self.assertFalse(any("beyond the recording" in issue for issue in issues))

    def test_note_places_summary_before_transcript(self) -> None:
        ingestion = {"job_id": "00000000-0000-0000-0000-000000000001", "course_code": "HRM-391", "lecture_date": "2026-09-14"}
        result = {
            "summary": "Summary text.", "key_points": ["Point"], "action_items": [],
            "transcript": "Transcript text.", "segments": [{"start": 0, "text": "Transcript text."}],
            "transcription_model": "test", "summary_model": "test",
        }
        note = render_note(ingestion, result)
        self.assertLess(note.index("## Summary"), note.index("## Transcript"))
        self.assertIn("class_scribe_id:", note)

    def test_note_accepts_legacy_quoted_class_scribe_id(self) -> None:
        self.assertEqual(
            note_class_scribe_id('---\nclass_scribe_id: "00000000-0000-0000-0000-000000000001"\n---\n'),
            "00000000-0000-0000-0000-000000000001",
        )

    def test_note_includes_verified_public_audio(self) -> None:
        ingestion = {
            "job_id": "00000000-0000-0000-0000-000000000001",
            "course_code": "HRM-391",
            "lecture_date": "2026-09-14",
        }
        result = {
            "summary": "Summary text.", "key_points": ["Point"], "action_items": [],
            "transcript": "Transcript text.", "segments": [{"start": 0, "text": "Transcript text."}],
        }
        audio = PublishedAudio(
            "https://github.com/example/audio.mp3", "a" * 64, 12345, "2026-09-14.mp3"
        )
        note = render_note(ingestion, result, published_audio=audio)
        self.assertIn('public_audio_sha256: "' + ("a" * 64) + '"', note)
        self.assertIn("[Listen to or download the public MP3 recording]", note)
        self.assertLess(note.index("public MP3 recording"), note.index("## Summary"))

    def test_ai_formatted_transcript_preserves_every_source_segment(self) -> None:
        result = {
            "transcript": "Alpha one. Beta two. Gamma three. Delta four.",
            "segments": [
                {"start": 0, "end": 2, "text": "Alpha one."},
                {"start": 2, "end": 4, "text": "Beta two."},
                {"start": 4, "end": 6, "text": "Gamma three."},
                {"start": 6, "end": 8, "text": "Delta four."},
            ],
        }

        formatted = format_transcript_markdown(
            result,
            lambda _segments, _section, _total: {
                "heading": "Opening concepts",
                "paragraph_starts": [0, 2],
            },
        )

        self.assertTrue(formatted.used_ai)
        self.assertEqual(formatted.section_count, 1)
        self.assertEqual(formatted.paragraph_count, 2)
        self.assertIn("### Opening concepts", formatted.markdown)
        expected = (
            ("0:00:00", "Alpha one."),
            ("0:00:02", "Beta two."),
            ("0:00:04", "Gamma three."),
            ("0:00:06", "Delta four."),
        )
        for timestamp, text in expected:
            self.assertEqual(formatted.markdown.count(f"**({timestamp})** {text}"), 1)

    def test_formatted_transcript_falls_back_without_losing_content(self) -> None:
        result = {
            "transcript": "Alpha one. Beta two.",
            "segments": [
                {"start": 0, "end": 2, "text": "Alpha one."},
                {"start": 2, "end": 4, "text": "Beta two."},
            ],
        }

        def unavailable(_segments, _section, _total):
            raise RuntimeError("offline")

        formatted = format_transcript_markdown(result, unavailable)
        self.assertFalse(formatted.used_ai)
        self.assertIn("### Lecture discussion", formatted.markdown)
        self.assertEqual(formatted.markdown.count("Alpha one."), 1)
        self.assertEqual(formatted.markdown.count("Beta two."), 1)

    def test_formatter_retries_next_section_after_invalid_structure(self) -> None:
        calls = 0
        result = {
            "transcript": "First window. Second window.",
            "segments": [
                {"start": 0, "end": 2, "text": "First window."},
                {"start": 400, "end": 402, "text": "Second window."},
            ],
        }

        def unavailable(_segments, _section, _total):
            nonlocal calls
            calls += 1
            raise RuntimeError("offline")

        formatted = format_transcript_markdown(result, unavailable)
        self.assertEqual(calls, 2)
        self.assertEqual(formatted.section_count, 2)
        self.assertEqual(formatted.markdown.count("window."), 2)

    def test_formatter_stops_calling_model_after_unavailability(self) -> None:
        calls = 0
        result = {
            "transcript": "First window. Second window.",
            "segments": [
                {"start": 0, "end": 2, "text": "First window."},
                {"start": 400, "end": 402, "text": "Second window."},
            ],
        }

        def unavailable(_segments, _section, _total):
            nonlocal calls
            calls += 1
            raise TranscriptFormatterUnavailable("offline")

        format_transcript_markdown(result, unavailable)
        self.assertEqual(calls, 1)

    def test_formatter_does_not_swallow_queue_deferral(self) -> None:
        result = {
            "transcript": "First window.",
            "segments": [{"start": 0, "end": 2, "text": "First window."}],
        }

        def deferred(_segments, _section, _total):
            raise InferenceQueueBusy("busy")

        with self.assertRaises(InferenceQueueBusy):
            format_transcript_markdown(result, deferred)

    def test_drive_source_resolution_uses_original_filename_to_break_tie(self) -> None:
        files = [
            {"ID": "one", "Path": "phil 201 9-2.m4a", "ModTime": "2026-09-02T20:00:00Z"},
            {"ID": "two", "Path": "philo 201 9-2.m4a", "ModTime": "2026-09-02T20:00:00Z"},
        ]
        chosen = resolve_drive_recording(
            files,
            {
                "drive_file_id": None, "source_filename": None, "course_code": "PHIL-201",
                "lecture_date": "2026-09-02", "source_part": None,
            },
            {"original_filename": "philo_201_9-2.m4a"},
        )
        self.assertEqual(chosen["ID"], "two")

    def test_weekly_expectations(self) -> None:
        reference = datetime(2026, 9, 17).date()
        self.assertEqual(len(expected_week_dates(reference, "HRM-391")), 2)
        self.assertEqual(len(expected_week_dates(reference, "STRAT-392")), 1)

    def test_following_day_always_scans_for_late_drive_sync(self) -> None:
        tuesday = datetime(2026, 9, 15, 8, tzinfo=timezone.utc)
        self.assertTrue(should_scan_drive(tuesday, {"last_drive_scan": "2026-09-13T12:00:00+00:00"}))
        self.assertTrue(should_scan_drive(tuesday, {"last_drive_scan": "2026-09-14T12:00:00+00:00"}))
        friday = datetime(2026, 9, 18, 8, tzinfo=timezone.utc)
        self.assertFalse(should_scan_drive(friday, {}))


if __name__ == "__main__":
    unittest.main()
