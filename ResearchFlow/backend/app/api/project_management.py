import os
import sqlite3
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter()

DB_PATH = os.path.join(os.getcwd(), "researchflow.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_pm_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Kanban Tasks Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pm_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            research_stage TEXT DEFAULT 'Problem Statement',
            pm_phase TEXT DEFAULT 'Planning',
            status TEXT DEFAULT 'todo',
            expected_output TEXT
        )
    """)
    
    # 2. 11-Stage Lifecycle Progress Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pm_stages (
            project_id TEXT NOT NULL,
            stage_number INTEGER NOT NULL,
            stage_name TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            pm_phase TEXT DEFAULT 'Initiation',
            PRIMARY KEY (project_id, stage_number)
        )
    """)
    
    # 3. Ethics Clearance Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pm_ethics (
            project_id TEXT PRIMARY KEY,
            status TEXT DEFAULT '',
            reason TEXT DEFAULT '',
            approval_number TEXT DEFAULT '',
            approval_date TEXT DEFAULT '',
            committee_name TEXT DEFAULT '',
            certificate_filename TEXT DEFAULT ''
        )
    """)

    # 4. Research Assistant Draft Notes Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pm_notes (
            project_id TEXT NOT NULL,
            stage_key TEXT NOT NULL,
            topic TEXT DEFAULT '',
            draft_text TEXT DEFAULT '',
            PRIMARY KEY (project_id, stage_key)
        )
    """)
    
    conn.commit()
    conn.close()

init_pm_tables()

DEFAULT_LIFECYCLE_STAGES = [
    {"stage_number": 1, "stage_name": "Problem Statement", "progress": 85, "pm_phase": "Initiation"},
    {"stage_number": 2, "stage_name": "Concept Note", "progress": 70, "pm_phase": "Initiation"},
    {"stage_number": 3, "stage_name": "Literature Review", "progress": 55, "pm_phase": "Planning"},
    {"stage_number": 4, "stage_name": "Conceptual & Theoretical Framework", "progress": 45, "pm_phase": "Planning"},
    {"stage_number": 5, "stage_name": "Methodology", "progress": 40, "pm_phase": "Planning"},
    {"stage_number": 6, "stage_name": "Ethics Decision", "progress": 30, "pm_phase": "Planning"},
    {"stage_number": 7, "stage_name": "Data Collection", "progress": 20, "pm_phase": "Execution"},
    {"stage_number": 8, "stage_name": "Data Cleaning", "progress": 10, "pm_phase": "Execution"},
    {"stage_number": 9, "stage_name": "Data Analysis", "progress": 0, "pm_phase": "Monitoring & Control"},
    {"stage_number": 10, "stage_name": "Writing", "progress": 20, "pm_phase": "Monitoring & Control"},
    {"stage_number": 11, "stage_name": "Review & Submission", "progress": 0, "pm_phase": "Closing"}
]

DEFAULT_TASKS = [
    {"title": "Curate problem statement", "research_stage": "Problem Statement", "pm_phase": "Initiation", "status": "todo", "expected_output": "Develop problem, gap, aim, objectives, and questions."},
    {"title": "Draft literature structure", "research_stage": "Literature Review", "pm_phase": "Planning", "status": "progress", "expected_output": "Develop headings and subheadings from the problem statement."},
    {"title": "Supervisor review", "research_stage": "Concept Note", "pm_phase": "Monitoring & Control", "status": "review", "expected_output": "Submit concept note and literature structure for feedback."},
    {"title": "Select research topic", "research_stage": "Problem Statement", "pm_phase": "Initiation", "status": "done", "expected_output": "Finalise broad research area and working title."}
]

class TaskCreate(BaseModel):
    title: str
    research_stage: str = "Problem Statement"
    pm_phase: str = "Planning"
    status: str = "todo"
    expected_output: Optional[str] = ""

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    pm_phase: Optional[str] = None

class StageProgressUpdate(BaseModel):
    stage_number: int
    progress: int
    pm_phase: str

class EthicsUpdate(BaseModel):
    status: str
    reason: Optional[str] = ""
    approval_number: Optional[str] = ""
    approval_date: Optional[str] = ""
    committee_name: Optional[str] = ""

class NoteUpdate(BaseModel):
    stage_key: str
    topic: str
    draft_text: str

