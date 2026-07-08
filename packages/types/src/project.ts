export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  sourceCount?: number
}

export interface CreateProjectRequest {
  name: string
  description?: string
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
}
