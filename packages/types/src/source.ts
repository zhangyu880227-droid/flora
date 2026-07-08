export type SourceType = "pdf" | "url" | "note" | "youtube" | "arxiv"
export type SourceStatus = "pending" | "processing" | "ready" | "error"

export interface Source {
  id: string
  projectId: string
  type: SourceType
  title: string
  url: string | null
  filePath: string | null
  rawText: string | null
  metadata: Record<string, unknown>
  status: SourceStatus
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  chunkCount?: number
  tags?: Tag[]
}

export interface SourceChunk {
  id: string
  sourceId: string
  content: string
  chunkIndex: number
  metadata: Record<string, unknown>
}

export interface CreateSourceRequest {
  type: SourceType
  url?: string
  title?: string
}

export interface Tag {
  id: string
  workspaceId: string
  name: string
  color: string
}

export interface Collection {
  id: string
  projectId: string
  name: string
  description: string | null
  sourceCount?: number
  createdAt: string
}

export interface CreateCollectionRequest {
  name: string
  description?: string
}