@router.get("/projects/{project_id}/pm")
def get_project_management_data(project_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Fetch or seed stages
    cursor.execute("SELECT * FROM pm_stages WHERE project_id = ? ORDER BY stage_number ASC", (project_id,))
    stages = [dict(row) for row in cursor.fetchall()]
    if not stages:
        for s in DEFAULT_LIFECYCLE_STAGES:
            cursor.execute(
                "INSERT INTO pm_stages (project_id, stage_number, stage_name, progress, pm_phase) VALUES (?, ?, ?, ?, ?)",
                (project_id, s["stage_number"], s["stage_name"], s["progress"], s["pm_phase"])
            )
        conn.commit()
        cursor.execute("SELECT * FROM pm_stages WHERE project_id = ? ORDER BY stage_number ASC", (project_id,))
        stages = [dict(row) for row in cursor.fetchall()]

    # Fetch or seed tasks
    cursor.execute("SELECT * FROM pm_tasks WHERE project_id = ? ORDER BY id DESC", (project_id,))
    tasks = [dict(row) for row in cursor.fetchall()]
    if not tasks:
        for t in DEFAULT_TASKS:
            cursor.execute(
                "INSERT INTO pm_tasks (project_id, title, research_stage, pm_phase, status, expected_output) VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, t["title"], t["research_stage"], t["pm_phase"], t["status"], t["expected_output"])
            )
        conn.commit()
        cursor.execute("SELECT * FROM pm_tasks WHERE project_id = ? ORDER BY id DESC", (project_id,))
        tasks = [dict(row) for row in cursor.fetchall()]

    # Fetch ethics
    cursor.execute("SELECT * FROM pm_ethics WHERE project_id = ?", (project_id,))
    ethics_row = cursor.fetchone()
    ethics = dict(ethics_row) if ethics_row else {
        "project_id": project_id,
        "status": "",
        "reason": "",
        "approval_number": "",
        "approval_date": "",
        "committee_name": "",
        "certificate_filename": ""
    }

    # Fetch notes
    cursor.execute("SELECT * FROM pm_notes WHERE project_id = ?", (project_id,))
    notes = {row["stage_key"]: dict(row) for row in cursor.fetchall()}

    conn.close()
    return {
        "stages": stages,
        "tasks": tasks,
        "ethics": ethics,
        "notes": notes
    }

@router.post("/projects/{project_id}/pm/tasks")
def create_pm_task(project_id: str, payload: TaskCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO pm_tasks (project_id, title, research_stage, pm_phase, status, expected_output)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (project_id, payload.title, payload.research_stage, payload.pm_phase, payload.status, payload.expected_output)
    )
    new_id = cursor.lastrowid
    conn.commit()
    cursor.execute("SELECT * FROM pm_tasks WHERE id = ?", (new_id,))
    new_task = dict(cursor.fetchone())
    conn.close()
    return new_task

@router.patch("/projects/{project_id}/pm/tasks/{task_id}")
def update_pm_task(project_id: str, task_id: int, payload: TaskUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    if payload.status is not None:
        cursor.execute("UPDATE pm_tasks SET status = ? WHERE id = ? AND project_id = ?", (payload.status, task_id, project_id))
    if payload.pm_phase is not None:
        cursor.execute("UPDATE pm_tasks SET pm_phase = ? WHERE id = ? AND project_id = ?", (payload.pm_phase, task_id, project_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@router.delete("/projects/{project_id}/pm/tasks/{task_id}")
def delete_pm_task(project_id: str, task_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pm_tasks WHERE id = ? AND project_id = ?", (task_id, project_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@router.put("/projects/{project_id}/pm/stages")
def update_stage_progress(project_id: str, payload: StageProgressUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE pm_stages SET progress = ?, pm_phase = ?
           WHERE project_id = ? AND stage_number = ?""",
        (payload.progress, payload.pm_phase, project_id, payload.stage_number)
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}

@router.put("/projects/{project_id}/pm/ethics")
def save_ethics_decision(project_id: str, payload: EthicsUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT certificate_filename FROM pm_ethics WHERE project_id = ?", (project_id,))
    existing = cursor.fetchone()
    cert_file = existing["certificate_filename"] if existing else ""

    cursor.execute(
        """INSERT OR REPLACE INTO pm_ethics
           (project_id, status, reason, approval_number, approval_date, committee_name, certificate_filename)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (project_id, payload.status, payload.reason, payload.approval_number, payload.approval_date, payload.committee_name, cert_file)
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}

@router.post("/projects/{project_id}/pm/ethics/upload")
def upload_ethics_certificate(project_id: str, file: UploadFile = File(...)):
    upload_dir = os.path.join(os.getcwd(), "data", "projects", project_id, "ethics")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM pm_ethics WHERE project_id = ?", (project_id,))
    row = cursor.fetchone()
    if row:
        cursor.execute("UPDATE pm_ethics SET certificate_filename = ? WHERE project_id = ?", (file.filename, project_id))
    else:
        cursor.execute(
            "INSERT INTO pm_ethics (project_id, status, certificate_filename) VALUES (?, 'required', ?)",
            (project_id, file.filename)
        )
    conn.commit()
    conn.close()
    return {"status": "uploaded", "filename": file.filename}

@router.put("/projects/{project_id}/pm/notes")
def save_stage_note(project_id: str, payload: NoteUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT OR REPLACE INTO pm_notes (project_id, stage_key, topic, draft_text)
           VALUES (?, ?, ?, ?)""",
        (project_id, payload.stage_key, payload.topic, payload.draft_text)
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}