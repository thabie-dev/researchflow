from fastapi import APIRouter


router = APIRouter(tags=["health"])


@router.get("/status")
def get_status() -> dict[str, str]:
    return {"message": "ResearchFlow API is running."}
