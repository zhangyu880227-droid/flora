import type {
  AgentJob,
  Collection,
  CreateCollectionRequest,
  CreateMemoryRequest,
  CreateProjectRequest,
  CreateTaskRequest,
  CreateThreadRequest,
  CreateWorkspaceRequest,
  EngineAtlas,
  EngineFinding,
  EngineHealthDashboard,
  EngineHistoryEntry,
  EngineStatus,
  EngineTask,
  GenerateInsightRequest,
  Insight,
  KGEdge,
  KGNode,
  KnowledgeDocument,
  KnowledgeFeed,
  KnowledgeGraphStats,
  KnowledgeIngestionRun,
  KnowledgeStats,
  LearningJob,
  LearningStats,
  LoginRequest,
  Memory,
  MemoryType,
  Message,
  Project,
  RegisterRequest,
  SearchRequest,
  SearchResponse,
  Source,
  StockHolding,
  StockReport,
  StockWatchlist,
  Task,
  TaskStatus,
  Thread,
  UpdateMemoryRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  UpdateWorkspaceRequest,
  User,
  Workspace,
  WorkspaceInfo,
  WorkspaceMember,
} from "@flora/types"
import { api } from "./client"

type AuthResponse = { access_token: string; user: User; workspace: WorkspaceInfo | null }

// Auth
export const authApi = {
  register: (body: RegisterRequest) => api.post<AuthResponse>("/auth/register", body),
  login: (body: LoginRequest) => api.post<AuthResponse>("/auth/login", body),
  logout: () => api.post("/auth/logout"),
  me: () => api.get<User>("/auth/me"),
}

