from io import BytesIO
from docx import Document
from docx.shared import Pt
from app.models.project import Project
from app.services.pdf_export_service import CITATION_LABELS, PlainTextHtmlParser

class WordExportService:
    """Builds a downloadable Word document."""

    def generate(
        self,
        project: Project,
        font: str,
        font_size: int,
        citation_style: str,
    ) -> bytes:
        document = Document()
        
        # Set default font for the Word document
        style = document.styles['Normal']
        word_fonts = {
            "times": "Times New Roman",
            "georgia": "Georgia",
            "arial": "Arial"
        }
        style.font.name = word_fonts.get(font, "Times New Roman")
        style.font.size = Pt(font_size)
        
        # Add Title
        document.add_heading(project.name, 0)
        
        # Iterate over stages and add headings/paragraphs
        for stage in project.stages:
            document.add_heading(stage.title, level=1)
            
            parser = PlainTextHtmlParser()
            parser.feed(stage.content_html)
            paragraphs = parser.text().splitlines()
            
            if not paragraphs:
                document.add_paragraph("Not started")
            else:
                for paragraph in paragraphs:
                    document.add_paragraph(paragraph)
                    
        # Add citation style footer
        citation_label = CITATION_LABELS.get(citation_style, citation_style)
        document.add_paragraph(f"\nCitation style: {citation_label}")
        
        # Save to bytes
        output = BytesIO()
        document.save(output)
        return output.getvalue()