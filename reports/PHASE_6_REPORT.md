# PHASE 6 REPORT — AI Agent Framework
*Branch: flora-os/phase6 | Date: 2026-07-10*

---

## 目标

构建可扩展的 AI Agent 执行框架：
- AgentJob（用户意图）+ AgentExecution（单次执行）数据模型
- Manager/Planner（AgentService）+ Executor（注册式插件）
- Celery 异步调度 + 重试
- 执行历史 + 日志 API

---

## 完成内容

### 1. `app/models/agent.py` — 数据模型

**AgentJob**
- workspace_id / user_id / agent_type / name / goal / input_data(JSONB)
- status: pending → running → completed/failed/cancelled
- result(JSONB) / error_message / celery_task_id

**AgentExecution**
- job_id / workspace_id / status / attempt / celery_task_id
- steps: `list[{step, tool, input, output, ts}]` — 完整执行日志
- output(JSONB) / error_message / duration_ms

### 2. `app/services/agent_service.py` — Agent Manager

| 方法 | 说明 |
|---|---|
| `create_job(...)` | 创建 AgentJob，状态 pending |
| `get_job / list_jobs / cancel_job` | 完整生命周期管理 |
| `create_execution(job, attempt)` | 创建 AgentExecution |
| `run_execution(execution_id)` | 分发到注册的 executor；记录 steps；更新 job.status |
| `list_executions(job_id)` | 查询执行历史 |

**Executor 注册机制**
```python
@register_executor("research")
async def _research_executor(job, steps, db) -> dict:
    ...
```
新 agent 类型只需 `@register_executor("my_type")` 即可接入框架，无需改动路由/service。

### 3. 内置 Executors（3个）

| 类型 | 说明 |
|---|---|
| `research` | 调用 hybrid_search → 从知识库检索相关 chunk → 合成答案 |
| `summarize` | 对输入文本做截断摘要（Phase 7 替换为 LLM 流式输出）|
| `extract_entities` | 基础 NER（大写词） → 写入 KG（via KGService.link_memory_entities）|

### 4. `app/tasks/agent_tasks.py` — Celery 任务

```python
@celery_app.task(name="app.tasks.agent_tasks.run_agent_execution", max_retries=2)
def run_agent_execution(self, execution_id: str) -> dict
```
失败时自动重试（30s 间隔），最多 2 次。

### 5. `app/api/v1/agents.py` — REST API（6 端点）

| 端点 | 说明 |
|---|---|
| `GET /agents/types` | 返回支持的 agent 类型列表 |
| `GET /agents/jobs` | 分页列表（按 type/status 过滤）|
| `POST /agents/jobs` | 创建 + 立即 Celery 调度 |
| `GET /agents/jobs/{id}` | 获取单个 job |
| `DELETE /agents/jobs/{id}` | 取消 job |
| `GET /agents/jobs/{id}/executions` | 执行历史 |

---

## Alembic 迁移链

```
... → 7314356adf4a (memories) → aae1e08d158c (agent_jobs + agent_executions)
```

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（115 文件） | ✅ 全部通过 |
| executor 注册 | ✅ research / summarize / extract_entities |
| agents 路由 | ✅ 6 条 |
| Alembic upgrade head | ✅ migration 成功 |
| 前端 type-check | ✅ 0 errors |

---

## 架构亮点

- **插件式 executor**：`@register_executor("type")` 即接入，框架零修改
- **steps 日志**：每个 executor 向 steps list 追加事件，持久化到 AgentExecution.steps
- **双向状态同步**：job.status 跟随 execution 状态；支持多 attempt 重试（execution.attempt 递增）
- **与 Phase 5 连接**：extract_entities executor 通过 KGService 将实体写入 KG

---

## Phase 7 预告

**Stock Intelligence**：
- StockWatchlist / StockHolding / StockAnalysis 模型
- 接入 FMP 数据（已有 MCP 工具）
- 每日报告引擎（新 Celery Beat 任务）
- 新闻/公告/财报 → 知识库 → AI 摘要
