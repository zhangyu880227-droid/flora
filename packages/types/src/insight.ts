export interface Insight {
  id: string
  projectId: string
  title: string
  content: string
  sources: Array<{ sourceId: string; sourceTitle: string }>
  createdAt: string
}

export interface GenerateInsightRequest {
  title: string
  sourceIds: string[]
  prompt?: string
}
