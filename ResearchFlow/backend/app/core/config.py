from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    """Runtime settings read once when the application starts."""

    database_path: Path
    frontend_origins: tuple[str, ...]
    max_upload_bytes: int

    @classmethod
    def from_environment(cls) -> "Settings":
        backend_directory = Path(__file__).resolve().parents[2]
        default_database = backend_directory / "data" / "researchflow.db"
        configured_path = os.getenv("RESEARCHFLOW_DATABASE_PATH")
        database_path = Path(configured_path) if configured_path else default_database

        return cls(
            database_path=database_path,
            frontend_origins=("http://localhost:5173", "http://127.0.0.1:5173"),
            max_upload_bytes=10 * 1024 * 1024,
        )
