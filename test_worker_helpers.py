import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from py_vapid import Vapid01

from worker import (
    FLUXPROMPT_INPUT_IDS,
    acquire_single_instance,
    build_email_content,
    build_fluxprompt_payload,
    build_push_payload,
    chunk_text,
    clean_list,
    email_error_message,
    extract_fluxprompt_response_text,
    finalize_study_guide,
    parse_json_object,
    safe_suffix,
    send_fluxprompt_email,
    strip_thinking,
    vapid_public_key,
)


class WorkerHelperTests(unittest.TestCase):
    @patch("worker.ctypes.get_last_error", return_value=5)
    @patch("worker.ctypes.WinDLL")
    def test_global_mutex_access_denied_means_worker_already_running(
        self,
        win_dll: MagicMock,
        _get_last_error: MagicMock,
    ) -> None:
        win_dll.return_value.CreateMutexW.return_value = 0
        self.assertIsNone(acquire_single_instance())
        self.assertEqual(
            win_dll.return_value.CreateMutexW.call_args.args[2],
            "Global\\ClassScribeQueueWorker",
        )

    def test_chunk_text_preserves_content(self) -> None:
        text = "First sentence. Second sentence. Third sentence."
        chunks = chunk_text(text, 22)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(" ".join(chunks), text)

    def test_strip_thinking_and_parse_json(self) -> None:
        raw = '<think>private reasoning</think>{"summary":"Ready","key_points":[],"action_items":[]}'
        parsed = parse_json_object(strip_thinking(raw))
        self.assertEqual(parsed["summary"], "Ready")

    def test_clean_list(self) -> None:
        self.assertEqual(clean_list([" one ", "", 2]), ["one", "2"])

    def test_finalize_study_guide_adds_last_takeaway(self) -> None:
        notes = finalize_study_guide({
            "summary": "CBT connects thoughts, feelings, and behaviors. Each can influence the others.",
            "key_points": ["Cognitive triad — Thoughts, feelings, and behaviors influence one another."],
            "action_items": [],
        })
        self.assertEqual(notes["key_points"][-1], "Big takeaway — CBT connects thoughts, feelings, and behaviors.")

    def test_safe_suffix(self) -> None:
        self.assertEqual(safe_suffix("lecture.MP3"), ".mp3")
        self.assertEqual(safe_suffix("lecture.exe"), ".audio")

    def test_vapid_public_key_is_browser_compatible(self) -> None:
        vapid = Vapid01()
        vapid.generate_keys()
        public_key = vapid_public_key(vapid)
        self.assertEqual(len(public_key), 87)
        self.assertNotIn("=", public_key)

    def test_push_payload_is_private_and_actionable(self) -> None:
        payload = build_push_payload(
            "batch",
            job_id="job-id",
            batch_id="batch-id",
            batch_size=12,
        )
        self.assertEqual(payload["url"], "/dashboard")
        self.assertIn("12 recordings", payload["body"])
        self.assertNotIn("transcript", payload["body"].lower())
        singular = build_push_payload("batch", job_id="job-id", batch_id="batch-id")
        self.assertEqual(singular["body"], "Your recording is ready. Click to view your notes.")

    def test_email_template_is_branded_private_and_actionable(self) -> None:
        subject, body = build_email_content(
            "batch",
            batch_size=12,
            site_url="https://class-scribe-ruddy.vercel.app/",
        )
        self.assertEqual(subject, "Your Class Scribe notes are ready")
        self.assertIn("All 12 recordings are ready", body)
        self.assertIn('href="https://class-scribe-ruddy.vercel.app/dashboard"', body)
        self.assertIn("Class Scribe", body)
        self.assertNotIn("sample.mp4", body)
        self.assertNotIn("signed", body.lower())

    def test_fluxprompt_payload_uses_exact_ordered_inputs(self) -> None:
        payload = build_fluxprompt_payload("Subject", "<p>Body</p>", "student@example.com")
        inputs = payload["variableInputs"]
        self.assertEqual([item["inputId"] for item in inputs], list(FLUXPROMPT_INPUT_IDS))
        self.assertEqual([item["inputText"] for item in inputs], ["Subject", "<p>Body</p>", "student@example.com", ""])

    def test_fluxprompt_response_parser_handles_primary_and_fallback_shapes(self) -> None:
        primary = {"status": "success", "data": {"message": [{"text": "Email sent"}]}}
        fallback = {"choices": [{"message": {"content": "Fallback sent"}}]}
        self.assertEqual(extract_fluxprompt_response_text(primary), "Email sent")
        self.assertEqual(extract_fluxprompt_response_text(fallback), "Fallback sent")
        self.assertIsNone(extract_fluxprompt_response_text({"data": {"message": []}}))

    def test_email_errors_do_not_expose_provider_response_content(self) -> None:
        self.assertEqual(email_error_message(httpx.ReadTimeout("private body")), "Email service timed out")
        self.assertEqual(email_error_message(RuntimeError("private body")), "RuntimeError")

    @patch("worker.httpx.Client")
    def test_fluxprompt_request_uses_header_flow_and_unique_session(self, client_class: MagicMock) -> None:
        response = MagicMock()
        response.json.return_value = {"data": {"message": [{"text": "accepted"}]}}
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        settings = SimpleNamespace(
            fluxprompt_api_key="local-test-key",
            fluxprompt_api_url="https://api.fluxprompt.ai/flux/api-v2",
            fluxprompt_flow_id="flow-id",
            site_url="https://class-scribe-ruddy.vercel.app",
        )
        result = send_fluxprompt_email(settings, {
            "id": "event-id",
            "recipient": "student@example.com",
            "delivery_kind": "recording",
            "payload": {"batch_size": 1},
        })
        self.assertEqual(result, "accepted")
        response.raise_for_status.assert_called_once_with()
        _, kwargs = client.post.call_args
        self.assertEqual(kwargs["headers"], {"api-key": "local-test-key"})
        self.assertEqual(kwargs["params"], {"flowId": "flow-id", "sessionId": "class-scribe-event-id"})
        self.assertEqual(kwargs["json"]["variableInputs"][2]["inputText"], "student@example.com")


if __name__ == "__main__":
    unittest.main()
