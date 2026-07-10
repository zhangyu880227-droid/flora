# PHASE 9 REPORT — Self-Improvement Loop
*Branch: flora-os/phase9 | Merged: main @ 9f18220 | Date: 2026-07-10*

---

## 目标

扩展现有 `app/engine/` 自改进引擎，新增：
- 性能扫描（Performance Analyzer）
- 测试覆盖率缺口检测 + 骨架生成（Test Generator）
- 健康仪表板 API（Health Dashboard endpoint）

---

## 完成内容

### 1. `app/engine/analyzers/performance_analyzer.py` — 性能分析器

在现有 PythonAnalyzer（已检测 await-in-for-loop、asyncio.run()）基础上，添加更细粒度的性能检测：

| 检测规则 | 严重级别 | 说明 |
|---|---|---|
| select().all() without .limit() | medium | 无边界查询，全表扫描风险 |
| await inside list comprehension | medium | 隐藏的 N+1 查询 |
| time.sleep() in async code | high | 阻塞 asyncio 事件循环 |
| select("*") | low | 过度获取列，应指定列或 Model |

- 跳过 `engine/`、`migrations/`、`tests/` 路径（避免自引用噪音）
- 集成到 `SelfImprovementEngine.analyzers` 列表

### 2. `app/engine/generators/test_generator.py` — 测试生成器

**`coverage_gaps()` 方法**（只读，每次引擎扫描时调用）：
- 扫描 `app/services/**/*.py` 和 `app/api/v1/*.py`
- 对比 `tests/generated/` 目录，找出缺少对应测试文件的模块
- 返回 `[{module, missing_test}]` 列表，写入 `atlas.json["coverage_gaps"]`

**`run()` 方法**（按需调用，写入磁盘）：
- 用 AST 解析源文件，提取 class 名和函数名
- 生成 pytest 骨架文件（含 async 支持 + `@pytest.mark.asyncio`）
- 输出到 `tests/generated/test_<module>.py`

### 3. `app/engine/core.py` — 集成

- 在 `__init__` 中实例化 `PerformanceAnalyzer` 和 `TestGenerator`
- Step 5 中运行性能扫描（与其他 analyzers 并行）
- Step 7b（新）：调用 `coverage_gaps()`，结果存入 `atlas_data["coverage_gaps"]`

### 4. `app/api/v1/engine.py` — `/engine/health` 端点

| 返回字段 | 说明 |
|---|---|
| `health_score` | 0-100 综合健康分 |
| `health_trend` | 最近 5 次扫描的分数趋势 |
| `total_findings` / `by_severity` / `by_category` | 问题统计 |
| `top_issues` | 最高优先级 critical/high 问题（最多 5 条）|
| `recommended_tasks` | 评分最高的待办任务（最多 5 条）|
| `coverage_gaps` | 未覆盖的模块列表（最多 10 条）|
| `priority_opportunities` | phase=now + impact=high 的机会（最多 3 条）|
| `last_scan` / `scan_count` | 元数据 |

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（py_compile） | ✅ 全部通过 |
| 前端 type-check（tsc --noEmit） | ✅ 0 errors |
| main 分支 push | ✅ 9f18220 |

---

## Phase 10 预告

**Unified Dashboard（统一仪表板）**：
- 前端页面 `/dashboard`（或改造现有 home）
- 今日任务 / Agent 状态 / 学习进度 / Memory 数量 / KG 节点 / 股票简报 / 系统健康 / 最近活动
- 连接 Phase 1-9 所有真实 API：`/engine/health`, `/learning/stats`, `/memories/stats`, `/agents/jobs`, `/stocks/reports`, `/knowledge/graph`
