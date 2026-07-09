"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import type { KGEdge, KGNode, KnowledgeDocument, KnowledgeGraphStats, KnowledgeStats } from "@flora/types"
import { knowledgeApi, knowledgeGraphApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { AtlasNav } from "@/components/atlas/atlas-nav"
import { KnowledgeGraph } from "@/components/atlas/knowledge-graph"
import { MetricBar } from "@/components/atlas/metric-bar"
import { ResearchPanel } from "@/components/atlas/research-panel"

interface GapTask {
  entity:         string
  gapType:        string
  description:    string
  suggestedQuery: string
  priority:       number
}

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

const STATS_INTERVAL   = 30_000
const DOCS_INTERVAL    = 120_000
const GRAPH_INTERVAL   = 300_000
const GAPS_INTERVAL    = 600_000

// Entity type colours (shared)
const TYPE_COLOR: Record<string, string> = {
  tech:     "#58a6ff",
  org:      "#ffa657",
  person:   "#3fb950",
  concept:  "#bc8cff",
  place:    "#f85149",
  country:  "#58d9a8",
  event:    "#d29922",
  product:  "#e5a0ff",
  industry: "#c9a44a",
}

const ALL_TYPES = Object.keys(TYPE_COLOR)

export default function AtlasPage() {
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

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

  // graph controls
  const [activeTypes,  setActiveTypes]  = useState<Set<string>>(new Set(ALL_TYPES))
  const [graphSearch,  setGraphSearch]  = useState("")

  const [pulse, setPulse] = useState(false)
  const flash = () => { setPulse(true); setTimeout(() => setPulse(false), 600) }

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null

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

  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const [gs, ks] = await Promise.all([knowledgeGraphApi.stats(workspaceId), knowledgeApi.stats(workspaceId)])
        setGraphStats(gs); setKStats(ks); flash()
      } catch { /* ignore */ }
    }, STATS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try { setDocs(await knowledgeApi.documents(workspaceId, { limit: 50 })); flash() } catch { /* ignore */ }
    }, DOCS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try {
        const [n, e] = await Promise.all([
          knowledgeGraphApi.nodes(workspaceId, { limit: 200 }),
          knowledgeGraphApi.edges(workspaceId, { limit: 500 }),
        ])
        setNodes(n); setEdges(e); flash()
      } catch { /* ignore */ }
    }, GRAPH_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    const id = setInterval(async () => {
      try { setGapTasks(await knowledgeApi.gaps(workspaceId)) } catch { /* ignore */ }
    }, GAPS_INTERVAL)
    return () => clearInterval(id)
  }, [workspaceId])

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

  const metrics = [
    { label: "DOCS",  value: kStats?.totalDocs    ?? 0, color: "#58a6ff" },
    { label: "TODAY", value: kStats?.docsToday    ?? 0, color: "#3fb950" },
    { label: "NODES", value: graphStats?.nodeCount ?? 0, color: "#bc8cff" },
    { label: "EDGES", value: graphStats?.edgeCount ?? 0, color: "#ffa657" },
    { label: "FEEDS", value: kStats?.activeFeeds   ?? 0, color: "#d29922" },
    { label: "GAPS",  value: gapTasks.length,            color: "#f85149" },
  ]

  const lastUpdated = kStats?.latestRun?.completedAt ? timeAgo(kStats.latestRun.completedAt) : undefined

  function toggleType(t: string) {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) { next.delete(t) } else { next.add(t) }
      return next
    })
  }

  function toggleAllTypes() {
    setActiveTypes(prev => prev.size === ALL_TYPES.length ? new Set() : new Set(ALL_TYPES))
  }

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
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--atlas-bg)", color: "var(--atlas-text)" }}>
      <MetricBar
        title="ATLAS"
        metrics={metrics}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        live={pulse}
        lastUpdated={lastUpdated ? `Updated ${lastUpdated}` : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <AtlasNav
          graphStats={graphStats ? { nodeCount: graphStats.nodeCount, edgeCount: graphStats.edgeCount } : undefined}
          feedStats={kStats ? { totalDocs: kStats.totalDocs, activeFeeds: kStats.activeFeeds } : undefined}
        />

        {/* CENTRE — knowledge graph */}
        <div className="relative min-w-0 flex-1 overflow-hidden">

          {/* graph toolbar */}
          <div
            className="flex h-9 shrink-0 items-center gap-2 border-b px-3"
            style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface)" }}
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: "var(--atlas-text-3)" }}>
              Knowledge Graph
            </span>

            {/* type filter pills */}
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={toggleAllTypes}
                className="rounded px-1.5 py-0.5 font-mono text-[7.5px] font-bold border transition-colors"
                style={{
                  borderColor: "var(--atlas-border)",
                  background: activeTypes.size === ALL_TYPES.length ? "var(--atlas-surface-2)" : "transparent",
                  color: "var(--atlas-text-3)",
                }}
                title="Toggle all types"
              >
                ALL
              </button>
              {ALL_TYPES.map(t => {
                const color = TYPE_COLOR[t]
                const on = activeTypes.has(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    title={t}
                    className="flex h-4 w-4 items-center justify-center rounded-full border transition-opacity"
                    style={{
                      background: on ? `${color}30` : "transparent",
                      borderColor: on ? color : "var(--atlas-border)",
                      opacity: on ? 1 : 0.35,
                    }}
                  >
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  </button>
                )
              })}
            </div>

            {/* graph search */}
            <div className="ml-auto flex items-center gap-1.5 rounded border px-2 py-0.5" style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)" }}>
              <Search className="h-3 w-3 shrink-0" style={{ color: "var(--atlas-text-3)" }} />
              <input
                value={graphSearch}
                onChange={e => setGraphSearch(e.target.value)}
                placeholder="search nodes…"
                className="w-24 bg-transparent font-mono text-[9.5px] outline-none"
                style={{ color: "var(--atlas-text)" }}
              />
              {graphSearch && (
                <button onClick={() => setGraphSearch("")} className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>×</button>
              )}
            </div>

            {selectedNode && (
              <>
                <span style={{ color: "var(--atlas-text-3)" }} className="font-mono text-[9px]">›</span>
                <span className="font-mono text-[9px] font-semibold capitalize" style={{ color: "var(--atlas-cyan)" }}>{selectedNode.label}</span>
                <button onClick={() => setSelectedId(null)} className="font-mono text-[9px] hover:opacity-80" style={{ color: "var(--atlas-text-3)" }}>×</button>
              </>
            )}
            {loading && (
              <span className="font-mono text-[9px] animate-pulse ml-2" style={{ color: "var(--atlas-text-3)" }}>loading…</span>
            )}
            {error && !loading && (
              <span className="font-mono text-[9px] ml-2" style={{ color: "var(--atlas-red)" }}>{error}</span>
            )}
          </div>

          <div className="absolute inset-0 top-9">
            <KnowledgeGraph
              nodes={nodes}
              edges={edges}
              selectedId={selectedId}
              onSelect={setSelectedId}
              activeTypes={activeTypes}
              searchQuery={graphSearch}
            />
          </div>
        </div>

        <ResearchPanel
          docs={docs}
          nodes={nodes}
          edges={edges}
          selectedNode={selectedNode}
          gapTasks={gapTasks}
          workspaceId={workspaceId ?? undefined}
          onSelectNode={setSelectedId}
        />
      </div>
    </div>
  )
}
