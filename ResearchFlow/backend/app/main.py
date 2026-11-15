from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import comparison, health, pipeline, projects
from app.core.config import Settings
from app.database.connection import Database
from app.services.topic_extraction_service import TopicExtractionService
from app.api.project_management import router as pm_router
from app.api.tool_scout import router as tool_scout_router

def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_environment()
    database = Database(app_settings.database_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        database.initialize()
        yield

    application = FastAPI(
        title="ResearchFlow API",
        version="1.0.0",
        lifespan=lifespan,
    )
    application.state.settings = app_settings
    application.state.database = database
    application.state.topic_extraction_service = TopicExtractionService()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.frontend_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router, prefix="/api")
    application.include_router(projects.router, prefix="/api")
    application.include_router(comparison.router, prefix="/api")
    application.include_router(pipeline.router, prefix="/api")
    application.include_router(pm_router, prefix="/api")
    application.include_router(tool_scout_router, prefix="/api")

    return application


app = create_app()