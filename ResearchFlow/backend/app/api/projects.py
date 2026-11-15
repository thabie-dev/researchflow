import os
import re
import sqlite3
import asyncio
import shutil

from typing import Annotated
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status, BackgroundTasks, UploadFile, File, Form
from typing import Dict, List
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel

from app.core.config import Settings
from app.api.dependencies import get_project_service
from app.schemas import PdfExportRequest, ProjectCreate, ProjectRename, ProjectResponse, StageSave
from app.services.pdf_export_service import PdfExportService
from app.services.word_export_service import WordExportService
from app.services.project_service import ProjectNotFoundError, ProjectService
from app.services.scraper import PipelinePaperScraper
from app.services.github_scout import GitHubToolScout

from app.services.storage import load_search_strings
from app.services.nlp_service import NLPService
from app.core.config import Settings

# Global dictionary to track active cancel requests across the app
# Format: {"project_id": True/False}
CANCEL_FLAGS: Dict[str, bool] = {}

router = APIRouter()
DB_PATH = Settings.from_environment().database_path

# Unify the DB Path with the rest of the application
DB_PATH = Settings.from_environment().database_path

router = APIRouter(prefix="/projects", tags=["projects"])
ProjectServiceDependency = Annotated[ProjectService, Depends(get_project_service)]

class PdfScrapePayload(BaseModel):
    target_count: int = 50

@router.get("", response_model=list[ProjectResponse], response_model_by_alias=True)
def list_projects(service: ProjectServiceDependency):
    return service.list_projects()

@router.post(
    "",
    response_model=ProjectResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_project(payload: ProjectCreate, service: ProjectServiceDependency):
    return service.create_project(payload.name)

@router.patch("/{project_id}", response_model=ProjectResponse, response_model_by_alias=True)
def rename_project(project_id: str, payload: ProjectRename, service: ProjectServiceDependency):
    try:
        return service.rename_project(project_id, payload.name)
    except (ProjectNotFoundError, ValueError) as error:
        raise _project_error(error) from error

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, service: ProjectServiceDependency) -> Response:
    try:
        service.delete_project(project_id)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.put(
    "/{project_id}/stages/{stage_id}",
    response_model=ProjectResponse,
    response_model_by_alias=True,
)
def save_stage(
    project_id: str,
    stage_id: str,
    payload: StageSave,
    service: ProjectServiceDependency,
):
    try:
        return service.save_stage(project_id, stage_id, payload.contentHTML)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error

@router.post(
    "/{project_id}/stages/{stage_id}/versions",
    response_model=ProjectResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def save_version(
    project_id: str,
    stage_id: str,
    payload: StageSave,
    service: ProjectServiceDependency,
):
    try:
        return service.save_version(project_id, stage_id, payload.contentHTML)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error

@router.post(
    "/{project_id}/stages/{stage_id}/versions/{version_id}/restore",
    response_model=ProjectResponse,
    response_model_by_alias=True,
)
def restore_version(
    project_id: str,
    stage_id: str,
    version_id: int,
    service: ProjectServiceDependency,
):
    try:
        return service.restore_version(project_id, stage_id, version_id)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error

# --- PDF Export Endpoints ---

@router.post("/{project_id}/export/pdf", response_class=StreamingResponse)
def export_project_pdf(
    project_id: str,
    payload: PdfExportRequest,
    service: ProjectServiceDependency,
) -> StreamingResponse:
    try:
        project = service.get_project(project_id)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error

    pdf_bytes = PdfExportService().generate(
        project=project,
        font=payload.font,
        font_size=payload.font_size,
        line_height=payload.line_height,
        citation_style=payload.citation_style,
    )
    filename = _safe_filename(project.name, "pdf")
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)

@router.post("/{project_id}/export/word", response_class=StreamingResponse)
def export_project_word(
    project_id: str,
    payload: PdfExportRequest, 
    service: ProjectServiceDependency,
) -> StreamingResponse:
    try:
        project = service.get_project(project_id)
    except ProjectNotFoundError as error:
        raise _project_error(error) from error

    word_bytes = WordExportService().generate(
        project=project,
        font=payload.font,
        font_size=payload.font_size,
        citation_style=payload.citation_style,
    )
    filename = _safe_filename(project.name, "docx")
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        BytesIO(word_bytes), 
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
        headers=headers
    )

# --- Automated PDF Scraping Endpoints ---

@router.post("/{project_id}/scrape-pdfs")
async def scrape_pdfs(project_id: str, payload: PdfScrapePayload, background_tasks: BackgroundTasks):
    scraper = PipelinePaperScraper(project_id)
    background_tasks.add_task(scraper.execute_pdf_collection, payload.target_count)
    return {"status": "PDF scrape started in background"}

@router.get("/{project_id}/pdfs")
async def get_pdfs(project_id: str):
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            papers = conn.execute(
                "SELECT title, pdf_path, source, year FROM papers WHERE project_id = ? AND pdf_path IS NOT NULL AND pdf_path != ''", 
                (project_id,)
            ).fetchall()
        return [{"title": p["title"], "path": p["pdf_path"], "source": p["source"], "year": p["year"]} for p in papers]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/file")
async def serve_file(project_id: str, path: str):
    base_dir = Path(__file__).resolve().parent.parent.parent
    full_path = base_dir / path
    if full_path.exists() and full_path.is_file():
        return FileResponse(full_path, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="File not found on disk")


