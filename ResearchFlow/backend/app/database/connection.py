from collections.abc import Iterator
from pathlib import Path
import sqlite3


class Database:
    """Owns SQLite connections and schema initialization."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS stages (
                    project_id TEXT NOT NULL,
                    stage_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content_html TEXT NOT NULL,
                    PRIMARY KEY (project_id, stage_id),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS stage_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    stage_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    content_html TEXT NOT NULL,
                    FOREIGN KEY (project_id, stage_id)
                        REFERENCES stages(project_id, stage_id) ON DELETE CASCADE
                );
                """
            )

    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            yield connection
        finally:
            connection.close()
