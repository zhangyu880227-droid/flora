"""
AI knowledge extraction — given a document title + content, produces structured knowledge:
summary, key_insights, entities, relationships, tags, confidence_score, importance_score.

Entity types supported:
  person, org, tech, product, country, place, event, concept, industry

Relationship types supported (semantic):
  invests_in, supplies_to, uses, competes_with, partners_with, acquires,
  researches, subsidiary_of, located_in, manufactures, regulates, affects,
  founded_by, leads, belongs_to
"""
import json
import re
from dataclasses import dataclass, field

from app.services.ai import get_provider

EXTRACT_SYSTEM = (
    "You are a financial and technology intelligence extraction engine. "
    "Given a document, you extract structured knowledge as compact JSON. "
    "Always respond with valid JSON only — no markdown, no prose."
)

EXTRACT_PROMPT = """\
Analyze the following document and return a single JSON object with exactly these fields:

{{
  "summary": "2-3 sentence factual summary",
  "key_insights": ["insight1", "insight2", "insight3"],
  "entities": [
    {{"name": "...", "type": "person|org|tech|product|country|place|event|concept|industry", "relevance": 0.0}}
  ],
  "relationships": [
    {{"from": "...", "to": "...", "relation": "invests_in|supplies_to|uses|competes_with|partners_with|acquires|researches|subsidiary_of|located_in|manufactures|regulates|affects|founded_by|leads|belongs_to|related_to", "confidence": 0.0}}
  ],
  "tags": ["tag1", "tag2", "tag3"],
  "confidence_score": 0.0,
  "importance_score": 0.0
}}

Rules:
- summary: factual, 2-3 sentences, no opinion
- key_insights: 3-7 most important takeaways a professional investor or researcher would care about
- entities: up to 12 most relevant; relevance 0.0-1.0; use specific types:
    org=companies/institutions, tech=technologies/frameworks, product=named products,
    country=nations, place=cities/regions, event=conferences/incidents/announcements,
    person=individuals, concept=ideas/methodologies, industry=market sectors
- relationships: up to 8 most important; confidence 0.0-1.0
- tags: 5-10 lowercase discovery keywords
- confidence_score: 0.9=verified fact/technical paper, 0.7=reliable news, 0.5=opinion/blog, 0.3=rumor/low signal
- importance_score: 0.9=major market-moving event (earnings, acquisition, regulation), 0.7=significant industry news, 0.5=standard update, 0.3=minor or tangential

Title: {title}

Content (truncated to 3000 chars):
{content}
"""


@dataclass
class KnowledgeExtraction:
    summary: str = ""
    key_insights: list[str] = field(default_factory=list)
    entities: list[dict] = field(default_factory=list)
    relationships: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    confidence_score: float = 0.5
    importance_score: float = 0.5


async def extract_knowledge(title: str, content: str) -> KnowledgeExtraction:
    provider = get_provider()
    prompt = EXTRACT_PROMPT.format(
        title=title,
        content=content[:3000],
    )
    try:
        raw = await provider.complete(system=EXTRACT_SYSTEM, prompt=prompt)
        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)

        # Normalise relationship confidence: if not provided, default to 0.7
        rels = _ensure_list_of_dict(data.get("relationships", []))
        for r in rels:
            if "confidence" not in r:
                r["confidence"] = 0.7

        return KnowledgeExtraction(
            summary=str(data.get("summary", "")),
            key_insights=_ensure_list_of_str(data.get("key_insights", [])),
            entities=_ensure_list_of_dict(data.get("entities", [])),
            relationships=rels,
            tags=_ensure_list_of_str(data.get("tags", [])),
            confidence_score=float(data.get("confidence_score", 0.5)),
            importance_score=float(data.get("importance_score", 0.5)),
        )
    except Exception:
        return KnowledgeExtraction(
            summary=content[:300] if content else "",
            tags=_simple_tags(title),
            confidence_score=0.3,
            importance_score=0.3,
        )


def _ensure_list_of_str(val: object) -> list[str]:
    if isinstance(val, list):
        return [str(x) for x in val if x]
    return []


def _ensure_list_of_dict(val: object) -> list[dict]:
    if isinstance(val, list):
        return [x for x in val if isinstance(x, dict)]
    return []


def _simple_tags(title: str) -> list[str]:
    words = re.findall(r"[a-zA-Z]{4,}", title.lower())
    stop = {"from", "with", "that", "this", "have", "will", "your", "when", "what"}
    return [w for w in words if w not in stop][:5]
