from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.topic_extraction_service import (
    ExtractedTopic,
    JournalTopicProfile,
    TopicExtractionResult,
)


class StubTopicExtractionService:
    """Keeps API tests deterministic without loading a transformer model."""

    def extract(self, documents: list[tuple[str, str]]) -> TopicExtractionResult:
        topic = ExtractedTopic(
            topic_id=0,
            label="research · data · methods",
            keywords=["research", "data", "methods"],
            score=1.0,
            chunk_count=1,
        )
        journals = []
        for filename, _text in documents:
            journals.append(JournalTopicProfile(filename=filename, topics=[topic]))
        return TopicExtractionResult(
            engine="BERTopic test double",
            preprocessing=["English stopword removal"],
            global_topics=[topic],
            journals=journals,
        )


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        database_path=tmp_path / "test.db",
        frontend_origins=("http://localhost:5173",),
        max_upload_bytes=1024 * 1024,
    )
    application = create_app(settings)
    application.state.topic_extraction_service = StubTopicExtractionService()
    with TestClient(application) as test_client:
        yield test_client
