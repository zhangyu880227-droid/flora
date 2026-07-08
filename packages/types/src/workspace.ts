export type WorkspaceRole = "owner" | "editor" | "viewer"

export interface Workspace {
  id: string
  name: string
  slug: string
  ownerId: string
  createdAt: string
}

export interface WorkspaceMember {
  userId: string
  workspaceId: string
  role: WorkspaceRole
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
  }
}

export interface CreateWorkspaceRequest {
  name: string
  slug: string
}

export interface UpdateWorkspaceRequest {
  name?: string
}

export interface InviteMemberRequest {
  email: string
  role: WorkspaceRole
}
