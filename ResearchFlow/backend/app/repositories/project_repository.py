from datetime import datetime, timezone
import sqlite3

from app.models.project import Project, Stage, StageVersion


class ProjectRepository:
    """Stores and reconstructs projects without leaking SQL into services."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def list_projects(self) -> list[Project]:
        rows = self.connection.execute(
            "SELECT id, name, created_at FROM projects ORDER BY created_at DESC"
        ).fetchall()
        projects = []
        for row in rows:
            projects.append(self._build_project(row))
        return projects

    def find_project(self, project_id: str) -> Project | None:
        row = self.connection.execute(
            "SELECT id, name, created_at FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        return self._build_project(row)

    def create_project(self, project: Project) -> Project:
        with self.connection:
            self.connection.execute(
                "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
                (project.id, project.name, project.created_at),
            )
            for stage in project.stages:
                self.connection.execute(
                    """
                    INSERT INTO stages (project_id, stage_id, title, content_html)
                    VALUES (?, ?, ?, ?)
                    """,
                    (project.id, stage.stage_id, stage.title, stage.content_html),
                )
        return project

    def rename_project(self, project_id: str, name: str) -> Project | None:
        with self.connection:
            cursor = self.connection.execute(
                "UPDATE projects SET name = ? WHERE id = ?",
                (name, project_id),
            )
        if cursor.rowcount == 0:
            return None
        return self.find_project(project_id)

    def delete_project(self, project_id: str) -> bool:
        with self.connection:
            cursor = self.connection.execute(
                "DELETE FROM projects WHERE id = ?",
                (project_id,),
            )
        return cursor.rowcount > 0

    def save_stage(self, project_id: str, stage_id: str, content_html: str) -> Project | None:
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE stages SET content_html = ?
                WHERE project_id = ? AND stage_id = ?
                """,
                (content_html, project_id, stage_id),
            )
        if cursor.rowcount == 0:
            return None
        return self.find_project(project_id)

    def save_version(self, project_id: str, stage_id: str, content_html: str) -> Project | None:
        timestamp = datetime.now(timezone.utc).isoformat()
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE stages SET content_html = ?
                WHERE project_id = ? AND stage_id = ?
                """,
                (content_html, project_id, stage_id),
            )
            if cursor.rowcount == 0:
                return None
            self.connection.execute(
                """
                INSERT INTO stage_versions (project_id, stage_id, created_at, content_html)
                VALUES (?, ?, ?, ?)
                """,
                (project_id, stage_id, timestamp, content_html),
            )
            self._prune_versions(project_id, stage_id)
        return self.find_project(project_id)

    def restore_version(
        self,
        project_id: str,
        stage_id: str,
        version_id: int,
    ) -> Project | None:
        """Restore a version while preserving the replaced content as a snapshot."""
        timestamp = datetime.now(timezone.utc).isoformat()
        with self.connection:
            current_row = self.connection.execute(
                """
                SELECT content_html FROM stages
                WHERE project_id = ? AND stage_id = ?
                """,
                (project_id, stage_id),
            ).fetchone()
            version_row = self.connection.execute(
                """
                SELECT content_html FROM stage_versions
                WHERE id = ? AND project_id = ? AND stage_id = ?
                """,
                (version_id, project_id, stage_id),
            ).fetchone()
            if current_row is None or version_row is None:
                return None

            self.connection.execute(
                """
                INSERT INTO stage_versions (project_id, stage_id, created_at, content_html)
                VALUES (?, ?, ?, ?)
                """,
                (project_id, stage_id, timestamp, current_row["content_html"]),
            )
            self.connection.execute(
                """
                UPDATE stages SET content_html = ?
                WHERE project_id = ? AND stage_id = ?
                """,
                (version_row["content_html"], project_id, stage_id),
            )
            self._prune_versions(project_id, stage_id)
        return self.find_project(project_id)

    def _build_project(self, project_row: sqlite3.Row) -> Project:
        stage_rows = self.connection.execute(
            """
            SELECT stage_id, title, content_html FROM stages
            WHERE project_id = ? ORDER BY rowid
            """,
            (project_row["id"],),
        ).fetchall()
        stages = []
        for stage_row in stage_rows:
            versions = self._list_versions(project_row["id"], stage_row["stage_id"])
            stages.append(
                Stage(
                    stage_id=stage_row["stage_id"],
                    title=stage_row["title"],
                    content_html=stage_row["content_html"],
                    versions=versions,
                )
            )
        return Project(
            id=project_row["id"],
            name=project_row["name"],
            created_at=project_row["created_at"],
            stages=stages,
        )

    def _list_versions(self, project_id: str, stage_id: str) -> list[StageVersion]:
        rows = self.connection.execute(
            """
            SELECT id, created_at, content_html FROM stage_versions
            WHERE project_id = ? AND stage_id = ? ORDER BY id
            """,
            (project_id, stage_id),
        ).fetchall()
        versions = []
        for row in rows:
            versions.append(
                StageVersion(
                    id=row["id"],
                    timestamp=row["created_at"],
                    html=row["content_html"],
                )
            )
        return versions

    def _prune_versions(self, project_id: str, stage_id: str) -> None:
        self.connection.execute(
            """
            DELETE FROM stage_versions
            WHERE id IN (
                SELECT id FROM stage_versions
                WHERE project_id = ? AND stage_id = ?
                ORDER BY id DESC LIMIT -1 OFFSET 25
            )
            """,
            (project_id, stage_id),
        )
