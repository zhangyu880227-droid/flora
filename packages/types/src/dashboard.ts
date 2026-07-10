// Types for the Unified Dashboard (Phase 10)

export interface AgentJob {
  id: string
  workspaceId: string
  userId: string
  agentType: string
  name: string
  goal: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  result: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface LearningStats {
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
  total_documents_scanned: number
  total_memories_created: number
  total_kg_nodes_updated: number
}

export interface LearningJob {
  id: string
  workspace_id: string
  trigger: string
  status: "running" | "completed" | "failed"
  documents_scanned: number
  memories_created: number
  kg_nodes_updated: number
  error_message: string | null
  summary: Record<string, unknown> | null
  created_at: string
}

export interface StockReport {
  id: string
  workspaceId: string
  date: string
  status: string
  content: string
  sections: Record<string, unknown>
  tickers: string[]
  createdAt: string
}

export interface StockWatchlist {
  id: string
  workspaceId: string
  userId: string
  name: string
  description: string | null
  createdAt: string
}

export interface StockHolding {
  id: string
  workspaceId: string
  userId: string
  ticker: string
  shares: number
  avgCost: number | null
  currency: string
  lastPrice: number | null
  lastPriceDate: string | null
  createdAt: string
}
