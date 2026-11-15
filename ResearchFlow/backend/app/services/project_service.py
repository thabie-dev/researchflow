from datetime import datetime, timezone
from uuid import uuid4

from app.models.project import Project, Stage
from app.repositories.project_repository import ProjectRepository


STAGE_DEFINITIONS = (
    ("concept_note", "Concept Note"),
    ("proposal", "Research Proposal"),
    ("introduction", "Introduction"),
    ("literature_review", "Literature Review"),
    ("methodology", "Methodology"),
    ("results", "Results / Findings"),
    ("discussion", "Discussion"),
    ("conclusion", "Conclusion"),
    ("references", "References"),
)


class ProjectNotFoundError(Exception):
    """Raised when a project or one of its stages does not exist."""


class ProjectService:
    def __init__(self, repository: ProjectRepository) -> None:
        self.repository = repository

    def list_projects(self) -> list[Project]:
        return self.repository.list_projects()

    def get_project(self, project_id: str) -> Project:
        project = self.repository.find_project(project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    def create_project(self, name: str) -> Project:
        clean_name = name.strip() or "Untitled Project"
        stages = []
        for stage_id, title in STAGE_DEFINITIONS:
            content = (
                f"<p><strong>{title}</strong> — Start drafting your research. "
                "Use the right panel for prompts and version control.</p>"
            )
            stages.append(Stage(stage_id=stage_id, title=title, content_html=content))

        project = Project(
            id=str(uuid4()),
            name=clean_name,
            created_at=datetime.now(timezone.utc).isoformat(),
            stages=stages,
        )
        return self.repository.create_project(project)

    def rename_project(self, project_id: str, name: str) -> Project:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Project name cannot be empty.")
        project = self.repository.rename_project(project_id, clean_name)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    def delete_project(self, project_id: str) -> None:
        if not self.repository.delete_project(project_id):
            raise ProjectNotFoundError(project_id)

    def save_stage(self, project_id: str, stage_id: str, content_html: str) -> Project:
        project = self.repository.save_stage(project_id, stage_id, content_html)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    def save_version(self, project_id: str, stage_id: str, content_html: str) -> Project:
        project = self.repository.save_version(project_id, stage_id, content_html)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    def restore_version(self, project_id: str, stage_id: str, version_id: int) -> Project:
        project = self.repository.restore_version(project_id, stage_id, version_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project
