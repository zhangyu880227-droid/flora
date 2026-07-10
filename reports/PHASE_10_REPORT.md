# PHASE 10 REPORT — Unified Dashboard
*Branch: flora-os/phase10 | Merged: main @ 8b74d30 | Date: 2026-07-10*

---

## 目标

搭建连接所有 Flora OS 子系统的**统一仪表板**：
- 今日任务 / Agent 状态 / 学习进度 / Memory 数量 / KG 节点
- 系统健康 / 推荐改进 / 最近 Agent 活动

---

## 完成内容

### 1. `packages/types/src/dashboard.ts` — 新 TypeScript 类型

| 类型 | 说明 |
|---|---|
| `AgentJob` | Agent 任务记录（来自 Phase 6 后端）|
| `LearningStats` / `LearningJob` | 自动学习统计（来自 Phase 8 后端）|
| `StockReport` / `StockWatchlist` / `StockHolding` | 股票智能（来自 Phase 7 后端）|

### 2. `packages/types/src/engine.ts` — `EngineHealthDashboard` 类型

对应 Phase 9 新增的 `/engine/health` 端点返回结构：
```typescript
interface EngineHealthDashboard {
  health_score: number
  health_trend: Array<{ scan: string; score: number }>
  total_findings: number
  by_severity: Record<string, number>
  top_issues: EngineFinding[]
  recommended_tasks: EngineTask[]
  coverage_gaps: Array<{ module: string; missing_test: string }>
  priority_opportunities: EngineOpportunity[]
  last_scan: string | null
  scan_count: number
}
```

### 3. `apps/web/src/lib/api/index.ts` — 新 API 包装函数

| 导出 | 端点 | 说明 |
|---|---|---|
| `memoriesApi.stats` | `GET /workspaces/{id}/memories/stats` | Memory 数量（按类型）|
| `agentsApi.listJobs` | `GET /workspaces/{id}/agents/jobs` | Agent 任务列表 |
| `learningApi.stats` | `GET /workspaces/{id}/learning/stats` | 学习进度汇总 |
| `learningApi.jobs` | `GET /workspaces/{id}/learning/jobs` | 学习任务历史 |
| `learningApi.run` | `POST /workspaces/{id}/learning/run` | 手动触发学习 |
| `stocksApi.reports` | `GET /workspaces/{id}/stocks/reports` | 每日报告列表 |
| `stocksApi.watchlists` | `GET /workspaces/{id}/stocks/watchlists` | 自选股 |
| `stocksApi.holdings` | `GET /workspaces/{id}/stocks/holdings` | 持仓 |
| `engineHealthApi.health` | `GET /engine/health` | 统一健康仪表板数据 |

所有新增 API 均遵循现有 `Envelope<T>` 解包约定。

### 4. `apps/web/src/app/(app)/dashboard/page.tsx` — 统一仪表板页面

**布局（三行）：**

**第一行（4列 stat cards）：**
- 今日任务数（todo 状态）
- Memory 记录总数（含 doc/entity 细分）
- KG 节点数
- 活跃 Agent 数

**第二行（2/3 + 1/3）：**
- 系统健康面板：分数 + 进度条 + severity 分布 + 前 3 个 Top Issues
- 自动学习面板：已完成 Jobs / 扫描文档 / 生成记忆 / KG 更新

**第三行（1/2 + 1/2，+ 可选全宽）：**
- 待办任务列表（优先级色标）
- 最近 Agent Jobs（状态色标，running 状态闪烁）
- 推荐改进任务卡（来自 engine health，按 score 排序）

**技术细节：**
- 全部用 TanStack Query，staleTime 30-60s，无 localStorage
- 无 workspace 时各 card 优雅降级（显示提示而不崩溃）
- 骨架加载（Skeleton）防止 layout shift

### 5. `apps/web/src/components/app-sidebar.tsx` — 侧边栏导航更新

在 Home 下方新增 Dashboard 导航项（使用 `Activity` 图标，区别于 Home 的 `LayoutDashboard`）。

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| TypeScript type-check（tsc --noEmit） | ✅ 0 errors |
| main 分支 push | ✅ 8b74d30 |

---

## 全阶段完成总结

| Phase | 功能 | 状态 |
|---|---|---|
| 1 | 后端地基（Repository Pattern + 统一响应体 + 日志中间件） | ✅ 完成 |
| 2 | 领域模型扩展（Tasks + Memory + 前端 React Query 迁移） | ✅ 完成 |
| 3 | 移除 localStorage（合并至 Phase 2） | ✅ 完成 |
| 4 | Memory Engine（Celery 定时巩固/剪枝/标记） | ✅ 完成 |
| 5 | Knowledge Graph 增强（搜索/邻居/合并/Memory 链接） | ✅ 完成 |
| 6 | Agent 框架（注册器 + research/summarize/extract_entities 执行器） | ✅ 完成 |
| 7 | 股票智能（Watchlist/Holdings/Analysis/DailyReport） | ✅ 完成 |
| 8 | 自动学习（KnowledgeDoc → Memory + KG，Celery 每小时）| ✅ 完成 |
| 9 | 自改进循环（Performance Analyzer + Test Generator + Health Dashboard API）| ✅ 完成 |
| 10 | 统一仪表板（连接所有子系统的前端 Dashboard 页面）| ✅ 完成 |
