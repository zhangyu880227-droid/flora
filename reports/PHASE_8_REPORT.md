# PHASE 8 REPORT — Automatic Learning
*Branch: flora-os/phase8 | Merged: main @ 9221c87 | Date: 2026-07-10*

---

## 目标

搭建 **自动学习管道**：
- 定期扫描已处理的 KnowledgeDocuments（status=ready）
- 为每篇文档创建 Memory 记录（document 类型：summary；semantic 类型：实体）
- 通过 KGService 将实体写入 Knowledge Graph
- 用 LearningJob 跟踪每轮运行的统计数据

---

## 完成内容

### 1. `app/models/learning.py` — 数据模型

| 字段 | 说明 |
|---|---|
| `workspace_id` | FK workspaces，CASCADE |
| `trigger` | scheduled \| manual |
| `status` | running \| completed \| failed |
| `documents_scanned` | 本轮扫描的文档数 |
| `memories_created` | 本轮创建的 Memory 记录数 |
| `kg_nodes_updated` | 本轮更新/创建的 KG 节点数 |
| `error_message` | 失败时的错误信息 |
| `summary` | JSONB 汇总（含 since 时间戳） |

### 2. Alembic 迁移 `1d806e29bd96`

- 创建 `learning_jobs` 表
- 索引：`ix_learning_jobs_status`、`ix_learning_jobs_workspace_id`
- 已清除虚假 KG 索引 drop 语句
- `alembic upgrade head` 成功运行

### 3. `app/services/learning_service.py` — LearningService

**Pipeline 逻辑（`_learn`）：**
1. 查询自上次成功 Job 以来的所有 ready 文档（无历史则取 24h 回溯窗口）
2. 每篇文档：
   - 若有 summary → 创建 `MemoryType.document`（key=`doc:{id}`，幂等去重）
   - 若有 entities → 创建 `MemoryType.semantic`（key=`entities:{id}`）→ 调 `KGService.link_memory_entities()`
3. 使用 `Workspace.owner_id` 作为 Memory 的 user_id（满足 FK 约束）
4. 统计并写入 LearningJob record

**关键设计决策：**
- 采用 workspace owner 的 user_id（非虚构 UUID(int=0)），保证 FK 完整性
- 文档级 Memory 幂等：通过 `get_by_key` 检查 key 是否已存在
- 实体 Memory 通过 `KGService.link_memory_entities` 桥接到 KG，并在 meta 中存储 `kg_node_ids`
- 支持每轮最多 100 篇文档、每篇最多 20 个实体（防止长尾文档拖慢任务）

### 4. `app/tasks/learning_tasks.py` — Celery Task

- Task name: `flora.learning.run`
- 支持 `workspace_id=None`（全量）或单个 workspace
- 每个 workspace 独立 commit/rollback，防止一个失败影响全体

### 5. `app/tasks/celery_app.py` — Beat 调度

```python
"flora-auto-learning": {
    "task": "flora.learning.run",
    "schedule": schedule(run_every=3600),   # 每小时
    "options": {"expires": 3500},
}
```

### 6. `app/api/v1/learning.py` — REST API（3 端点）

| 端点 | 说明 |
|---|---|
| `GET /workspaces/{id}/learning/jobs` | 列出最近的 LearningJob（最多 100 条）|
| `POST /workspaces/{id}/learning/run` | 立即触发一次学习任务（Celery 异步）|
| `GET /workspaces/{id}/learning/stats` | 聚合统计：总文档/记忆/KG 更新数 |

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（py_compile） | ✅ 全部通过 |
| 前端 type-check（tsc --noEmit） | ✅ 0 errors |
| Alembic upgrade head | ✅ 1d806e29bd96 成功 |
| 路由注册 | ✅ learning router 挂载 |
| main 分支 push | ✅ 9221c87 |

---

## Phase 9 预告

**Self-Improvement Loop**（自我提升循环）：
- 代码质量扫描（bug/TODO/dead code）→ 生成修复建议 / 测试用例
- 扩展现有 `app/engine/` 目录（core.py + analyzers/ + fixers/ + generators/）
- 健康仪表板：技术债、覆盖率、模型表现趋势
