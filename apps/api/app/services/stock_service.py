"""Stock Intelligence service — manage watchlists, holdings, analyses, and daily reports.

Phase 7: data model + CRUD + basic daily report skeleton.
Phase 8+ will integrate live FMP data (news, quotes, financials) and LLM analysis.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.models.stock import DailyReport, StockAnalysis, StockHolding, StockWatchlist, StockWatchlistItem

log = get_logger(__name__)


class StockService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Watchlist ─────────────────────────────────────────────────────────

    async def create_watchlist(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        name: str,
        description: str | None = None,
        is_default: bool = False,
    ) -> StockWatchlist:
        wl = StockWatchlist(
            workspace_id=workspace_id,
            user_id=user_id,
            name=name,
            description=description,
            is_default=is_default,
        )
        self._db.add(wl)
        await self._db.flush()
        return wl

    async def list_watchlists(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[StockWatchlist]:
        result = await self._db.execute(
            select(StockWatchlist)
            .where(
                StockWatchlist.workspace_id == workspace_id,
                StockWatchlist.user_id == user_id,
            )
            .order_by(StockWatchlist.is_default.desc(), StockWatchlist.created_at)
        )
        return list(result.scalars().all())

    async def get_watchlist(
        self, watchlist_id: uuid.UUID, workspace_id: uuid.UUID
    ) -> StockWatchlist:
        wl = await self._db.get(StockWatchlist, watchlist_id)
        if not wl or wl.workspace_id != workspace_id:
            raise NotFoundError(f"Watchlist {watchlist_id} not found")
        return wl

    async def add_ticker(
        self,
        watchlist_id: uuid.UUID,
        workspace_id: uuid.UUID,
        ticker: str,
        company_name: str | None = None,
        sector: str | None = None,
        notes: str | None = None,
    ) -> StockWatchlistItem:
        await self.get_watchlist(watchlist_id, workspace_id)  # auth check
        item = StockWatchlistItem(
            watchlist_id=watchlist_id,
            ticker=ticker.upper(),
            company_name=company_name,
            sector=sector,
            notes=notes,
        )
        self._db.add(item)
        await self._db.flush()
        return item

    async def remove_ticker(
        self,
        watchlist_id: uuid.UUID,
        workspace_id: uuid.UUID,
        item_id: uuid.UUID,
    ) -> None:
        await self.get_watchlist(watchlist_id, workspace_id)
        item = await self._db.get(StockWatchlistItem, item_id)
        if not item or item.watchlist_id != watchlist_id:
            raise NotFoundError(f"WatchlistItem {item_id} not found")
        await self._db.delete(item)
        await self._db.flush()

    # ── Holdings ──────────────────────────────────────────────────────────

    async def upsert_holding(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        ticker: str,
        shares: float,
        avg_cost: float,
        currency: str = "USD",
        company_name: str | None = None,
        notes: str | None = None,
    ) -> StockHolding:
        ticker = ticker.upper()
        result = await self._db.execute(
            select(StockHolding).where(
                StockHolding.workspace_id == workspace_id,
                StockHolding.user_id == user_id,
                StockHolding.ticker == ticker,
            )
        )
        holding = result.scalar_one_or_none()
        if holding:
            holding.shares = shares
            holding.avg_cost = avg_cost
            holding.currency = currency
            if company_name:
                holding.company_name = company_name
            if notes is not None:
                holding.notes = notes
        else:
            holding = StockHolding(
                workspace_id=workspace_id,
                user_id=user_id,
                ticker=ticker,
                shares=shares,
                avg_cost=avg_cost,
                currency=currency,
                company_name=company_name,
                notes=notes,
            )
            self._db.add(holding)
        await self._db.flush()
        return holding

    async def list_holdings(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[StockHolding]:
        result = await self._db.execute(
            select(StockHolding)
            .where(
                StockHolding.workspace_id == workspace_id,
                StockHolding.user_id == user_id,
            )
            .order_by(StockHolding.ticker)
        )
        return list(result.scalars().all())

    async def delete_holding(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID, holding_id: uuid.UUID
    ) -> None:
        holding = await self._db.get(StockHolding, holding_id)
        if not holding or holding.workspace_id != workspace_id or holding.user_id != user_id:
            raise NotFoundError(f"Holding {holding_id} not found")
        await self._db.delete(holding)
        await self._db.flush()

    # ── Analysis ──────────────────────────────────────────────────────────

    async def save_analysis(
        self,
        workspace_id: uuid.UUID,
        ticker: str,
        analysis_type: str,
        raw_data: dict,
        summary: str | None = None,
        sentiment: str | None = None,
        key_events: list | None = None,
        risks: list | None = None,
        opportunities: list | None = None,
        confidence_score: int = 50,
    ) -> StockAnalysis:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        analysis = StockAnalysis(
            workspace_id=workspace_id,
            ticker=ticker.upper(),
            analysis_type=analysis_type,
            raw_data=raw_data,
            summary=summary,
            sentiment=sentiment,
            key_events=key_events or [],
            risks=risks or [],
            opportunities=opportunities or [],
            confidence_score=confidence_score,
            date=date,
        )
        self._db.add(analysis)
        await self._db.flush()
        return analysis

    async def list_analyses(
        self,
        workspace_id: uuid.UUID,
        ticker: str | None = None,
        analysis_type: str | None = None,
        limit: int = 20,
    ) -> list[StockAnalysis]:
        filters = [StockAnalysis.workspace_id == workspace_id]
        if ticker:
            filters.append(StockAnalysis.ticker == ticker.upper())
        if analysis_type:
            filters.append(StockAnalysis.analysis_type == analysis_type)
        result = await self._db.execute(
            select(StockAnalysis)
            .where(*filters)
            .order_by(StockAnalysis.date.desc(), StockAnalysis.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ── Daily Report ──────────────────────────────────────────────────────

    async def generate_daily_report(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> DailyReport:
        """Generate a daily report summary. Phase 7 skeleton — Phase 8 adds LLM+FMP data."""
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        holdings = await self.list_holdings(workspace_id, user_id)
        tickers = [h.ticker for h in holdings]

        content_lines = [
            f"# Flora Daily Report — {date}",
            "",
            f"**Holdings tracked:** {len(holdings)}",
            "",
        ]
        if holdings:
            content_lines.append("## Portfolio Summary")
            for h in holdings:
                market_value = h.shares * (h.last_price or h.avg_cost)
                content_lines.append(
                    f"- **{h.ticker}**: {h.shares:.2f} shares @ {h.avg_cost:.2f} "
                    f"({h.currency}) — Market value: {market_value:.2f}"
                )

        content_lines += [
            "",
            "## Knowledge Base Activity",
            "_(Connect to FMP + Knowledge pipeline in Phase 8 for live market intelligence)_",
        ]

        report = DailyReport(
            workspace_id=workspace_id,
            date=date,
            content="\n".join(content_lines),
            sections={"portfolio": [h.ticker for h in holdings]},
            tickers=tickers,
            status="ready",
        )
        self._db.add(report)
        await self._db.flush()
        log.info("stock.daily_report_generated", extra={"workspace_id": str(workspace_id), "date": date})
        return report

    async def list_reports(
        self, workspace_id: uuid.UUID, limit: int = 30
    ) -> list[DailyReport]:
        result = await self._db.execute(
            select(DailyReport)
            .where(DailyReport.workspace_id == workspace_id)
            .order_by(DailyReport.date.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
