import unittest

from compare_transcribers import (
    SUITES,
    normalized_words,
    safe_name,
    timestamp_overrun_seconds,
    word_similarity,
    words_starting_after_audio,
)


class TranscriberComparisonTests(unittest.TestCase):
    def test_safe_name(self) -> None:
        self.assertEqual(safe_name("HRM 391 / 9-2"), "HRM-391-9-2")

    def test_normalized_words(self) -> None:
        self.assertEqual(normalized_words("Dr. Smith's class!"), ["dr", "smith's", "class"])

    def test_word_similarity(self) -> None:
        self.assertEqual(word_similarity("same words", "same words"), 1.0)
        self.assertLess(word_similarity("Brigham Young", "Brigitte Young"), 1.0)

    def test_next_generation_suite_uses_distil_recommended_context_setting(self) -> None:
        configurations = {item.key: item for item in SUITES["next-gen"]}
        self.assertEqual(
            set(configurations),
            {"current-high-medium-en", "distil-large-v3", "turbo"},
        )
        self.assertFalse(configurations["distil-large-v3"].condition_on_previous_text)
        self.assertTrue(configurations["current-high-medium-en"].condition_on_previous_text)
        self.assertTrue(configurations["turbo"].condition_on_previous_text)

    def test_timestamp_overrun_metrics_flag_text_after_audio(self) -> None:
        segments = [
            {"start": 8.0, "end": 10.1, "text": "real ending"},
            {"start": 10.5, "end": 13.25, "text": "invented trailing words"},
        ]
        self.assertEqual(timestamp_overrun_seconds(segments, 10.0), 3.25)
        self.assertEqual(words_starting_after_audio(segments, 10.0), 3)


if __name__ == "__main__":
    unittest.main()
