from fastapi.testclient import TestClient


class TestComparisonApi:
    def test_text_uploads_return_cosine_similarity(self, client: TestClient) -> None:
        files = {
            "first_document": ("one.txt", b"research data analysis", "text/plain"),
            "second_document": ("two.md", b"research data methods", "text/markdown"),
        }

        response = client.post("/api/comparison", files=files)

        assert response.status_code == 200
        result = response.json()
        assert result["similarity"] == 0.6667
        assert result["common_terms"] == ["data", "research"]
        assert result["first"]["word_count"] == 3

    def test_unsupported_upload_returns_validation_error(self, client: TestClient) -> None:
        files = {
            "first_document": ("one.html", b"<p>research</p>", "text/html"),
            "second_document": ("two.txt", b"research", "text/plain"),
        }

        response = client.post("/api/comparison", files=files)

        assert response.status_code == 422
        assert "use one of" in response.json()["detail"]
