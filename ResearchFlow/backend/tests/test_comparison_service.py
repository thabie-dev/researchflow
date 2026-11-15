import pytest

from app.services.comparison_service import ComparisonService


class TestComparisonService:
    def setup_method(self) -> None:
        self.service = ComparisonService()

    def test_identical_documents_have_full_similarity(self) -> None:
        result = self.service.compare(
            "first.txt",
            "Open science improves research",
            "second.txt",
            "Open science improves research",
        )

        assert result.similarity == pytest.approx(1.0)
        assert result.first.word_count == 4
        assert "science" in result.common_terms

    def test_unrelated_documents_have_zero_similarity(self) -> None:
        result = self.service.compare(
            "first.txt",
            "alpha beta gamma",
            "second.txt",
            "delta epsilon zeta",
        )

        assert result.similarity == 0.0
        assert result.common_terms == []

    def test_comparison_is_case_insensitive(self) -> None:
        result = self.service.compare(
            "first.txt",
            "Research DATA",
            "second.txt",
            "research data",
        )

        assert result.similarity == pytest.approx(1.0)

    def test_bulk_comparison_builds_symmetric_matrix(self) -> None:
        documents = [
            ("journal-a.txt", "research data methods"),
            ("journal-b.txt", "research data findings"),
            ("journal-c.txt", "history culture archives"),
        ]

        result = self.service.compare_many(documents)

        assert result.labels == ["journal-a.txt", "journal-b.txt", "journal-c.txt"]
        assert result.matrix[0] == [1.0, 0.6667, 0.0]
        assert result.matrix[0][1] == result.matrix[1][0]
        assert result.strongest_pairs[0].first_filename == "journal-a.txt"
        assert result.strongest_pairs[0].second_filename == "journal-b.txt"

    def test_bulk_comparison_makes_duplicate_filenames_unique(self) -> None:
        documents = [
            ("journal.txt", "alpha beta"),
            ("journal.txt", "alpha gamma"),
        ]

        result = self.service.compare_many(documents)

        assert result.labels == ["journal.txt", "journal.txt (2)"]
