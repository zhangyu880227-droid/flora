import type {
  Collection,
  CreateCollectionRequest,
  CreateProjectRequest,
  CreateThreadRequest,
  CreateWorkspaceRequest,
  GenerateInsightRequest,
  Insight,
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
