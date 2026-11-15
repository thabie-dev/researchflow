import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timezone

BASE_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "projects"

def get_project_dir(project_id: str) -> Path:
    proj_dir = BASE_DATA_DIR / str(project_id)
    (proj_dir / "raw_scraped_files" / "scopus").mkdir(parents=True, exist_ok=True)
    (proj_dir / "raw_scraped_files" / "arxiv").mkdir(parents=True, exist_ok=True)
    (proj_dir / "raw_scraped_files" / "crossref").mkdir(parents=True, exist_ok=True)
    (proj_dir / "raw_scraped_files" / "semantic_scholar").mkdir(parents=True, exist_ok=True)
    (proj_dir / "processed_files").mkdir(parents=True, exist_ok=True)
    return proj_dir

def load_search_strings(project_id: str) -> Optional[Dict[str, Any]]:
    path = get_project_dir(project_id) / "search_strings.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_search_strings(project_id: str, data: Dict[str, Any]) -> None:
    path = get_project_dir(project_id) / "search_strings.json"
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def get_pipeline_state(project_id: str) -> Dict[str, Any]:
    path = get_project_dir(project_id) / "pipeline_state.json"
    if not path.exists():
        default_state = {
            "current_step": 1,
            "steps": {
                "step_1": {"status": "in_progress"},
                "step_2": {"status": "locked", "progress": {"found": 0, "downloaded": 0, "target": 0}},
                "step_3": {"status": "locked"}
            }
        }
        update_pipeline_state(project_id, default_state)
        return default_state
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def update_pipeline_state(project_id: str, updates: Dict[str, Any]) -> None:
    path = get_project_dir(project_id) / "pipeline_state.json"
    state = {}
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    state.update(updates)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)