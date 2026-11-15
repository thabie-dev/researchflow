from io import BytesIO
from pathlib import Path

from docx import Document
from fastapi import UploadFile
from pypdf import PdfReader


class UnsupportedDocumentError(ValueError):
    """Raised when an upload cannot be converted into text."""


class DocumentTooLargeError(ValueError):
    """Raised when an upload exceeds the configured limit."""


class DocumentReader:
    TEXT_EXTENSIONS = {".txt", ".md", ".csv"}
    SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | {".pdf", ".docx"}

    def __init__(self, max_upload_bytes: int) -> None:
        self.max_upload_bytes = max_upload_bytes

    async def read(self, upload: UploadFile) -> str:
        filename = upload.filename or "document"
        extension = Path(filename).suffix.lower()
        if extension not in self.SUPPORTED_EXTENSIONS:
            supported = ", ".join(sorted(self.SUPPORTED_EXTENSIONS))
            raise UnsupportedDocumentError(f"{filename}: use one of {supported}.")

        content = await upload.read(self.max_upload_bytes + 1)
        if len(content) > self.max_upload_bytes:
            limit_mb = self.max_upload_bytes // (1024 * 1024)
            raise DocumentTooLargeError(f"{filename}: file is larger than {limit_mb} MB.")

        try:
            if extension in self.TEXT_EXTENSIONS:
                text = content.decode("utf-8-sig")
            elif extension == ".pdf":
                text = self._read_pdf(content)
            else:
                text = self._read_docx(content)
        except (UnicodeDecodeError, OSError, ValueError) as error:
            raise UnsupportedDocumentError(f"Could not read text from {filename}.") from error

        clean_text = text.strip()
        if not clean_text:
            raise UnsupportedDocumentError(f"{filename}: no readable text was found.")
        return clean_text

    def _read_pdf(self, content: bytes) -> str:
        reader = PdfReader(BytesIO(content))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(pages)

    def _read_docx(self, content: bytes) -> str:
        document = Document(BytesIO(content))
        paragraphs = []
        for paragraph in document.paragraphs:
            paragraphs.append(paragraph.text)
        return "\n".join(paragraphs)
