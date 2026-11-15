from fastapi.testclient import TestClient


class TestBulkComparisonApi:
    def test_multiple_journals_return_similarity_matrix(self, client: TestClient) -> None:
        files = [
            ("documents", ("journal-a.txt", b"research data methods", "text/plain")),
            ("documents", ("journal-b.txt", b"research data findings", "text/plain")),
            ("documents", ("journal-c.md", b"history culture archives", "text/markdown")),
        ]

        response = client.post("/api/comparison/bulk", files=files)

        assert response.status_code == 200
        result = response.json()
        assert result["labels"] == ["journal-a.txt", "journal-b.txt", "journal-c.md"]
        assert result["matrix"] == [
            [1.0, 0.6667, 0.0],
            [0.6667, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ]
        assert len(result["documents"]) == 3
        assert result["strongest_pairs"][0]["similarity"] == 0.6667
        assert result["topic_extraction"]["engine"] == "BERTopic test double"
        assert len(result["topic_extraction"]["journals"]) == 3
        assert result["topic_extraction"]["global_topics"][0]["keywords"] == [
            "research",
            "data",
            "methods",
        ]

    def test_bulk_comparison_requires_two_documents(self, client: TestClient) -> None:
        files = [("documents", ("only.txt", b"one journal", "text/plain"))]

        response = client.post("/api/comparison/bulk", files=files)

        assert response.status_code == 422
        assert response.json()["detail"] == "Upload at least two journal documents."

    def test_bulk_comparison_rejects_more_than_thirty_documents(self, client: TestClient) -> None:
        files = []
        for index in range(31):
            filename = f"journal-{index}.txt"
            files.append(("documents", (filename, b"research", "text/plain")))

        response = client.post("/api/comparison/bulk", files=files)

        assert response.status_code == 422
        assert "no more than 30" in response.json()["detail"]