def _project_error(error: Exception) -> HTTPException:
    if isinstance(error, ValueError) and not isinstance(error, ProjectNotFoundError):
        return HTTPException(status_code=422, detail=str(error))
    return HTTPException(status_code=404, detail="Project or stage not found.")

def _safe_filename(project_name: str, ext: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", project_name).strip("-.")
    return f"{safe_name or 'research-project'}.{ext}"

@router.post("/{project_id}/refine-network")
async def refine_network(project_id: str):
    """
    Groups downloaded papers by their secondary keywords and runs the 
    Univariate Spline Network analysis (API or Local Fallback) on each group.
    """
    try:
        config = load_search_strings(project_id)
        if not config:
            raise HTTPException(status_code=400, detail="Project configuration not found.")
            
        primary_kw = config.get("primary_keyword", "Unknown")
        secondary_kws = config.get("secondary_keywords", [])
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            papers = conn.execute(
                "SELECT title, abstract, metadata_json FROM papers WHERE project_id = ?", 
                (project_id,)
            ).fetchall()
            
        if not papers:
            raise HTTPException(status_code=400, detail="No metadata found in database. Run Step 2 first.")

        subdomains = []
        for index, sec_kw in enumerate(secondary_kws):
            # Build a localized corpus targeting this specific subdomain
            corpus = []
            for p in papers:
                content = f"{p['title']} {p['abstract']}".lower()
                # Simple matching: Include paper in corpus if the secondary keyword appears
                if sec_kw.lower() in content:
                    corpus.append(content)
                    
            # Run the resilient Extraction Service
            extracted_terms = NLPService.extract_terms(corpus)
            
            subdomains.append({
                "id": f"sub_{index}",
                "primaryKw": primary_kw,
                "secondaryKw": sec_kw,
                "terms": extracted_terms
            })
            
        return {"status": "success", "subdomains": subdomains}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/stages/{stage_id}/tools")
def get_stage_tools(project_id: str, stage_id: str):
    """Fetches open-source tools relevant to the current writing stage."""
    scout = GitHubToolScout()
    # You can pass a GitHub PAT here if you hit rate limits: GitHubToolScout(github_token="...")
    tools = scout.find_new_tools(stage_id)
    return {"status": "success", "tools": tools}


@router.post("/{project_id}/scrape/cancel")
async def cancel_scrape(project_id: str):
    """Flipping this flag tells any running scrape loop for this project to abort."""
    CANCEL_FLAGS[project_id] = True
    return {"status": "cancelled", "message": "Scrape cancellation requested."}

@router.post("/{project_id}/scrape/metadata")
async def scrape_metadata(project_id: str, query: str = Form(...), limit: int = Form(10)):
    """Simulated metadata scrape with cancellation checks."""
    CANCEL_FLAGS[project_id] = False
    results = []
    
    for i in range(limit):
        # --- CRITICAL: Check for cancellation in your loop ---
        if CANCEL_FLAGS.get(project_id):
            print(f"[{project_id}] Metadata scrape cancelled by user.")
            break
            
        # Simulate network request to ArXiv/Crossref
        await asyncio.sleep(1) 
        results.append({
            "Title": f"Simulated Paper {i+1} for {query}",
            "Abstract": "This is a simulated abstract.",
            "Year": "2024",
            "DOI": f"10.1234/sim.{i+1}"
        })
        
    return {"status": "success", "data": results, "cancelled": CANCEL_FLAGS.get(project_id)}

@router.post("/{project_id}/scrape/pdf")
async def scrape_pdfs(
    project_id: str, 
    mode: str = Form(...), 
    query: str = Form(None), 
    limit: int = Form(5)
):
    """
    Handles both PDF modes:
    1. mode='metadata': Downloads PDFs for existing CSV records.
    2. mode='brand_new': Searches ArXiv/Unpaywall for new papers, returning BOTH metadata and PDFs.
    """
    CANCEL_FLAGS[project_id] = False
    downloaded_files = []
    new_metadata = [] # Only used if mode == 'brand_new'

    if mode == "brand_new":
        # Simulate searching for new papers AND downloading them
        for i in range(limit):
            if CANCEL_FLAGS.get(project_id):
                break
            await asyncio.sleep(1.5) # Simulate API search + PDF download
            file_name = f"[2024]_arxiv_brand_new_{i}.pdf"
            downloaded_files.append(file_name)
            new_metadata.append({
                "Title": f"Brand New Paper {i+1} ({query})",
                "Abstract": "Newly discovered paper abstract.",
                "Year": "2024",
                "DOI": f"10.5678/new.{i}"
            })
    else:
        # Simulate using existing metadata corpus (would normally read from DB/CSV)
        for i in range(limit):
            if CANCEL_FLAGS.get(project_id):
                break
            await asyncio.sleep(1) # Simulate Unpaywall PDF download
            downloaded_files.append(f"[2023]_corpus_paper_{i}.pdf")

    return {
        "status": "success", 
        "downloaded": downloaded_files, 
        "new_metadata": new_metadata,
        "cancelled": CANCEL_FLAGS.get(project_id)
    }

@router.post("/{project_id}/pdfs/upload")
async def upload_manual_pdfs(project_id: str, files: List[UploadFile] = File(...)):
    """Handles manual PDF uploads from the user."""
    upload_dir = f"backend/data/projects/{project_id}/pdfs"
    os.makedirs(upload_dir, exist_ok=True)
    
    saved_files = []
    for file in files:
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)
        
    return {"status": "success", "uploaded": saved_files}