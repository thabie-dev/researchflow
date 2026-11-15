import pytest

from app.services.topic_extraction_service import (
    TextPreprocessingPipeline,
    TopicExtractionError,
    TopicExtractionService,
)


class FakeTopicModel:
    def fit_transform(self, chunks: list[str]):
        topics = []
        for index, _chunk in enumerate(chunks):
            topics.append(index % 2)
        return topics, None

    def get_topic(self, topic_id: int):
        if topic_id == 0:
            return [("research", 0.8), ("data analysis", 0.6), ("methods", 0.4)]
        return [("publishing", 0.7), ("peer review", 0.5), ("journal", 0.3)]


class TestTextPreprocessingPipeline:
    def test_normalizes_and_chunks_document_text(self) -> None:
        pipeline = TextPreprocessingPipeline(target_words=5, max_chunks_per_document=3)

        chunks = pipeline.prepare(
            "First   research sentence has words. Second sentence discusses data. "
            "Third sentence discusses publishing."
        )

        assert len(chunks) == 3
        assert chunks[0] == "First research sentence has words."
        assert all("  " not in chunk for chunk in chunks)


class TestTopicExtractionService:
    def setup_method(self) -> None:
        pipeline = TextPreprocessingPipeline(target_words=5, max_chunks_per_document=4)
        self.service = TopicExtractionService(
            model_factory=self._fake_model_factory,
            preprocessing_pipeline=pipeline,
        )

    def test_returns_global_and_per_journal_topics(self) -> None:
        documents = [
            ("journal-a.txt", "Research methods are described. Data analysis follows."),
            ("journal-b.txt", "Peer review improves publishing. Journal findings follow."),
        ]

        result = self.service.extract(documents)

        assert result.engine.startswith("BERTopic")
        assert result.global_topics[0].label == "research · data analysis · methods"
        assert len(result.journals) == 2
        assert result.journals[0].filename == "journal-a.txt"
        assert result.journals[0].topics[0].keywords[0] == "research"
        assert "English stopword removal" in result.preprocessing

    def test_rejects_insufficient_readable_content(self) -> None:
        with pytest.raises(TopicExtractionError, match="two readable text chunks"):
            self.service.extract([("empty.txt", "")])

    def _fake_model_factory(self, _chunk_count: int) -> FakeTopicModel:
        return FakeTopicModel()
