import type {
  Collection,
  CreateCollectionRequest,
  CreateProjectRequest,
  CreateThreadRequest,
  CreateWorkspaceRequest,
  EngineAtlas,
  EngineFinding,
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
  LoginRequest,
  Message,
  Project,
  RegisterRequest,
  SearchRequest,
  SearchResponse,
  Source,
  Thread,
  UpdateProjectRequest,
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
