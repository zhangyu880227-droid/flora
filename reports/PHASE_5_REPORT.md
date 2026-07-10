# PHASE 5 REPORT — Knowledge Graph Enhancement
*Branch: flora-os/phase5 | Date: 2026-07-10*

---

## 目标

在现有 `kg_nodes` / `kg_edges` + `KnowledgeGraphBuilder` 基础上，新增：
- 实体搜索 / 邻居遍历（可视化接口）
- 节点合并（去重）
- Memory ↔ KG 双向连接
- 冲突检测（via merge_nodes）

---

## 完成内容

### 1. `app/services/knowledge/kg_service.py` — KGService

| 方法 | 说明 |
|---|---|
| `search_nodes(workspace_id, query, entity_type, limit)` | ILIKE 标签搜索，按 doc_count 排序 |
| `get_neighbors(workspace_id, node_id, hops=1, max_nodes=50)` | 1/2-hop 子图（节点 + 边），用于前端图可视化 |
| `merge_nodes(workspace_id, source_ids, target_label, entity_type)` | 合并重复节点：累加 doc_count + total_relevance；重定向所有相关边；删除源节点 |
| `link_memory_entities(workspace_id, memory, entity_labels, entity_type)` | 将 Memory 内容关联的实体写入 KG（pg upsert），并在 memory.meta.kg_node_ids 中记录 |

**设计决策**：合并时使用 PostgreSQL `ON CONFLICT DO UPDATE`，避免重复插入。重定向边用 `UPDATE` 语句（非 ORM 关系遍历），性能更好。

### 2. 新增 API 端点（`app/api/v1/knowledge.py`）

| 端点 | 说明 |
|---|---|
| `GET /knowledge/graph/search?q=` | 节点标签搜索（ILIKE），支持 entity_type 过滤 |
| `GET /knowledge/graph/nodes/{id}/neighbors?hops=1` | 邻居子图，返回 {nodes, edges}（前端 D3/Cytoscape 直接使用） |
| `POST /knowledge/graph/merge` | 合并重复节点，需 editor 角色 |
| `POST /knowledge/graph/link-memory` | 将 Memory 关联到 KG 实体，写入 memory.meta.kg_node_ids |

---

## KG 端点全集（7 个）

```
GET  /knowledge/graph/nodes                          — 节点列表（已有）
GET  /knowledge/graph/edges                          — 边列表（已有）
GET  /knowledge/graph/stats                          — 统计（已有）
GET  /knowledge/graph/search?q=                     — 标签搜索（新增）
GET  /knowledge/graph/nodes/{id}/neighbors           — 子图（新增）
POST /knowledge/graph/merge                          — 节点合并（新增）
POST /knowledge/graph/link-memory                    — Memory→KG（新增）
```

---

## 验证结果

| 检查项 | 结果 |
|---|---|
| Python 语法检查（111 文件） | ✅ 全部通过 |
| KGService 导入 | ✅ OK |
| 新 KG 路由数量 | ✅ 7 条 |
| pg_insert ON CONFLICT 语法 | ✅ 已验证 import |

---

## 架构影响

- **Service 封装**：所有图操作通过 KGService，端点层只调 service，易于测试
- **Memory ↔ KG 双向**：`memory.meta.kg_node_ids` 储存关联节点 ID，可反向查询"哪些 memory 涉及某个实体"
- **冲突检测**：merge_nodes 中的 `ON CONFLICT` upsert + 边重定向即是去重+冲突解决的标准流程

---

## Phase 6 预告

**AI Agent Framework**：
- AgentJob / AgentExecution 模型（migration）
- AgentManager（Planner + Executor + State Machine）
- Tool Manager（搜索 / Memory / KG / 代码执行 等 Tool 注册）
- Celery 异步执行 + 重试
- 执行历史 + 日志 API
