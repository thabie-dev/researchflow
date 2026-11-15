from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class StageVersionResponse(ApiModel):
    id: int
    timestamp: str
    html: str


class StageResponse(ApiModel):
    stage_id: str = Field(serialization_alias="stageId")
    title: str
    content_html: str = Field(serialization_alias="contentHTML")
    versions: list[StageVersionResponse]


class ProjectResponse(ApiModel):
    id: str
    name: str
    created_at: str = Field(serialization_alias="createdAt")
    stages: list[StageResponse]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class ProjectRename(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class StageSave(BaseModel):
    contentHTML: str = Field(max_length=1_000_000)


class DocumentSummaryResponse(BaseModel):
    filename: str
    word_count: int
    unique_word_count: int
    preview: str


class ComparisonResponse(BaseModel):
    similarity: float
    common_terms: list[str]
    first: DocumentSummaryResponse
    second: DocumentSummaryResponse


class SimilarityPairResponse(BaseModel):
    first_filename: str
    second_filename: str
    similarity: float


class ExtractedTopicResponse(BaseModel):
    topic_id: int
    label: str
    keywords: list[str]
    score: float
    chunk_count: int


class JournalTopicProfileResponse(BaseModel):
    filename: str
    topics: list[ExtractedTopicResponse]


class TopicExtractionResponse(BaseModel):
    engine: str
    preprocessing: list[str]
    global_topics: list[ExtractedTopicResponse]
    journals: list[JournalTopicProfileResponse]


class BulkComparisonResponse(BaseModel):
    labels: list[str]
    matrix: list[list[float]]
    documents: list[DocumentSummaryResponse]
    strongest_pairs: list[SimilarityPairResponse]
    topic_extraction: TopicExtractionResponse


class PdfExportRequest(BaseModel):
    font: Literal["times", "georgia", "arial"] = "times"
    font_size: int = Field(default=12, ge=8, le=24)
    line_height: float = Field(default=1.5, ge=1.0, le=3.0)
    citation_style: Literal["apa", "mla", "chicago"] = "apa"
