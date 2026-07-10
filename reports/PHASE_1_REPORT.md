# PHASE 1 REPORT — Backend Foundation
*Branch: flora-os/phase1 | Date: 2026-07-10*

---

## 目标

不改业务行为，只夯实骨架：
- Repository Pattern（`app/repositories/`）
- 统一响应信封（`{ ok, data, error, meta }`）
- 全局错误处理（`AppError` 层级 + FastAPI exception handler）
- 统一校验（Pydantic v2，已存在；本阶段加 schema 约束接口）
- 结构化日志（JSON logger + REQUEST_ID 上下文变量）
- Request-id 中间件 + 请求日志中间件
- Cache 接口（Memory 实现 + Redis 存根）

---

## 完成内容

### 1. `app/core/errors.py` — 领域错误体系

| 类 | code | http_status |
|---|---|---|
| `AppError` | INTERNAL_ERROR | 500 |
| `ValidationError` | VALIDATION_ERROR | 422 |
| `UnauthorizedError` | UNAUTHORIZED | 401 |
| `ForbiddenError` | FORBIDDEN | 403 |
| `NotFoundError` | NOT_FOUND | 404 |
| `ConflictError` | CONFLICT | 409 |
| `RateLimitError` | RATE_LIMITED | 429 |
| `ServiceUnavailableError` | SERVICE_UNAVAILABLE | 503 |
| `ExternalServiceError` | EXTERNAL_SERVICE_ERROR | 502 |
| `WorkspaceNotFoundError` | WORKSPACE_NOT_FOUND | 404 |
| `ProjectNotFoundError` | PROJECT_NOT_FOUND | 404 |
| `SourceNotFoundError` | SOURCE_NOT_FOUND | 404 |
| `ThreadNotFoundError` | THREAD_NOT_FOUND | 404 |
| `InsightNotFoundError` | INSIGHT_NOT_FOUND | 404 |
| `UserNotFoundError` | USER_NOT_FOUND | 404 |
| `InvalidCredentialsError` | INVALID_CREDENTIALS | 401 |
| `TokenExpiredError` | TOKEN_EXPIRED | 401 |
| `IngestionError` | INGESTION_ERROR | 422 |
| `EmbeddingError` | EMBEDDING_ERROR | 502 |
| `LLMError` | LLM_ERROR | 502 |

### 2. `app/core/response.py` — 统一响应信封

```python
# 成功
return ok(data)
return ok(items, meta=PaginationMeta.of(total, page, page_size))
return paginated(items, total, page, page_size)

# 失败
body, status = err("NOT_FOUND", "Project not found", http_status=404)
```

信封格式：
```json
{ "ok": true,  "data": <payload>, "error": null,  "meta": null }
{ "ok": false, "data": null,      "error": {"code":"...", "message":"..."}, "meta": null }
```

**向后兼容**：现有路由保持原有返回格式，Phase 2+ 新路由使用信封。

### 3. `app/core/logging.py` — 结构化日志

- `configure_logging(environment, level)` — 生产环境 JSON formatter，开发环境带颜色的可读格式
- `get_logger(name)` — 模块日志工厂
- `REQUEST_ID_CTX: ContextVar[str]` — 当前请求 ID，贯穿所有同 async 任务的日志行
- 屏蔽噪声：`uvicorn.access`, `sqlalchemy.engine`, `httpx`, `httpcore` 降至 WARNING

### 4. `app/core/middleware.py` — 中间件

**RequestIdMiddleware**
- 读取 `X-Request-ID` 请求头（若没有则生成 UUID4）
- 设置 `REQUEST_ID_CTX` ContextVar
- 在响应头中回传 `X-Request-ID`

**RequestLoggingMiddleware**
- 每个请求打一条结构化日志：`METHOD /path → STATUS (Xms)`
- 跳过 `/api/health`, `/api/docs`, `/api/redoc`, `/api/openapi.json`

### 5. `app/core/cache.py` — Cache 抽象

