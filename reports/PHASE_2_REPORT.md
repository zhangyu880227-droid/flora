# PHASE 2 REPORT — Domain Model Extension + localStorage Removal
*Branch: flora-os/phase2 | Date: 2026-07-10*

---

## 目标

按 FLORA_OS_EXECUTION.md Phase 2 要求，分批扩展领域模型，同时完成 Phase 3 localStorage 迁移：

- 批次 A：Tasks — workspace-scoped 任务管理
- 批次 B：Memory — 五层记忆模型
- 批次 C + Phase 3：前端类型同步 + localStorage → API

---

## 完成内容

### 批次 A — Tasks（任务管理）

**后端**

| 文件 | 说明 |
|---|---|
| `app/models/task.py` | Task ORM 模型；TaskStatus (todo/in_progress/done)；TaskPriority (low/medium/high) |
| `app/repositories/task.py` | TaskRepository；list_for_workspace / count_for_workspace / get_for_user |
| `app/schemas/task.py` | TaskCreate / TaskUpdate / TaskRead (Pydantic v2) |
| `app/services/task_service.py` | TaskService：list_tasks / create_task / get_task / update_task / delete_task |
| `app/api/v1/tasks.py` | REST CRUD：GET/POST /workspaces/{id}/tasks；GET/PATCH/DELETE /workspaces/{id}/tasks/{id} |
| `migrations/versions/af57b2ca30bf_add_tasks_table.py` | 创建 tasks 表 + 4 个索引 (workspace_id, user_id, project_id, status) |

**路由（均使用统一信封）**
```
GET    /api/v1/workspaces/{workspace_id}/tasks          — 分页列表（可按 status/project_id 过滤）
POST   /api/v1/workspaces/{workspace_id}/tasks          — 创建任务（201）
GET    /api/v1/workspaces/{workspace_id}/tasks/{id}     — 获取单条
PATCH  /api/v1/workspaces/{workspace_id}/tasks/{id}     — 部分更新
DELETE /api/v1/workspaces/{workspace_id}/tasks/{id}     — 删除
```

---

### 批次 B — Memory（五层记忆）

**后端**

| 文件 | 说明 |
|---|---|
| `app/models/memory.py` | Memory ORM 模型；MemoryType（working/long_term/conversation/semantic/document） |
| `app/repositories/memory.py` | MemoryRepository；list_for_user / get_by_key / increment_access / purge_working_memory |
| `app/schemas/memory.py` | MemoryCreate / MemoryUpdate / MemoryRead |
| `app/services/memory_service.py` | MemoryService：upsert（key 去重） / get（自增 access_count） / purge_working_memory |
| `app/api/v1/memories.py` | REST CRUD + working-memory purge endpoint |
| `migrations/versions/7314356adf4a_add_memories_table.py` | 创建 memories 表 + 6 个索引 |

**路由**
```
GET    /api/v1/workspaces/{id}/memories                     — 分页（按 type/project/thread/key前缀过滤）
POST   /api/v1/workspaces/{id}/memories                     — 创建或 key-upsert（201）
GET    /api/v1/workspaces/{id}/memories/{mid}               — 获取（自增 access_count）
PATCH  /api/v1/workspaces/{id}/memories/{mid}               — 更新
DELETE /api/v1/workspaces/{id}/memories/{mid}               — 删除
DELETE /api/v1/workspaces/{id}/memories/working/purge       — 清除 working-memory
```

---

### 批次 C + Phase 3 — 前端类型同步 + localStorage 移除

**类型包** (`packages/types`)
- 新增 `task.ts`：Task / CreateTaskRequest / UpdateTaskRequest / TaskStatus / TaskPriority
- 新增 `memory.ts`：Memory / CreateMemoryRequest / UpdateMemoryRequest / MemoryType
- `index.ts` re-exports 两个新模块

**API 客户端** (`apps/web/src/lib/api/`)
- `client.ts`：新增 `api.patch<T>()` 方法
- `index.ts`：新增 `tasksApi`（自动 unwrap 信封 `{ok, data}` → `data`）；正确导入新类型

**状态管理**（`apps/web/src/stores/tasks.ts`）
- 删除 Zustand `persist` store（flora-tasks localStorage key）
- 改为 React Query hooks：`useTasks` / `useCreateTask` / `useUpdateTask` / `useDeleteTask`
- 保持类型 re-export（TaskStatus / TaskPriority）供 UI 层使用

**页面更新**
- `app/(app)/tasks/page.tsx`：移除 useTasksStore；改用 useQuery + useMutation hooks；添加 loading state；无 workspace 时显示提示
- `app/(app)/workspace/page.tsx`：移除 useTasksStore；改用 useTasks(workspaceId)；修复隐式 any 类型

---

## Alembic 迁移链

```
a5132c7dcdb9 (initial)
  → ac93fb51fadf (knowledge_pipeline)
    → c4a1d8e52b93 (knowledge_graph)
      → d8f2a4c91e07 (knowledge_enrichment)
        → af57b2ca30bf (add_tasks_table)      ← Phase 2A
          → 7314356adf4a (add_memories_table)  ← Phase 2B
```

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（111 文件） | ✅ 全部通过 |
| 新模块 imports | ✅ task, memory, tasks_api, memories_api 全部可导入 |
| Alembic upgrade head | ✅ 两个 migration 成功应用到 DB |
| 前端 `pnpm type-check` | ✅ 0 errors |
| tasks 路由注册 | ✅ 5 条路由 |
| memories 路由注册 | ✅ 6 条路由 |

---

## 架构影响

- **Repository Pattern** 延伸：TaskRepository + MemoryRepository 均继承 BaseRepository[M]
- **信封格式**：所有新路由使用 `ok()` / `err()` / `paginated()`
- **前端 localStorage 清零**：Task 数据不再写入 localStorage；React Query 提供服务端状态管理 + 30s staleTime 缓存
- **Key-based upsert**：MemoryService.upsert_memory 按 (workspace_id, user_id, type, key) 去重，AI 引擎可幂等写入同一 key

---

## Phase 4 预告

按 FLORA_OS_EXECUTION.md Phase 4：Memory Engine
- `app/engine/memory_engine.py`：定期扫描 Conversation Memory → 压缩为 Long-term Memory
- `app/tasks/memory_tasks.py`：Celery Beat 任务，触发记忆整合
- 依赖 Phase 2B 的 `memories` 表 + MemoryRepository（已就绪）
