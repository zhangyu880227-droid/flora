export interface EngineStatus {
  lastScan: string | null
  scanId: string | null
  scanCount: number
  healthScore: number
  healthDelta: number
  filesScanned: number
  pythonFiles: number
  typescriptFiles: number
  totalLines: number
  totalFindings: number
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
  activeTasks: number
  completedTasks: number
  isRunning: boolean
}

export interface EngineFinding {
  id: string
  category: string
  severity: "critical" | "high" | "medium" | "low"
  file: string
  line: number
  message: string
  analyzer: string
  detail: string
  firstSeen: string
  lastSeen: string
  resolved: boolean
  resolvedAt?: string
}

export interface EngineTask {
  id: string
  title: string
  description: string
  category: string
  priority: number
  score: number
  impact: "high" | "medium" | "low"
  effort: "low" | "medium" | "high"
  status: string
  files: string[]
  findingIds: string[]
  acceptanceCriteria: string[]
  analyzer: string
  dependencies: string[]
  createdAt: string
  updatedAt: string
}

export interface EngineOpportunity {
  id: string
  title: string
  description: string
  rationale: string
  effort: "low" | "medium" | "high"
  impact: "high" | "medium" | "low"
  phase: "now" | "next" | "later"
  category: string
}

export interface EngineAtlas {
  lastScan: string | null
  scanCount: number
  modules: Array<{ path: string; ext: string; lines: number }>
  learning: Record<string, { total: number; resolved: number; rate: number }>
  gitStats: {
    recentCommits?: Array<{ hash: string; message: string; author: string; date: string }>
    changedFiles?: string[]
    topChurnFiles?: Array<{ file: string; changes: number }>
  }
  opportunities: EngineOpportunity[]
}

export interface EngineHistoryEntry {
  timestamp: string
  scanId: string
  filesScanned: number
  totalFindings: number
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
  durationSeconds: number
  healthScore: number
}
