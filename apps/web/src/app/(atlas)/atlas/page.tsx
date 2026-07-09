"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KGEdge, KGNode, KnowledgeDocument, KnowledgeGraphStats, KnowledgeStats } from "@flora/types"
import { knowledgeApi, knowledgeGraphApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { AtlasNav } from "@/components/atlas/atlas-nav"
import { KnowledgeGraph } from "@/components/atlas/knowledge-graph"
import { MetricBar } from "@/components/atlas/metric-bar"
import { ResearchPanel } from "@/components/atlas/research-panel"

// ── gap shape from /knowledge/gaps endpoint ───────────────────────────────────
interface GapTask {
  entity:         string
  gapType:        string
  description:    string
  suggestedQuery: string
  priority:       number
}

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never"
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)  return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)  return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

// ── refresh intervals ─────────────────────────────────────────────────────────
const STATS_INTERVAL   = 30_000   // 30 s  — metrics bar
const DOCS_INTERVAL    = 120_000  // 2 min — feed panel
const GRAPH_INTERVAL   = 300_000  // 5 min — graph nodes + edges
const GAPS_INTERVAL    = 600_000  // 10 min — gaps panel

export default function AtlasPage() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // data state
  const [nodes,      setNodes]      = useState<KGNode[]>([])
  const [edges,      setEdges]      = useState<KGEdge[]>([])
  const [docs,       setDocs]       = useState<KnowledgeDocument[]>([])
  const [graphStats, setGraphStats] = useState<KnowledgeGraphStats | null>(null)
  const [kStats,     setKStats]     = useState<KnowledgeStats | null>(null)
  const [gapTasks,   setGapTasks]   = useState<GapTask[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // live indicator — flashes when a poll completes
  const [pulse, setPulse] = useState(false)
  const flash = () => { setPulse(true); setTimeout(() => setPulse(false), 600) }

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

  // ── initial full load ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async (wsId: string) => {
    try {
      const [nodesData, edgesData, docsData, gStatsData, kStatsData, gapsData] = await Promise.all([
        knowledgeGraphApi.nodes(wsId, { limit: 200 }),
        knowledgeGraphApi.edges(wsId, { limit: 500 }),
        knowledgeApi.documents(wsId, { limit: 50 }),
        knowledgeGraphApi.stats(wsId),
        knowledgeApi.stats(wsId),
        knowledgeApi.gaps(wsId),
      ])
      setNodes(nodesData)
      setEdges(edgesData)
      setDocs(docsData)
      setGraphStats(gStatsData)
      setKStats(kStatsData)
      setGapTasks(gapsData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    fetchAll(workspaceId).finally(() => setLoading(false))
  }, [workspaceId, fetchAll])

  // ── auto-refresh: stats (30s) ──────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const [gs, ks] = await Promise.all([
          knowledgeGraphApi.stats(workspaceId),
          knowledgeApi.stats(workspaceId),
        ])
        setGraphStats(gs)
        setKStats(ks)
        flash()
      } catch { /* ignore */ }
    }, STATS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  // ── auto-refresh: feed docs (2 min) ───────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const docs = await knowledgeApi.documents(workspaceId, { limit: 50 })
        setDocs(docs)
        flash()
      } catch { /* ignore */ }
    }, DOCS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  // ── auto-refresh: graph (5 min) ────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const [n, e] = await Promise.all([
          knowledgeGraphApi.nodes(workspaceId, { limit: 200 }),
          knowledgeGraphApi.edges(workspaceId, { limit: 500 }),
        ])
        setNodes(n)
        setEdges(e)
        flash()
      } catch { /* ignore */ }
    }, GRAPH_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  // ── auto-refresh: gaps (10 min) ────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const gaps = await knowledgeApi.gaps(workspaceId)
        setGapTasks(gaps)
      } catch { /* ignore */ }
    }, GAPS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  // ── manual refresh cycle ───────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (!workspaceId || refreshing) return
    setRefreshing(true)
    try {
      await knowledgeApi.triggerLoop(workspaceId)
      await new Promise(r => setTimeout(r, 5000))
      await fetchAll(workspaceId)
    } finally {
      setRefreshing(false)
    }
  }, [workspaceId, refreshing, fetchAll])

  // ── metric bar ─────────────────────────────────────────────────────────────
  const metrics = [
    { label: "DOCS",   value: kStats?.totalDocs   ?? 0, color: "#58a6ff" },
    { label: "TODAY",  value: kStats?.docsToday   ?? 0, color: "#3fb950" },
    { label: "NODES",  value: graphStats?.nodeCount ?? 0, color: "#bc8cff" },
    { label: "EDGES",  value: graphStats?.edgeCount ?? 0, color: "#ffa657" },
    { label: "FEEDS",  value: kStats?.activeFeeds  ?? 0, color: "#d29922" },
    { label: "GAPS",   value: gapTasks.length,            color: "#f85149" },
  ]

  const lastUpdated = kStats?.latestRun?.completedAt
    ? timeAgo(kStats.latestRun.completedAt)
    : undefined

  // ── no workspace ──────────────────────────────────────────────────────────
  if (!workspaceId) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--atlas-bg)" }}>
        <p className="font-mono text-[11px]" style={{ color: "var(--atlas-text-3)" }}>
          No workspace selected — please sign in
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: "var(--atlas-bg)", color: "var(--atlas-text)" }}
    >
      {/* ── top metric bar ── */}
      <MetricBar
        title="ATLAS"
        metrics={metrics}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        live={pulse}
        lastUpdated={lastUpdated ? `Updated ${lastUpdated}` : undefined}
      />

      {/* ── three-column body ── */}
      <div className="flex min-h-0 flex-1">

        {/* LEFT — navigation */}
        <AtlasNav
          graphStats={graphStats ? { nodeCount: graphStats.nodeCount, edgeCount: graphStats.edgeCount } : undefined}
          feedStats={kStats ? { totalDocs: kStats.totalDocs, activeFeeds: kStats.activeFeeds } : undefined}
        />

        {/* CENTRE — knowledge graph */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            className="flex h-8 shrink-0 items-center border-b px-4 gap-3"
            style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface)" }}
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--atlas-text-3)" }}>
              Knowledge Graph
            </span>
            {selectedNode && (
              <>
                <span style={{ color: "var(--atlas-text-3)" }}>›</span>
                <span className="font-mono text-[9px] font-semibold capitalize" style={{ color: "var(--atlas-cyan)" }}>
                  {selectedNode.label}
                </span>
                <button
                  onClick={() => setSelectedId(null)}
                  className="ml-auto font-mono text-[9px] hover:opacity-80"
                  style={{ color: "var(--atlas-text-3)" }}
                >
                  clear ×
                </button>
              </>
            )}
            {loading && (
              <span className="ml-auto font-mono text-[9px] animate-atlas-pulse" style={{ color: "var(--atlas-text-3)" }}>
                loading…
              </span>
            )}
            {error && !loading && (
              <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--atlas-red)" }}>
                {error}
              </span>
            )}
          </div>

          <div className="absolute inset-0 top-8">
            <KnowledgeGraph
              nodes={nodes}
              edges={edges}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {!loading && nodes.length > 0 && (
            <div
              className="absolute bottom-4 left-4 rounded-lg border px-3 py-2"
              style={{ background: "var(--atlas-surface)", borderColor: "var(--atlas-border)" }}
            >
              <ByTypeLegend nodes={nodes} />
            </div>
          )}
        </div>

        {/* RIGHT — research panel */}
        <ResearchPanel
          docs={docs}
          nodes={nodes}
          edges={edges}
          selectedNode={selectedNode}
          gapTasks={gapTasks}
        />
      </div>
    </div>
  )
}

// ── entity-type breakdown legend ──────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  tech:     "#58a6ff",
  org:      "#ffa657",
  person:   "#3fb950",
  concept:  "#bc8cff",
  place:    "#f85149",
  country:  "#f85149",
  event:    "#d29922",
  product:  "#58d9a8",
  industry: "#e5a0ff",
}

function ByTypeLegend({ nodes }: { nodes: KGNode[] }) {
  const counts: Record<string, number> = {}
  for (const n of nodes) counts[n.entityType] = (counts[n.entityType] ?? 0) + 1
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <div className="flex flex-col gap-1">
      {sorted.map(([type, count]) => (
        <div key={type} className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[type] ?? "#8b949e" }} />
          <span className="font-mono text-[9px] capitalize" style={{ color: "var(--atlas-text-2)" }}>{type}</span>
          <span className="ml-auto pl-3 font-mono text-[9px] tabular-nums" style={{ color: "var(--atlas-text-3)" }}>{count}</span>
        </div>
      ))}
    </div>
  )
}
