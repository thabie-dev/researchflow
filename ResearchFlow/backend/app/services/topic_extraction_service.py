from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
import math
import os
import re
from threading import Lock
import unicodedata


WHITESPACE_PATTERN = re.compile(r"\s+")
SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+")


class TopicExtractionError(RuntimeError):
    """Raised when BERTopic cannot build a topic model for the documents."""


@dataclass(frozen=True)
class ExtractedTopic:
    topic_id: int
    label: str
    keywords: list[str]
    score: float
    chunk_count: int


@dataclass(frozen=True)
class JournalTopicProfile:
    filename: str
    topics: list[ExtractedTopic]


@dataclass(frozen=True)
class TopicExtractionResult:
    engine: str
    preprocessing: list[str]
    global_topics: list[ExtractedTopic]
    journals: list[JournalTopicProfile]


class TextPreprocessingPipeline:
    """Normalizes text and creates bounded semantic chunks for BERTopic."""

    def __init__(self, target_words: int = 180, max_chunks_per_document: int = 20) -> None:
        self.target_words = target_words
        self.max_chunks_per_document = max_chunks_per_document

    def prepare(self, text: str) -> list[str]:
        normalized = unicodedata.normalize("NFKC", text).replace("\x00", " ")
        normalized = WHITESPACE_PATTERN.sub(" ", normalized).strip()
        if not normalized:
            return []

        sentences = SENTENCE_BOUNDARY_PATTERN.split(normalized)
        chunks = []
        current_sentences = []
        current_word_count = 0
        for sentence in sentences:
            word_count = len(sentence.split())
            if current_sentences and current_word_count + word_count > self.target_words:
                chunks.append(" ".join(current_sentences))
                current_sentences = []
                current_word_count = 0
                if len(chunks) >= self.max_chunks_per_document:
                    break
            current_sentences.append(sentence)
            current_word_count += word_count

        if current_sentences and len(chunks) < self.max_chunks_per_document:
            chunks.append(" ".join(current_sentences))
        return chunks


class TopicExtractionService:
    """Runs BERTopic and aggregates chunk topics back to each journal."""

    def __init__(
        self,
        model_factory: Callable[[int], object] | None = None,
        preprocessing_pipeline: TextPreprocessingPipeline | None = None,
    ) -> None:
        self.model_factory = model_factory or self._create_bertopic_model
        self.preprocessing_pipeline = preprocessing_pipeline or TextPreprocessingPipeline()
        self._embedding_model = None
        self._embedding_model_lock = Lock()

    def extract(self, documents: list[tuple[str, str]]) -> TopicExtractionResult:
        chunks = []
        source_indexes = []
        source_chunk_counts = Counter()
        for source_index, (_filename, text) in enumerate(documents):
            document_chunks = self.preprocessing_pipeline.prepare(text)
            for chunk in document_chunks:
                chunks.append(chunk)
                source_indexes.append(source_index)
                source_chunk_counts[source_index] += 1

        if len(chunks) < 2:
            raise TopicExtractionError("At least two readable text chunks are required for topic extraction.")

        try:
            model = self.model_factory(len(chunks))
            assigned_topics, _probabilities = model.fit_transform(chunks)
        except Exception as error:
            raise TopicExtractionError(f"BERTopic could not extract topics: {error}") from error

        topic_keywords = self._read_topic_keywords(model, assigned_topics)
        global_counts = Counter(assigned_topics)
        global_topics = self._build_ranked_topics(global_counts, topic_keywords, len(chunks), 10)

        journal_counts: dict[int, Counter] = {}
        for chunk_index, topic_id in enumerate(assigned_topics):
            source_index = source_indexes[chunk_index]
            if source_index not in journal_counts:
                journal_counts[source_index] = Counter()
            journal_counts[source_index][topic_id] += 1

        journals = []
        for source_index, (filename, _text) in enumerate(documents):
            counts = journal_counts.get(source_index, Counter())
            topics = self._build_ranked_topics(
                counts,
                topic_keywords,
                source_chunk_counts[source_index],
                5,
            )
            journals.append(JournalTopicProfile(filename=filename, topics=topics))

        return TopicExtractionResult(
            engine="BERTopic (all-MiniLM-L6-v2 + c-TF-IDF)",
            preprocessing=[
                "Unicode and whitespace normalization",
                "Semantic text chunking",
                "English stopword removal",
                "Unigram and bigram topic representation",
            ],
            global_topics=global_topics,
            journals=journals,
        )

    def _create_bertopic_model(self, chunk_count: int):
        os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")
        from bertopic import BERTopic
        from bertopic.dimensionality import BaseDimensionalityReduction
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import CountVectorizer

        cluster_count = max(2, min(10, round(math.sqrt(chunk_count))))
        cluster_count = min(cluster_count, chunk_count)
        vectorizer = CountVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            min_df=1,
        )
        cluster_model = KMeans(
            n_clusters=cluster_count,
            random_state=42,
            n_init=10,
        )
        return BERTopic(
            embedding_model=self._get_embedding_model(),
            umap_model=BaseDimensionalityReduction(),
            hdbscan_model=cluster_model,
            vectorizer_model=vectorizer,
            top_n_words=10,
            calculate_probabilities=False,
            verbose=False,
        )

    def _get_embedding_model(self):
        if self._embedding_model is not None:
            return self._embedding_model
        with self._embedding_model_lock:
            if self._embedding_model is None:
                from sentence_transformers import SentenceTransformer

                try:
                    self._embedding_model = SentenceTransformer(
                        "all-MiniLM-L6-v2",
                        local_files_only=True,
                    )
                except OSError as error:
                    raise RuntimeError(
                        "Transformer model cache is missing. Run "
                        "python backend/scripts/cache_topic_model.py before starting the API."
                    ) from error
        return self._embedding_model

    def _read_topic_keywords(self, model, assigned_topics: list[int]) -> dict[int, list[str]]:
        keywords_by_topic = {}
        for topic_id in set(assigned_topics):
            if topic_id == -1:
                continue
            representation = model.get_topic(topic_id) or []
            keywords = []
            for word, _weight in representation[:8]:
                clean_word = word.strip()
                if clean_word:
                    keywords.append(clean_word)
            keywords_by_topic[topic_id] = keywords
        return keywords_by_topic

    def _build_ranked_topics(
        self,
        counts: Counter,
        topic_keywords: dict[int, list[str]],
        total_chunks: int,
        limit: int,
    ) -> list[ExtractedTopic]:
        ranked = []
        for topic_id, chunk_count in counts.most_common():
            if topic_id == -1 or topic_id not in topic_keywords:
                continue
            keywords = topic_keywords[topic_id]
            label = " · ".join(keywords[:3]) or f"Topic {topic_id}"
            score = round(chunk_count / max(total_chunks, 1), 4)
            ranked.append(
                ExtractedTopic(
                    topic_id=topic_id,
                    label=label,
                    keywords=keywords,
                    score=score,
                    chunk_count=chunk_count,
                )
            )
            if len(ranked) >= limit:
                break
        return ranked
