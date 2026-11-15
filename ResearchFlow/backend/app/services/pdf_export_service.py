from html.parser import HTMLParser
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from app.models.project import Project


FONT_NAMES = {
    "times": "Times-Roman",
    "georgia": "Times-Roman",
    "arial": "Helvetica",
}

CITATION_LABELS = {
    "apa": "APA 7th (author-date)",
    "mla": "MLA 9th",
    "chicago": "Chicago notes-bibliography",
}


class PlainTextHtmlParser(HTMLParser):
    """Converts editor HTML to readable text without executing markup."""

    BLOCK_TAGS = {"p", "div", "h1", "h2", "h3", "li", "blockquote", "br"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "li":
            self.parts.append("\n• ")
        elif tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        lines = []
        for raw_line in "".join(self.parts).splitlines():
            clean_line = " ".join(raw_line.split())
            if clean_line:
                lines.append(clean_line)
        return "\n".join(lines)


class PdfExportService:
    """Builds a downloadable research report entirely on the server."""

    def generate(
        self,
        project: Project,
        font: str,
        font_size: int,
        line_height: float,
        citation_style: str,
    ) -> bytes:
        output = BytesIO()
        document = SimpleDocTemplate(
            output,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title=project.name,
            author="ResearchFlow",
        )
        styles = self._build_styles(font, font_size, line_height)
        story = [
            Paragraph(escape(project.name), styles["ReportTitle"]),
            Spacer(1, 10 * mm),
        ]

        for index, stage in enumerate(project.stages):
            if index > 0:
                story.append(PageBreak())
            story.append(Paragraph(escape(stage.title), styles["SectionTitle"]))
            story.append(Spacer(1, 4 * mm))
            paragraphs = self._extract_paragraphs(stage.content_html)
            if not paragraphs:
                paragraphs = ["Not started"]
            for paragraph in paragraphs:
                story.append(Paragraph(escape(paragraph), styles["BodyTextCustom"]))
                story.append(Spacer(1, 2.5 * mm))

        citation_label = CITATION_LABELS[citation_style]
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph(f"Citation style: {escape(citation_label)}", styles["CitationNote"]))
        document.build(story, onFirstPage=self._add_page_number, onLaterPages=self._add_page_number)
        return output.getvalue()

    def _build_styles(self, font: str, font_size: int, line_height: float) -> dict:
        sample_styles = getSampleStyleSheet()
        font_name = FONT_NAMES[font]
        return {
            "ReportTitle": ParagraphStyle(
                "ReportTitle",
                parent=sample_styles["Title"],
                fontName=font_name,
                fontSize=22,
                leading=28,
                alignment=TA_CENTER,
                textColor=colors.HexColor("#1e40af"),
            ),
            "SectionTitle": ParagraphStyle(
                "SectionTitle",
                parent=sample_styles["Heading1"],
                fontName=font_name,
                fontSize=17,
                leading=22,
                textColor=colors.HexColor("#1e293b"),
                spaceAfter=8,
            ),
            "BodyTextCustom": ParagraphStyle(
                "BodyTextCustom",
                parent=sample_styles["BodyText"],
                fontName=font_name,
                fontSize=font_size,
                leading=font_size * line_height,
                textColor=colors.HexColor("#1e293b"),
            ),
            "CitationNote": ParagraphStyle(
                "CitationNote",
                parent=sample_styles["BodyText"],
                fontName=font_name,
                fontSize=9,
                textColor=colors.HexColor("#64748b"),
            ),
        }

    def _extract_paragraphs(self, content_html: str) -> list[str]:
        parser = PlainTextHtmlParser()
        parser.feed(content_html)
        return parser.text().splitlines()

    def _add_page_number(self, canvas, document) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Page {document.page}")
        canvas.restoreState()
