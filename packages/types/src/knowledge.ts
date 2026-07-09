export type KnowledgeFeedType =
  | "rss"
  | "arxiv"
  | "github_trending"
  | "github_repo"
  | "youtube"
  | "url"
  | "pdf"
  | "google_news"
  | "sec_edgar"

export interface KnowledgeFeed {
  id: string
  workspaceId: string
  name: string
  type: KnowledgeFeedType
  config: Record<string, unknown>
  isActive: boolean
  scheduleMinutes: number
  lastCollectedAt: string | null
  nextCollectAt: string | null
  consecutiveFailures: number
  createdAt: string
}

export interface KnowledgeEntity {
  name: string
  type: "person" | "org" | "tech" | "concept" | "place" | string
  relevance: number
}

export interface KnowledgeRelationship {
  from: string
  to: string
  relation: string
}

export interface KnowledgeDocument {
  id: string
  workspaceId: string
  feedId: string | null
  sourceType: KnowledgeFeedType
  title: string
  url: string | null
  author: string | null
  publishedAt: string | null
  collectedAt: string
  summary: string | null
  keyInsights: string[]
  entities: KnowledgeEntity[]
  relationships: KnowledgeRelationship[]
  tags: string[]
  confidenceScore: number
  importanceScore: number
  status: "pending" | "processing" | "ready" | "error"
  metadata: Record<string, unknown>
  createdAt: string
}

export interface KnowledgeIngestionRun {
  id: string
  workspaceId: string
  feedId: string | null
  runType: "scheduled" | "manual"
  startedAt: string
  completedAt: string | null
  status: "running" | "completed" | "failed" | "partial"
  documentsFound: number
  documentsNew: number
  documentsSkipped: number
  documentsFailed: number
  errorMessage: string | null
  createdAt: string
}

export interface KnowledgeStats {
  totalDocs: number
  docsToday: number
  docsThisWeek: number
  bySourceType: Record<string, number>
  byTag: Array<{ tag: string; count: number }>
  activeFeeds: number
  latestRun: KnowledgeIngestionRun | null
}

export interface KGNode {
  id: string
  workspaceId: string
  label: string
  entityType: "person" | "org" | "tech" | "concept" | "place" | string
  docCount: number
  totalRelevance: number
  avgRelevance: number
  firstSeen: string
  lastSeen: string
  createdAt: string
}

export interface KGEdge {
  id: string
  workspaceId: string
  sourceId: string
  targetId: string
  relation: string
  weight: number
  confidence: number
  firstSeen: string
  lastSeen: string
  createdAt: string
}

export interface KnowledgeGraphStats {
  nodeCount: number
  edgeCount: number
  topNodes: KGNode[]
  byEntityType: Record<string, number>
}

export interface ResearchGap {
  entity: string
  entityType: string
  gapType: "orphan_reference" | "stale_coverage" | "low_confidence_hub" | string
  description: string
  suggestedQuery: string
  priority: number
}
