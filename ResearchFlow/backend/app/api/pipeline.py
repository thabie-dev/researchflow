from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

from app.services.storage import load_search_strings, save_search_strings, get_pipeline_state
from app.services.scraper import PipelinePaperScraper

router = APIRouter(prefix="/projects/{project_id}", tags=["Pipeline"])

class SearchStringsPayload(BaseModel):
    primary_keyword: Optional[str] = ""
    secondary_keywords: Optional[List[str]] = []
    pairs: Optional[List[Dict[str, str]]] = []
    query_tree: Optional[Dict[str, Any]] = {}
    compiled_boolean: Optional[str] = ""

class ScrapeTriggerPayload(BaseModel):
    query: str
    target_count: Optional[int] = 100
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.get("/search-strings")
def get_search_strings_endpoint(project_id: str):
    data = load_search_strings(project_id)
    if not data:
        return {"compiled_boolean": "", "query_tree": {}, "pairs": []}
    return data

@router.post("/search-strings")
def save_search_strings_endpoint(project_id: str, payload: SearchStringsPayload):
    save_search_strings(project_id, payload.dict())
    return {"status": "success", "message": "Search strings stored successfully."}

@router.get("/state")
def get_state_endpoint(project_id: str):
    return get_pipeline_state(project_id)

@router.post("/scrape")
def trigger_scrape_endpoint(project_id: str, payload: ScrapeTriggerPayload, background_tasks: BackgroundTasks):
    s_date = datetime.strptime(payload.start_date, "%Y-%m-%d") if payload.start_date else None
    e_date = datetime.strptime(payload.end_date, "%Y-%m-%d") if payload.end_date else None
    
    scraper = PipelinePaperScraper(project_id)
    background_tasks.add_task(
        scraper.execute_collection,
        query=payload.query,
        target_count=payload.target_count,
        start_date=s_date,
        end_date=e_date
    )
    return {"status": "started", "message": f"Harvesting triggered for project {project_id}"}