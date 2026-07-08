export interface SearchRequest {
  query: string
  projectId: string
  collectionId?: string
  limit?: number
}

export interface SearchResult {
  chunkId: string
  sourceId: string
  sourceTitle: string
  sourceType: string
  content: string
  score: number
  chunkIndex: number
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
  totalResults: number
}
