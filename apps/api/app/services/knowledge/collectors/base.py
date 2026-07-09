from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CollectedItem:
    title: str
    raw_content: str
    source_type: str
    url: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    metadata: dict = field(default_factory=dict)
