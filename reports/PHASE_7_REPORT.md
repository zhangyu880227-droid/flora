# PHASE 7 REPORT — Stock Intelligence
*Branch: flora-os/phase7 | Date: 2026-07-10*

---

## 目标

搭建股票智能基础设施：
- 股票池（Watchlist）/ 持仓（Holdings）管理
- AI 分析持久化（StockAnalysis）
- 每日报告引擎骨架（DailyReport）

---

## 完成内容

### 1. `app/models/stock.py` — 数据模型（4张表）

| 模型 | 说明 |
|---|---|
| `StockWatchlist` | 命名自选股列表，per-user per-workspace |
| `StockWatchlistItem` | 列表中的每个 ticker |
| `StockHolding` | 真实/纸面持仓（ticker + shares + avg_cost + currency） |
| `StockAnalysis` | AI 分析快照（summary / sentiment / key_events / risks / opportunities）|
| `DailyReport` | 每日 Markdown 报告（content + sections + tickers） |

### 2. `app/services/stock_service.py` — StockService

| 方法 | 说明 |
|---|---|
| `create_watchlist / list_watchlists / get_watchlist` | 自选股 CRUD |
| `add_ticker / remove_ticker` | 管理自选股列表中的个股 |
| `upsert_holding / list_holdings / delete_holding` | 持仓管理（ticker 去重 upsert）|
| `save_analysis / list_analyses` | 存取 AI 分析结果 |
| `generate_daily_report / list_reports` | 生成持仓汇总报告（Phase 8 接入 FMP + LLM）|

### 3. `app/api/v1/stocks.py` — REST API（10 端点）

| 端点 | 说明 |
|---|---|
| `GET/POST /stocks/watchlists` | 自选股列表 |
| `POST /stocks/watchlists/{id}/tickers` | 添加个股 |
| `DELETE /stocks/watchlists/{id}/tickers/{item_id}` | 移除个股 |
| `GET /stocks/holdings` | 持仓列表 |
| `PUT /stocks/holdings` | upsert 持仓 |
| `DELETE /stocks/holdings/{id}` | 删除持仓 |
| `GET /stocks/analyses` | 分析历史（按 ticker/type 过滤）|
| `GET /stocks/reports` | 历史报告列表 |
| `POST /stocks/reports/generate` | 生成今日报告 |

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查 | ✅ 全部通过 |
| stock 路由 | ✅ 10 条 |
| Alembic upgrade head | ✅ migration f5e1c52b7fb4 成功 |
| 前端 type-check | ✅ 0 errors |

---

## Phase 8 预告

**Automatic Learning** — 自动学习管道：
- LearningSource（RSS/URL/GitHub/YouTube）+ LearningJob 模型
- 接入现有 ingestion pipeline（复用 `app.tasks.ingestion` + `app.services.ingestion`）
- 自动提取 → 摘要 → 实体关系 → 写入 Knowledge + KG + Memory
- Celery Beat 定期运行
