from dataclasses import dataclass, field


@dataclass
class StageVersion:
    id: int
    timestamp: str
    html: str


@dataclass
class Stage:
    stage_id: str
    title: str
    content_html: str
    versions: list[StageVersion] = field(default_factory=list)


@dataclass
class Project:
    id: str
    name: str
    created_at: str
    stages: list[Stage] = field(default_factory=list)
