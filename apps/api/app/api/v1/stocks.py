"""Stock Intelligence API — watchlists, holdings, analyses, daily reports."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.errors import NotFoundError
from app.core.response import err, ok
from app.models.workspace import WorkspaceMember
from app.services.stock_service import StockService

router = APIRouter()


async def _assert_member(workspace_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a workspace member")


# ── Pydantic schemas ───────────────────────────────────────────────────────

class WatchlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    is_default: bool = False


class TickerAdd(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    company_name: str | None = None
    sector: str | None = None
    notes: str | None = None


class HoldingUpsert(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    shares: float = Field(..., gt=0)
    avg_cost: float = Field(..., ge=0)
    currency: str = Field("USD", max_length=10)
    company_name: str | None = None
    notes: str | None = None


# ── Watchlists ─────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/stocks/watchlists")
async def list_watchlists(
    workspace_id: uuid.UUID, current_user: CurrentUser, db: DB
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    wls = await svc.list_watchlists(workspace_id, current_user.id)
    return ok([
        {
            "id": str(wl.id), "name": wl.name, "description": wl.description,
            "is_default": wl.is_default,
            "items": [
                {"id": str(i.id), "ticker": i.ticker, "company_name": i.company_name,
                 "sector": i.sector, "notes": i.notes}
                for i in (wl.items or [])
            ],
            "created_at": wl.created_at.isoformat(),
        }
        for wl in wls
    ])


@router.post("/workspaces/{workspace_id}/stocks/watchlists", status_code=201)
async def create_watchlist(
    workspace_id: uuid.UUID, body: WatchlistCreate, current_user: CurrentUser, db: DB
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    wl = await svc.create_watchlist(
        workspace_id, current_user.id, body.name, body.description, body.is_default
    )
    await db.commit()
    await db.refresh(wl)
    return ok({"id": str(wl.id), "name": wl.name, "is_default": wl.is_default})


@router.post("/workspaces/{workspace_id}/stocks/watchlists/{watchlist_id}/tickers", status_code=201)
async def add_ticker(
    workspace_id: uuid.UUID,
    watchlist_id: uuid.UUID,
    body: TickerAdd,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    try:
        item = await svc.add_ticker(
            watchlist_id, workspace_id, body.ticker,
            body.company_name, body.sector, body.notes,
        )
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    await db.refresh(item)
    return ok({"id": str(item.id), "ticker": item.ticker})


@router.delete("/workspaces/{workspace_id}/stocks/watchlists/{watchlist_id}/tickers/{item_id}")
async def remove_ticker(
    workspace_id: uuid.UUID,
    watchlist_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    try:
        await svc.remove_ticker(watchlist_id, workspace_id, item_id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok({"deleted": True})


# ── Holdings ───────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/stocks/holdings")
async def list_holdings(workspace_id: uuid.UUID, current_user: CurrentUser, db: DB):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    holdings = await svc.list_holdings(workspace_id, current_user.id)
    return ok([
        {
            "id": str(h.id), "ticker": h.ticker, "company_name": h.company_name,
            "shares": h.shares, "avg_cost": h.avg_cost, "currency": h.currency,
            "last_price": h.last_price, "last_price_date": h.last_price_date,
            "notes": h.notes, "created_at": h.created_at.isoformat(),
        }
        for h in holdings
    ])


@router.put("/workspaces/{workspace_id}/stocks/holdings")
async def upsert_holding(
    workspace_id: uuid.UUID, body: HoldingUpsert, current_user: CurrentUser, db: DB
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    holding = await svc.upsert_holding(
        workspace_id, current_user.id,
        body.ticker, body.shares, body.avg_cost, body.currency,
        body.company_name, body.notes,
    )
    await db.commit()
    await db.refresh(holding)
    return ok({
        "id": str(holding.id), "ticker": holding.ticker,
        "shares": holding.shares, "avg_cost": holding.avg_cost,
    })


@router.delete("/workspaces/{workspace_id}/stocks/holdings/{holding_id}")
async def delete_holding(
    workspace_id: uuid.UUID, holding_id: uuid.UUID, current_user: CurrentUser, db: DB
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    try:
        await svc.delete_holding(workspace_id, current_user.id, holding_id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok({"deleted": True})


# ── Analyses ───────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/stocks/analyses")
async def list_analyses(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    ticker: str | None = Query(None),
    analysis_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    analyses = await svc.list_analyses(workspace_id, ticker, analysis_type, limit)
    return ok([
        {
            "id": str(a.id), "ticker": a.ticker, "analysis_type": a.analysis_type,
            "date": a.date, "summary": a.summary, "sentiment": a.sentiment,
            "key_events": a.key_events, "risks": a.risks, "opportunities": a.opportunities,
            "confidence_score": a.confidence_score,
        }
        for a in analyses
    ])


# ── Daily Report ───────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/stocks/reports")
async def list_reports(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(30, ge=1, le=90),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    reports = await svc.list_reports(workspace_id, limit)
    return ok([
        {
            "id": str(r.id), "date": r.date, "status": r.status,
            "tickers": r.tickers, "content": r.content,
        }
        for r in reports
    ])


@router.post("/workspaces/{workspace_id}/stocks/reports/generate", status_code=201)
async def generate_report(
    workspace_id: uuid.UUID, current_user: CurrentUser, db: DB
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = StockService(db)
    report = await svc.generate_daily_report(workspace_id, current_user.id)
    await db.commit()
    await db.refresh(report)
    return ok({
        "id": str(report.id), "date": report.date,
        "status": report.status, "tickers": report.tickers,
        "content": report.content,
    })
