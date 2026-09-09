import unittest

from compare_transcribers import normalized_words, safe_name, word_similarity


class TranscriberComparisonTests(unittest.TestCase):
    def test_safe_name(self) -> None:
        self.assertEqual(safe_name("HRM 391 / 9-2"), "HRM-391-9-2")

    def test_normalized_words(self) -> None:
        self.assertEqual(normalized_words("Dr. Smith's class!"), ["dr", "smith's", "class"])

    def test_word_similarity(self) -> None:
        self.assertEqual(word_similarity("same words", "same words"), 1.0)
        self.assertLess(word_similarity("Brigham Young", "Brigitte Young"), 1.0)


if __name__ == "__main__":
    unittest.main()
