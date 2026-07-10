"""Stock Intelligence models — watchlists, holdings, daily analysis."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class StockWatchlist(Base, UUIDMixin, TimestampMixin):
    """A named watchlist of tickers, owned by a workspace."""
    __tablename__ = "stock_watchlists"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    items: Mapped[list["StockWatchlistItem"]] = relationship(
        "StockWatchlistItem", back_populates="watchlist", cascade="all, delete-orphan"
    )


class StockWatchlistItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "stock_watchlist_items"

    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_watchlists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    watchlist: Mapped["StockWatchlist"] = relationship("StockWatchlist", back_populates="items")


class StockHolding(Base, UUIDMixin, TimestampMixin):
    """A real or paper-trading position."""
    __tablename__ = "stock_holdings"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shares: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    # Snapshot of last known price (refreshed by daily report engine)
    last_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_price_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class StockAnalysis(Base, UUIDMixin, TimestampMixin):
    """AI-generated analysis for a ticker (event-driven or daily)."""
    __tablename__ = "stock_analyses"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # daily | event | earnings | news
    analysis_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Raw data snapshot used for analysis (price, news, financials, etc.)
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # AI output
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)  # positive|neutral|negative
    key_events: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    risks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    opportunities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Numeric scores 0-100
    confidence_score: Mapped[int] = mapped_column(Integer, nullable=False, default=50)

    date: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"StockAnalysis(ticker={self.ticker}, type={self.analysis_type}, date={self.date})"


class DailyReport(Base, UUIDMixin, TimestampMixin):
    """Daily AI digest combining market overview + watchlist + holdings."""
    __tablename__ = "daily_reports"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # Full markdown report
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured data sections
    sections: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Tickers covered
    tickers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
