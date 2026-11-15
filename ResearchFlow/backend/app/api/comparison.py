from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.schemas import BulkComparisonResponse, ComparisonResponse
from app.services.comparison_service import ComparisonService
from app.services.document_reader import (
    DocumentReader,
    DocumentTooLargeError,
    UnsupportedDocumentError,
)
from app.services.topic_extraction_service import TopicExtractionError


router = APIRouter(prefix="/comparison", tags=["comparison"])
MAX_BULK_DOCUMENTS = 30


@router.post("", response_model=ComparisonResponse)
async def compare_documents(
    request: Request,
    first_document: Annotated[UploadFile, File()],
    second_document: Annotated[UploadFile, File()],
):
    settings = request.app.state.settings
    reader = DocumentReader(settings.max_upload_bytes)
    try:
        first_text = await reader.read(first_document)
        second_text = await reader.read(second_document)
    except DocumentTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except UnsupportedDocumentError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    comparison = ComparisonService().compare(
        first_document.filename or "First document",
        first_text,
        second_document.filename or "Second document",
        second_text,
    )
    return comparison


@router.post("/bulk", response_model=BulkComparisonResponse)
async def compare_bulk_documents(
    request: Request,
    documents: Annotated[list[UploadFile], File()],
):
    if len(documents) < 2:
        raise HTTPException(status_code=422, detail="Upload at least two journal documents.")
    if len(documents) > MAX_BULK_DOCUMENTS:
        raise HTTPException(
            status_code=422,
            detail=f"Upload no more than {MAX_BULK_DOCUMENTS} documents at once.",
        )

    settings = request.app.state.settings
    reader = DocumentReader(settings.max_upload_bytes)
    extracted_documents = []
    try:
        for upload in documents:
            text = await reader.read(upload)
            extracted_documents.append((upload.filename or "Journal document", text))
    except DocumentTooLargeError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except UnsupportedDocumentError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        for upload in documents:
            await upload.close()

    comparison = ComparisonService().compare_many(extracted_documents)
    topic_documents = []
    for index, (_filename, text) in enumerate(extracted_documents):
        topic_documents.append((comparison.labels[index], text))

    try:
        topic_extraction = await run_in_threadpool(
            request.app.state.topic_extraction_service.extract,
            topic_documents,
        )
    except TopicExtractionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return {
        "labels": comparison.labels,
        "matrix": comparison.matrix,
        "documents": comparison.documents,
        "strongest_pairs": comparison.strongest_pairs,
        "topic_extraction": topic_extraction,
    }
