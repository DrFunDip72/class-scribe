import unittest

from worker import chunk_text, clean_list, parse_json_object, safe_suffix, strip_thinking


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


if __name__ == "__main__":
    unittest.main()
