from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfReader


class TestPdfExportApi:
    def test_project_export_returns_downloadable_pdf(self, client: TestClient) -> None:
        create_response = client.post("/api/projects", json={"name": "Evidence Review"})
        project_id = create_response.json()["id"]

        response = client.post(
            f"/api/projects/{project_id}/export/pdf",
            json={
                "font": "arial",
                "font_size": 11,
                "line_height": 1.5,
                "citation_style": "apa",
            },
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"] == 'attachment; filename="Evidence-Review.pdf"'
        assert response.content.startswith(b"%PDF")

        reader = PdfReader(BytesIO(response.content))
        extracted_text = ""
        for page in reader.pages:
            extracted_text += page.extract_text()
        assert "Evidence Review" in extracted_text
        assert "Concept Note" in extracted_text

    def test_missing_project_pdf_returns_not_found(self, client: TestClient) -> None:
        response = client.post("/api/projects/missing/export/pdf", json={})

        assert response.status_code == 404
