import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from class_scribe_automation import (
    AutomationError,
    Settings,
    desktop_drive_json,
    expected_week_dates,
    parse_recording_name,
    quality_issues,
    render_note,
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


class PublishingTests(unittest.TestCase):
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

    def test_weekly_expectations(self) -> None:
        reference = datetime(2026, 9, 17).date()
        self.assertEqual(len(expected_week_dates(reference, "HRM-391")), 2)
        self.assertEqual(len(expected_week_dates(reference, "STRAT-392")), 1)

    def test_off_day_only_catches_up_after_missed_scan(self) -> None:
        tuesday = datetime(2026, 9, 15, 8, tzinfo=timezone.utc)
        self.assertTrue(should_scan_drive(tuesday, {"last_drive_scan": "2026-09-13T12:00:00+00:00"}))
        self.assertFalse(should_scan_drive(tuesday, {"last_drive_scan": "2026-09-14T12:00:00+00:00"}))


if __name__ == "__main__":
    unittest.main()
