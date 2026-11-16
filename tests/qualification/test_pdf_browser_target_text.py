"""Regression tests for page-local PDF text assertions in browser evidence."""

import tempfile
import unittest
from pathlib import Path

import pymupdf

from tests.qualification.phase5_pdf_browser_tools import assert_page_text


class TargetPageTextTests(unittest.TestCase):
    def make_pdf(self, target_text: str) -> Path:
        temp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        temp.close()
        path = Path(temp.name)
        with pymupdf.open() as document:
            first = document.new_page(width=595, height=842)
            first.insert_text((60, 80), target_text, fontname="helv", fontsize=18)
            second = document.new_page(width=595, height=842)
            second.insert_text((60, 80), "Ministry remains on an unedited page", fontname="helv", fontsize=18)
            document.save(path)
        self.addCleanup(path.unlink, missing_ok=True)
        return path

    def test_original_word_on_another_page_does_not_fail_target_assertion(self):
        candidate = self.make_pdf("hello")

        text = assert_page_text(candidate, 1, "hello", "Ministry")

        self.assertIn("hello", text)

    def test_original_word_on_the_edited_page_fails_target_assertion(self):
        candidate = self.make_pdf("hello Ministry")

        with self.assertRaises(AssertionError):
            assert_page_text(candidate, 1, "hello", "Ministry")


if __name__ == "__main__":
    unittest.main()
