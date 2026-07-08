export interface WorkspaceInfo {
  id: string
  name: string
}

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
  tokenType: "bearer"
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
}

export interface LoginRequest {
  email: string
  password: string
}
