# PHASE 4 REPORT — Memory Engine
*Branch: flora-os/phase4 | Date: 2026-07-10*

---

## 目标

在 Phase 2B 的 `memories` 表基础上，构建 Memory Engine：
- Auto-summarize 对话历史 → 压缩为 Long-term memory
- 自动标注无 key 的 memory（auto-key）
- 清理过期 working memory
- Memory 搜索 / 统计 / 时间线 API
- Celery Beat 定期运行

---

## 完成内容

### 1. `app/services/memory_engine.py` — 核心引擎

| 方法 | 说明 |
|---|---|
| `run_for_workspace(workspace_id)` | 主入口，返回 `{consolidated, pruned, tagged}` |
| `_prune_working_memories` | 删除超过 4 小时的 working memory |
| `_tag_unkeyed_memories` | 为没有 key 的 memory 分配自动 key（取内容前4词） |
| `_consolidate_conversations` | 将超过 6 小时的 conversation memory（≥5条）压缩为一条 long-term summary |

**设计决策**：Phase 4 使用本地轻量摘要（内容拼接 + 截断）。Phase 5 将通过 `get_provider().complete()` 接入 LLM 实现语义摘要，当时 provider ABC 会新增非流式 `complete(messages)` 方法。

### 2. `app/tasks/memory_tasks.py` — Celery 任务

```python
@celery_app.task(name="app.tasks.memory_tasks.run_memory_engine")
def run_memory_engine(workspace_id: str | None = None) -> dict:
```

- 支持单 workspace 或全部 workspace（遍历所有有 memories 的 workspace）
- 错误隔离：单个 workspace 失败不影响其他

### 3. `app/tasks/celery_app.py` — Beat Schedule 新增

```python
"flora-memory-engine": {
    "task": "app.tasks.memory_tasks.run_memory_engine",
    "schedule": schedule(run_every=7200),   # 每 2 小时
    "options": {"expires": 7100},
}
```

### 4. `app/api/v1/memories.py` — 新增 4 个端点

| 端点 | 说明 |
|---|---|
| `GET /memories/search?q=...` | ILIKE 全文搜索（content + key）；可按 type 过滤 |
| `GET /memories/stats` | 按 MemoryType 分组计数 |
| `GET /memories/timeline?days=30` | 按天分组的创建数量（类型维度） |
| `POST /memories/engine/run` | 手动触发 Memory Engine（Celery 异步）|

### 5. `app/repositories/memory.py` — 新增 `list_for_workspace`

```python
async def list_for_workspace(
    workspace_id, *, memory_type=None, limit=500, offset=0
) -> list[Memory]
```
Engine 任务需要跨用户查询同一 workspace 的 memories，不能用 `list_for_user`。

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（111 文件） | ✅ 全部通过 |
| memory_engine 导入 | ✅ OK |
| memory_tasks 导入 | ✅ OK |
| memories 路由 | ✅ 10 条路由 |
| Celery task 注册 | ✅ include 中新增 app.tasks.memory_tasks |

---

## 架构影响

- **Engine 与 Service 分离**：MemoryService 处理用户 CRUD；MemoryEngine 处理跨用户批量处理（Engine 直接调 repo，不经 service）
- **向后兼容**：现有 CRUD 端点未改动；新增端点用同一 router prefix
- **Celery Beat**：现有 self-improvement + knowledge loop 不受影响；memory engine 独立周期（2h）

---

## Phase 5 预告

**Knowledge Graph 增强**（复用现有 `kg_nodes` / `kg_edges`）
- 实体/关系抽取服务（LLM + Spacy）
- 去重 + 冲突检测
- Graph API：邻居查询 / 路径搜索 / 中心性计算
- Memory ↔ KG 连接：将 semantic/long_term memory 的关键实体写入 KG
