"""
Opportunity Detector — scans the existing feature set and infers high-value
missing capabilities based on common patterns in research platforms.

Opportunities are stored in atlas.json under "opportunities" and fed into
the roadmap + dashboard.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..scanner import ScannedFile


@dataclass
class Opportunity:
    id: str
    title: str
    description: str
    rationale: str         # why this is valuable
    effort: str            # low | medium | high
    impact: str            # low | medium | high
    phase: str             # now | next | later
    category: str          # ux | performance | collaboration | ai | devex


# Each rule: (id, title, description, rationale, effort, impact, phase, category,
#              requires_any: list of patterns that must exist,
#              requires_none: list of patterns that must NOT exist)
_RULES: list[tuple] = [
    (
        "opp-collections-ui",
        "Build Collections UI (backend already complete)",
        "The collections API is fully implemented with CRUD, source membership, and proper auth — but there is no frontend page. Users cannot discover or use this feature.",
        "Collections are a key curation primitive. Zero code needed on the backend.",
        "low", "high", "now", "ux",
        ["apps/api/app/api/v1/collections.py"],
        ["apps/web/src/app/(app)/collections"],
    ),
    (
        "opp-forgot-password",
        "Implement password reset flow (frontend page already exists)",
        "The forgot-password page renders but calls no backend endpoint. Users who forget their password cannot recover their account.",
        "Email-based password reset is table-stakes for any SaaS product.",
        "medium", "high", "now", "ux",
        ["apps/web/src/app/(auth)/forgot-password/page.tsx"],
        ["apps/api/app/api/v1/password_reset.py"],
    ),
    (
        "opp-cmd-k-search",
        "Add Cmd+K global search shortcut",
        "A keyboard-driven search overlay (Cmd+K) dramatically improves power-user productivity. The search API and semantic search service already exist.",
        "Research tools live and die by keyboard shortcuts. One modal component wires directly to the existing /search endpoint.",
        "low", "high", "now", "ux",
        ["apps/api/app/api/v1/search.py", "apps/web/src/app/(app)/search/page.tsx"],
        ["apps/web/src/components/command-palette"],
    ),
    (
        "opp-source-preview",
        "Add source content preview panel",
        "Users can add PDFs and URLs but cannot see the extracted text. A preview drawer showing raw_text chunks would let researchers verify ingestion quality.",
        "Visibility into ingested content is critical for research trust.",
        "low", "medium", "now", "ux",
        ["apps/api/app/models/source.py"],
        ["apps/web/src/components/source-preview"],
    ),
    (
        "opp-batch-upload",
        "Add batch source upload",
        "Users currently add sources one at a time. A multi-file drag-and-drop or URL list input would dramatically speed up project setup.",
        "Researchers typically process 10-50 sources per project.",
        "medium", "high", "next", "ux",
        ["apps/api/app/api/v1/sources.py"],
        [],
    ),
    (
        "opp-insight-export",
        "Add insight export (Markdown / PDF)",
        "Generated insights exist only inside Flora. A one-click export to Markdown or PDF would make them shareable artifacts.",
        "Insights are the primary deliverable of a research session.",
        "low", "medium", "next", "ux",
        ["apps/api/app/models/insight.py"],
        [],
    ),
    (
        "opp-thread-search",
        "Add search within thread history",
        "Once a researcher has long threads, finding a specific answer requires manual scrolling. Full-text search over messages would solve this.",
        "Institutional memory degrades without search.",
        "medium", "medium", "next", "ux",
        ["apps/api/app/models/thread.py"],
        [],
    ),
    (
        "opp-workspace-activity",
        "Add workspace activity feed",
        "Team workspaces have members and RBAC but no shared visibility into recent activity. An activity feed (new sources, threads, insights) builds team awareness.",
        "Collaboration tools require ambient awareness.",
        "medium", "medium", "next", "collaboration",
        ["apps/api/app/models/workspace.py", "apps/api/app/api/v1/workspaces.py"],
        [],
    ),
    (
        "opp-streaming-status",
        "Replace DB-polling SSE with Redis pub/sub for source status",
        "Source ingestion status is polled every second via SSE, opening one DB connection per active source. Redis pub/sub would eliminate this O(N) load.",
        "Scales from 1 to 100+ concurrent ingestions without degradation.",
        "medium", "high", "next", "performance",
        ["apps/api/app/api/v1/sources.py"],
        [],
    ),
    (
        "opp-s3-storage",
        "Add S3 storage backend for file uploads",
        "Uploaded files are stored on the API server's local disk. An S3Backend (the interface already exists) would enable horizontal scaling and persistent storage.",
        "LocalStorageBackend is a single point of failure for production.",
        "medium", "high", "later", "performance",
        ["apps/api/app/services/storage.py"],
        [],
    ),
    (
        "opp-project-templates",
        "Add project templates",
        "Users create projects from scratch every time. Templates (Literature Review, Market Research, Competitive Analysis) would accelerate onboarding.",
        "Templates reduce time-to-first-insight from hours to minutes.",
        "medium", "medium", "later", "ux",
        ["apps/api/app/api/v1/projects.py"],
        [],
    ),
    (
        "opp-youtube-transcript",
        "Fix YouTube ingestion to use transcript, not description",
        "YouTube sources index only the video description. Actual spoken content via subtitles/captions would make YouTube sources as valuable as PDFs.",
        "Transcript content is 10-100× richer than descriptions.",
        "medium", "high", "now", "ai",
        ["apps/api/app/services/ingestion.py"],
        [],
    ),
]


class OpportunityDetector:
    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root

    def detect(self, files: list[ScannedFile]) -> list[Opportunity]:
        existing_paths = {f.relative_path for f in files}
        opportunities = []

        for rule in _RULES:
            opp_id, title, desc, rationale, effort, impact, phase, category, requires_any, requires_none = rule

            # All required existing paths must be present
            if requires_any and not any(
                any(req in p for p in existing_paths)
                for req in requires_any
            ):
                continue

            # None of the "already exists" paths may be present
            if any(
                any(block in p for p in existing_paths)
                for block in requires_none
            ):
                continue

            opportunities.append(Opportunity(
                id=opp_id,
                title=title,
                description=desc,
                rationale=rationale,
                effort=effort,
                impact=impact,
                phase=phase,
                category=category,
            ))

        # Sort: now before next before later, then high impact first
        _phase_order = {"now": 0, "next": 1, "later": 2}
        _impact_order = {"high": 0, "medium": 1, "low": 2}
        opportunities.sort(key=lambda o: (_phase_order[o.phase], _impact_order[o.impact]))
        return opportunities