| 实现 | 激活方式 | 说明 |
|---|---|---|
| `MemoryCacheBackend` | 默认 | asyncio.Lock + TTL，单进程 |
| `RedisCacheBackend` | `CACHE_BACKEND=redis` | 接 flora-redis-1，需 `redis[asyncio]` |

API：`get / set(ttl) / delete / exists / clear(prefix)` + `get_cache()` 单例工厂

### 6. `app/repositories/` — Repository 层

**`BaseRepository[M]`**
- `get(id)` / `get_or_raise(id)` — 单条查询
- `list(filters, order_by, limit, offset)` — 通用分页列表
- `count(*filters)` / `exists(*filters)` — 统计
- `create(**kwargs)` / `update(obj, **kwargs)` / `delete(obj)` / `delete_by_id(id)`

**`UserRepository`** — `get_by_email`, `email_exists`

**`WorkspaceRepository`** — `list_for_user`, `get_member`, `is_member`, `has_role`, `add_member`, `list_members`

**`ProjectRepository`** — `list_for_workspace`, `get_for_user`, `source_count`

### 7. `app/main.py` — 全局接入

- `RequestIdMiddleware` + `RequestLoggingMiddleware` 装入 middleware stack
- `@app.exception_handler(AppError)` → 信封 JSON（携带 code/message）
- `@app.exception_handler(HTTPException)` → 保持原 `{"detail": "..."}` 格式（向后兼容）
- `@app.exception_handler(Exception)` → 通用 500 + 完整 traceback 日志
- `configure_logging()` 在 lifespan 启动时调用

### 8. `app/core/config.py`

新增两个字段：
- `cache_backend: str = "memory"` — 通过 `CACHE_BACKEND` 环境变量覆盖
- `log_level: str = "INFO"` — 通过 `LOG_LEVEL` 覆盖

---

## 修改文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `app/core/errors.py` | 新建 | 领域错误体系 |
| `app/core/response.py` | 新建 | 统一响应信封 |
| `app/core/logging.py` | 新建 | 结构化 JSON 日志 |
| `app/core/middleware.py` | 新建 | request-id + 请求日志 |
| `app/core/cache.py` | 新建 | Cache 接口 + 两种实现 |
| `app/core/config.py` | 修改 | 新增 cache_backend, log_level |
| `app/repositories/__init__.py` | 新建 | 导出 |
| `app/repositories/base.py` | 新建 | 泛型 BaseRepository |
| `app/repositories/user.py` | 新建 | UserRepository |
| `app/repositories/workspace.py` | 新建 | WorkspaceRepository |
| `app/repositories/project.py` | 新建 | ProjectRepository |
| `app/main.py` | 修改 | 接入中间件 + 异常处理器 |

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（106 文件） | ✅ 全部通过 |
| imports 可导入 | ✅ All Phase 1 imports OK |
| MemoryCacheBackend 单元测试 | ✅ 全部断言通过 |
| response helpers 单元测试 | ✅ 全部断言通过 |
| errors 单元测试 | ✅ 全部断言通过 |
| 前端 `pnpm type-check` | ✅ 0 errors |
| 现有业务行为 | ✅ 未改动（所有路由保持原有格式） |

---

## 架构影响

- **零破坏性变更**：现有 13 个 API 路由的响应格式未变
- **可扩展接口**：Phase 2 的新 CRUD 路由直接使用 `ok()` / `err()` 信封
- **错误类型安全**：服务层 raise `ProjectNotFoundError()` 即可，无需在路由层手写 HTTP 状态码
- **日志统一**：所有模块 `get_logger(__name__)` 即获得带 request_id 的结构化日志
- **Cache 解耦**：Memory → Redis 切换只需改一个环境变量，业务代码零修改

---

## Phase 2 预告

按 FLORA_OS_EXECUTION.md，Phase 2 分批新增领域模型：

1. **Tasks** — `app/models/task.py` + repository + service + `/api/v1/tasks` CRUD
2. **Memory** — `app/models/memory.py` + 五种 memory 类型 + 自动摘要
3. **Entities / Relations** — 扩展现有 KG 模型（已有 `kg_nodes` / `kg_edges`）

每张表按"model → migration → repository → service → route → 最小测试"闭环落地。