// Workspaces
export const workspacesApi = {
  list: () => api.get<Workspace[]>("/workspaces"),
  create: (body: CreateWorkspaceRequest) => api.post<Workspace>("/workspaces", body),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`),
  update: (id: string, body: UpdateWorkspaceRequest) => api.put<Workspace>(`/workspaces/${id}`, body),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  listMembers: (id: string) => api.get<WorkspaceMember[]>(`/workspaces/${id}/members`),
  invite: (id: string, email: string, role: string) =>
    api.post(`/workspaces/${id}/invitations`, { email, role }),
}

// Projects
export const projectsApi = {
  list: (workspaceId: string) => api.get<Project[]>(`/workspaces/${workspaceId}/projects`),
  create: (workspaceId: string, body: CreateProjectRequest) =>
    api.post<Project>(`/workspaces/${workspaceId}/projects`, body),
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  update: (id: string, body: UpdateProjectRequest) => api.put<Project>(`/projects/${id}`, body),
  delete: (id: string) => api.delete(`/projects/${id}`),
}

// Sources
export const sourcesApi = {
  list: (projectId: string) => api.get<Source[]>(`/projects/${projectId}/sources`),
  createUrl: (projectId: string, type: string, url: string, title?: string) => {
    const form = new FormData()
    form.append("type", type)
    form.append("url", url)
    if (title) form.append("title", title)
    return api.postForm<Source>(`/projects/${projectId}/sources`, form)
  },
  upload: (projectId: string, file: File) => {
    const form = new FormData()
    form.append("type", "pdf")
    form.append("file", file)
    form.append("title", file.name)
    return api.postForm<Source>(`/projects/${projectId}/sources`, form)
  },
  get: (id: string) => api.get<Source>(`/sources/${id}`),
  delete: (id: string) => api.delete(`/sources/${id}`),
  reprocess: (id: string) => api.post<Source>(`/sources/${id}/reprocess`),
}

// Collections
export const collectionsApi = {
  list: (projectId: string) => api.get<Collection[]>(`/projects/${projectId}/collections`),
  create: (projectId: string, body: CreateCollectionRequest) =>
    api.post<Collection>(`/projects/${projectId}/collections`, body),
  get: (id: string) => api.get<Collection>(`/collections/${id}`),
  delete: (id: string) => api.delete(`/collections/${id}`),
  addSource: (collectionId: string, sourceId: string) =>
    api.post(`/collections/${collectionId}/sources`, { source_id: sourceId }),
  removeSource: (collectionId: string, sourceId: string) =>
    api.delete(`/collections/${collectionId}/sources/${sourceId}`),
}

// Search
export const searchApi = {
  search: (body: SearchRequest) => api.post<SearchResponse>("/search", body),
}

// Threads
export const threadsApi = {
  list: (projectId: string) => api.get<Thread[]>(`/projects/${projectId}/threads`),
  create: (projectId: string, body: CreateThreadRequest) =>
    api.post<Thread>(`/projects/${projectId}/threads`, body),
  get: (id: string) => api.get<Thread>(`/threads/${id}`),
  listMessages: (id: string) => api.get<Message[]>(`/threads/${id}/messages`),
}

// Insights
export const insightsApi = {
  list: (projectId: string) => api.get<Insight[]>(`/projects/${projectId}/insights`),
  generate: (projectId: string, body: GenerateInsightRequest) =>
    api.post<Insight>(`/projects/${projectId}/insights/generate`, body),
  delete: (id: string) => api.delete(`/insights/${id}`),
}

// Engine
export const engineApi = {
  status: () => api.get<EngineStatus>("/engine/status"),
  findings: () => api.get<EngineFinding[]>("/engine/findings"),
  tasks: () => api.get<EngineTask[]>("/engine/tasks"),
  atlas: () => api.get<EngineAtlas>("/engine/atlas"),
  history: () => api.get<EngineHistoryEntry[]>("/engine/history"),
  scan: () => api.post<{ scan_id: string; files_scanned: number; findings: number; duration_seconds: number }>("/engine/scan"),
}

// Knowledge Pipeline
export const knowledgeApi = {
  stats: (workspaceId: string) =>
    api.get<KnowledgeStats>(`/workspaces/${workspaceId}/knowledge/stats`),
  documents: (workspaceId: string, params?: { sourceType?: string; since?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.sourceType) qs.set("source_type", params.sourceType)
    if (params?.since) qs.set("since", params.since)
    if (params?.limit !== undefined) qs.set("limit", String(params.limit))
    if (params?.offset !== undefined) qs.set("offset", String(params.offset))
    const query = qs.toString()
    return api.get<KnowledgeDocument[]>(`/workspaces/${workspaceId}/knowledge/documents${query ? `?${query}` : ""}`)
  },
  document: (workspaceId: string, docId: string) =>
    api.get<KnowledgeDocument>(`/workspaces/${workspaceId}/knowledge/documents/${docId}`),
  feeds: (workspaceId: string) =>
    api.get<KnowledgeFeed[]>(`/workspaces/${workspaceId}/knowledge/feeds`),
  addFeed: (workspaceId: string, body: Partial<KnowledgeFeed>) =>
    api.post<KnowledgeFeed>(`/workspaces/${workspaceId}/knowledge/feeds`, body),
  deleteFeed: (workspaceId: string, feedId: string) =>
    api.delete(`/workspaces/${workspaceId}/knowledge/feeds/${feedId}`),
  collect: (workspaceId: string, feedId?: string) =>
    feedId
      ? api.post(`/workspaces/${workspaceId}/knowledge/feeds/${feedId}/collect`)
      : api.post(`/workspaces/${workspaceId}/knowledge/collect`),
  reprocess: (workspaceId: string) =>
    api.post(`/workspaces/${workspaceId}/knowledge/reprocess`),
  runs: (workspaceId: string) =>
    api.get<KnowledgeIngestionRun[]>(`/workspaces/${workspaceId}/knowledge/runs`),
  triggerLoop: (workspaceId: string) =>
    api.post(`/workspaces/${workspaceId}/knowledge/loop`),
  gaps: (workspaceId: string, limit = 20) =>
    api.get<Array<{ entity: string; gapType: string; description: string; suggestedQuery: string; priority: number }>>(
      `/workspaces/${workspaceId}/knowledge/gaps?limit=${limit}`
    ),
  ask: (workspaceId: string, question: string, limit = 5) =>
    api.post<{ answer: string; sources: Array<{ id: string; title: string; url: string | null; source_type: string; confidence_score: number }> }>(
      `/workspaces/${workspaceId}/knowledge/ask`,
      { question, limit }
    ),
  trending: (workspaceId: string, hours = 24, limit = 10) =>
    api.get<Array<{ name: string; entity_type: string; recent_count: number; total_count: number; trend_pct: number; node_id: string | null }>>(
      `/workspaces/${workspaceId}/knowledge/trending?hours=${hours}&limit=${limit}`
    ),
  briefing: (workspaceId: string) =>
    api.get<{ briefing: string; generatedAt: string; docCount: number; nodeCount: number; recentDocCount: number }>(
      `/workspaces/${workspaceId}/knowledge/briefing`
    ),
}

// Tasks (envelope-wrapped responses: {ok, data, error, meta})
type Envelope<T> = { ok: boolean; data: T; error: { code: string; message: string } | null; meta: { total: number; page: number; pageSize: number; pages: number } | null }

export const tasksApi = {
  list: (workspaceId: string, params?: { status?: TaskStatus; projectId?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.projectId) qs.set("project_id", params.projectId)
    if (params?.page !== undefined) qs.set("page", String(params.page))
    if (params?.pageSize !== undefined) qs.set("page_size", String(params.pageSize))
    const query = qs.toString()
    return api.get<Envelope<Task[]>>(`/workspaces/${workspaceId}/tasks${query ? `?${query}` : ""}`).then((r) => r.data)
  },
  create: (workspaceId: string, body: CreateTaskRequest) =>
    api.post<Envelope<Task>>(`/workspaces/${workspaceId}/tasks`, body).then((r) => r.data),
  get: (workspaceId: string, taskId: string) =>
    api.get<Envelope<Task>>(`/workspaces/${workspaceId}/tasks/${taskId}`).then((r) => r.data),
  update: (workspaceId: string, taskId: string, body: UpdateTaskRequest) =>
    api.patch<Envelope<Task>>(`/workspaces/${workspaceId}/tasks/${taskId}`, body).then((r) => r.data),
  delete: (workspaceId: string, taskId: string) =>
    api.delete<Envelope<{ deleted: boolean }>>(`/workspaces/${workspaceId}/tasks/${taskId}`).then((r) => r.data),
}

// Memories
export const memoriesApi = {
  stats: (workspaceId: string) =>
    api.get<Envelope<{ total: number; by_type: Record<string, number> }>>(`/workspaces/${workspaceId}/memories/stats`).then((r) => r.data),
}

// Agents
export const agentsApi = {
  listJobs: (workspaceId: string, params?: { status?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.page !== undefined) qs.set("page", String(params.page))
    if (params?.pageSize !== undefined) qs.set("page_size", String(params.pageSize))
    const query = qs.toString()
    return api.get<Envelope<AgentJob[]>>(`/workspaces/${workspaceId}/agents/jobs${query ? `?${query}` : ""}`).then((r) => r.data)
  },
}

// Learning
export const learningApi = {
  stats: (workspaceId: string) =>
    api.get<Envelope<LearningStats>>(`/workspaces/${workspaceId}/learning/stats`).then((r) => r.data),
  jobs: (workspaceId: string, limit = 10) =>
    api.get<Envelope<LearningJob[]>>(`/workspaces/${workspaceId}/learning/jobs?limit=${limit}`).then((r) => r.data),
  run: (workspaceId: string) =>
    api.post<Envelope<{ task_id: string; status: string }>>(`/workspaces/${workspaceId}/learning/run`).then((r) => r.data),
}

// Stocks
export const stocksApi = {
  reports: (workspaceId: string, limit = 5) =>
    api.get<Envelope<StockReport[]>>(`/workspaces/${workspaceId}/stocks/reports?limit=${limit}`).then((r) => r.data),
  watchlists: (workspaceId: string) =>
    api.get<Envelope<StockWatchlist[]>>(`/workspaces/${workspaceId}/stocks/watchlists`).then((r) => r.data),
  holdings: (workspaceId: string) =>
    api.get<Envelope<StockHolding[]>>(`/workspaces/${workspaceId}/stocks/holdings`).then((r) => r.data),
}

// Engine health
export const engineHealthApi = {
  health: () => api.get<EngineHealthDashboard>("/engine/health"),
}

// Knowledge Graph
export const knowledgeGraphApi = {
  nodes: (workspaceId: string, params?: { entityType?: string; minDocCount?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.entityType) qs.set("entity_type", params.entityType)
    if (params?.minDocCount !== undefined) qs.set("min_doc_count", String(params.minDocCount))
    if (params?.limit !== undefined) qs.set("limit", String(params.limit))
    const query = qs.toString()
    return api.get<KGNode[]>(`/workspaces/${workspaceId}/knowledge/graph/nodes${query ? `?${query}` : ""}`)
  },
  edges: (workspaceId: string, params?: { nodeId?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.nodeId) qs.set("node_id", params.nodeId)
    if (params?.limit !== undefined) qs.set("limit", String(params.limit))
    const query = qs.toString()
    return api.get<KGEdge[]>(`/workspaces/${workspaceId}/knowledge/graph/edges${query ? `?${query}` : ""}`)
  },
  stats: (workspaceId: string) =>
    api.get<KnowledgeGraphStats>(`/workspaces/${workspaceId}/knowledge/graph/stats`),
}
