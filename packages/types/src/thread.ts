export type MessageRole = "user" | "assistant"

export interface Thread {
  id: string
  projectId: string
  title: string
  createdBy: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export interface CitedSource {
  sourceId: string
  sourceTitle: string
  chunkId: string
  excerpt: string
}

export interface Message {
  id: string
  threadId: string
  role: MessageRole
  content: string
  sourcesCited: CitedSource[]
  createdAt: string
}

export interface CreateThreadRequest {
  title?: string
}

export interface CreateMessageRequest {
  content: string
  collectionId?: string
}
