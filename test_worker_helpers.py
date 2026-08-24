import unittest

from py_vapid import Vapid01

from worker import build_push_payload, chunk_text, clean_list, parse_json_object, safe_suffix, strip_thinking, vapid_public_key


class WorkerHelperTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
