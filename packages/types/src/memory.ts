export type MemoryType = "working" | "long_term" | "conversation" | "semantic" | "document"

export interface Memory {
  id: string
  workspaceId: string
  userId: string
  projectId: string | null
  threadId: string | null
  memoryType: MemoryType
  key: string | null
  content: string
  importance: string | null
  accessCount: number
  meta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface CreateMemoryRequest {
  memoryType: MemoryType
  content: string
  key?: string
  importance?: number
  projectId?: string
  threadId?: string
  meta?: Record<string, unknown>
}

export interface UpdateMemoryRequest {
  content?: string
  key?: string
  importance?: number
  meta?: Record<string, unknown>
}
