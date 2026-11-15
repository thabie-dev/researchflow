from collections.abc import Iterator

from fastapi import Request

from app.repositories.project_repository import ProjectRepository
from app.services.project_service import ProjectService


def get_project_service(request: Request) -> Iterator[ProjectService]:
    database = request.app.state.database
    connection = database.connect()
    try:
        repository = ProjectRepository(connection)
        yield ProjectService(repository)
    finally:
        connection.close()
