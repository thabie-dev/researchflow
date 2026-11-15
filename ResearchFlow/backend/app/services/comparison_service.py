from collections import Counter
from dataclasses import dataclass
import math
import re


WORD_PATTERN = re.compile(r"[a-zA-Z0-9']+")


@dataclass(frozen=True)
class DocumentSummary:
    filename: str
    word_count: int
    unique_word_count: int
    preview: str


@dataclass(frozen=True)
class ComparisonResult:
    similarity: float
    common_terms: list[str]
    first: DocumentSummary
    second: DocumentSummary


@dataclass(frozen=True)
class SimilarityPair:
    first_filename: str
    second_filename: str
    similarity: float


@dataclass(frozen=True)
class BulkComparisonResult:
    labels: list[str]
    matrix: list[list[float]]
    documents: list[DocumentSummary]
    strongest_pairs: list[SimilarityPair]


class ComparisonService:
    """Compares normalized term-frequency vectors with cosine similarity."""

    def compare(
        self,
        first_filename: str,
        first_text: str,
        second_filename: str,
        second_text: str,
    ) -> ComparisonResult:
        first_tokens = self._tokenize(first_text)
        second_tokens = self._tokenize(second_text)
        first_vector = Counter(first_tokens)
        second_vector = Counter(second_tokens)
        similarity = self._cosine_similarity(first_vector, second_vector)
        common_terms = self._common_terms(first_vector, second_vector)

        return ComparisonResult(
            similarity=round(similarity, 4),
            common_terms=common_terms,
            first=self._summarize(first_filename, first_text, first_tokens),
            second=self._summarize(second_filename, second_text, second_tokens),
        )

    def compare_many(self, documents: list[tuple[str, str]]) -> BulkComparisonResult:
        """Build a symmetric cosine-similarity matrix for uploaded journals."""
        labels = self._unique_labels(documents)
        vectors = []
        summaries = []
        for index, (_filename, text) in enumerate(documents):
            tokens = self._tokenize(text)
            vectors.append(Counter(tokens))
            summaries.append(self._summarize(labels[index], text, tokens))

        matrix = []
        pairs = []
        for row_index, first_vector in enumerate(vectors):
            row = []
            for column_index, second_vector in enumerate(vectors):
                similarity = round(self._cosine_similarity(first_vector, second_vector), 4)
                row.append(similarity)
                if column_index > row_index:
                    pairs.append(
                        SimilarityPair(
                            first_filename=labels[row_index],
                            second_filename=labels[column_index],
                            similarity=similarity,
                        )
                    )
            matrix.append(row)

        pairs.sort(key=self._pair_sort_key)
        return BulkComparisonResult(
            labels=labels,
            matrix=matrix,
            documents=summaries,
            strongest_pairs=pairs[:10],
        )

    def _tokenize(self, text: str) -> list[str]:
        tokens = []
        for match in WORD_PATTERN.finditer(text.lower()):
            tokens.append(match.group(0))
        return tokens

    def _cosine_similarity(self, first: Counter, second: Counter) -> float:
        if not first or not second:
            return 0.0

        dot_product = 0
        for term, count in first.items():
            dot_product += count * second.get(term, 0)

        first_length = math.sqrt(sum(count * count for count in first.values()))
        second_length = math.sqrt(sum(count * count for count in second.values()))
        if first_length == 0 or second_length == 0:
            return 0.0
        return dot_product / (first_length * second_length)

    def _common_terms(self, first: Counter, second: Counter) -> list[str]:
        weighted_terms = []
        for term in first.keys() & second.keys():
            combined_frequency = first[term] + second[term]
            weighted_terms.append((term, combined_frequency))
        weighted_terms.sort(key=self._term_sort_key)

        terms = []
        for term, _frequency in weighted_terms[:12]:
            terms.append(term)
        return terms

    def _term_sort_key(self, item: tuple[str, int]) -> tuple[int, str]:
        term, frequency = item
        return (-frequency, term)

    def _pair_sort_key(self, pair: SimilarityPair) -> tuple[float, str, str]:
        return (-pair.similarity, pair.first_filename, pair.second_filename)

    def _unique_labels(self, documents: list[tuple[str, str]]) -> list[str]:
        counts: dict[str, int] = {}
        labels = []
        for filename, _text in documents:
            count = counts.get(filename, 0) + 1
            counts[filename] = count
            if count == 1:
                labels.append(filename)
            else:
                labels.append(f"{filename} ({count})")
        return labels

    def _summarize(self, filename: str, text: str, tokens: list[str]) -> DocumentSummary:
        preview = " ".join(text.split())[:240]
        return DocumentSummary(
            filename=filename,
            word_count=len(tokens),
            unique_word_count=len(set(tokens)),
            preview=preview,
        )
