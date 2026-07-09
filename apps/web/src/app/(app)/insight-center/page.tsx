"use client"

import { useState, useTransition } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  BookOpen,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Github,
  Lightbulb,
  Newspaper,
  RefreshCw,
  Sparkles,
  Tag,
  X,
  Youtube,
  Zap,
  Cpu,
} from "lucide-react"
import { Button, cn } from "@flora/ui"
import { knowledgeApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { KnowledgeDocument, KnowledgeIngestionRun } from "@flora/types"

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never"
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ── Source type config ────────────────────────────────────────────────────────

type SourceMeta = { label: string; icon: React.ElementType; color: string; bg: string }

const SOURCE_META: Record<string, SourceMeta> = {
  rss:             { label: "News",    icon: Newspaper, color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10" },
  arxiv:           { label: "ArXiv",   icon: BookOpen,  color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  github_trending: { label: "GitHub",  icon: Github,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  github_repo:     { label: "GitHub",  icon: Github,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  youtube:         { label: "YouTube", icon: Youtube,   color: "text-red-600 dark:text-red-400",      bg: "bg-red-500/10" },
  url:             { label: "Web",     icon: FileText,  color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  pdf:             { label: "PDF",     icon: FileText,  color: "text-gray-600 dark:text-gray-400",    bg: "bg-gray-500/10" },
}

function getSourceMeta(type: string): SourceMeta {
  return SOURCE_META[type] ?? (SOURCE_META.url as SourceMeta)
}

function SourceBadge({ type, name }: { type: string; name?: string }) {
  const m = getSourceMeta(type)
  const Icon = m.icon
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", m.bg, m.color)}>
      <Icon className="h-3 w-3" />
      {name ?? m.label}
    </span>
  )
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.8 ? "bg-emerald-500" : score >= 0.5 ? "bg-yellow-500" : "bg-red-400"
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  )
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onClick, active }: { doc: KnowledgeDocument; onClick: () => void; active: boolean }) {
  const meta = getSourceMeta(doc.sourceType)
  const Icon = meta.icon
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-xl border bg-card p-4 transition-all hover:shadow-sm hover:border-foreground/20",
        active && "ring-2 ring-emerald-500/40 border-emerald-500/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.bg)}>
          <Icon className={cn("h-4 w-4", meta.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-foreground">
              {doc.title}
            </h3>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {doc.author && <p className="mt-0.5 text-xs text-muted-foreground">{doc.author}</p>}

          {doc.summary && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {doc.summary}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <SourceBadge type={doc.sourceType} />
            {doc.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(doc.collectedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ doc, onClose }: { doc: KnowledgeDocument; onClose: () => void }) {
  const meta = getSourceMeta(doc.sourceType)
  const Icon = meta.icon
  return (
    <div className="flex h-full flex-col overflow-hidden border-l bg-background">
      <div className="shrink-0 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", meta.bg)}>
              <Icon className={cn("h-3.5 w-3.5", meta.color)} />
            </div>
            <SourceBadge type={doc.sourceType} />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-3 text-sm font-bold leading-snug">{doc.title}</h2>
        {doc.author && <p className="mt-1 text-xs text-muted-foreground">{doc.author}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Collected {timeAgo(doc.collectedAt)}</span>
          {doc.publishedAt && <span>· Published {fmtDate(doc.publishedAt)}</span>}
          <ConfidenceBar score={doc.confidenceScore} />
        </div>
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{doc.url}</span>
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {doc.summary && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Summary</h4>
            <p className="text-sm leading-relaxed">{doc.summary}</p>
          </section>
        )}

        {doc.keyInsights.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Insights</h4>
            <ul className="space-y-2">
              {doc.keyInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  {insight}
                </li>
              ))}
            </ul>
          </section>
        )}

        {doc.entities.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Entities</h4>
            <div className="flex flex-wrap gap-1.5">
              {doc.entities.map((e, i) => (
                <span key={i} className="rounded-full border px-2 py-0.5 text-xs" title={`${e.type} · ${Math.round(e.relevance * 100)}%`}>
                  {e.name}
                  <span className="ml-1 text-[10px] text-muted-foreground">{e.type}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {doc.relationships.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Relationships</h4>
            <div className="space-y-1.5">
              {doc.relationships.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-lg bg-muted/40 px-3 py-2">
                  <span className="font-medium">{r.from}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground italic">{r.relation}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{r.to}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {doc.tags.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {doc.tags.map((t) => (
                <span key={t} className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: "today",    label: "Today",    icon: Zap,       filter: null,              isToday: true  },
  { id: "research", label: "Research", icon: BookOpen,  filter: "arxiv",           isToday: false },
  { id: "news",     label: "News",     icon: Newspaper, filter: "rss",             isToday: false },
  { id: "github",   label: "GitHub",   icon: Github,    filter: "github_trending", isToday: false },
  { id: "youtube",  label: "YouTube",  icon: Youtube,   filter: "youtube",         isToday: false },
  { id: "all",      label: "All",      icon: Activity,  filter: null,              isToday: false },
  { id: "timeline", label: "Timeline", icon: Clock,     filter: null,              isToday: false },
] as const
type TabId = (typeof TABS)[number]["id"]

// ── Runs list ─────────────────────────────────────────────────────────────────

function RunsList({ runs }: { runs: KnowledgeIngestionRun[] }) {
  if (runs.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">No runs yet</p>
  return (
    <div className="space-y-2">
      {runs.map((r) => (
        <div key={r.id} className="rounded-lg border p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className={cn(
              "rounded-full px-1.5 py-0.5 font-medium",
              r.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : r.status === "running"   ? "bg-blue-500/10 text-blue-600"
              : "bg-red-500/10 text-red-600",
            )}>{r.status}</span>
            <span className="text-muted-foreground">{timeAgo(r.startedAt)}</span>
          </div>
          <div className="mt-1 flex gap-3 text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">+{r.documentsNew}</span>
            <span>{r.documentsSkipped} skipped</span>
            {r.documentsFailed > 0 && <span className="text-red-500">{r.documentsFailed} failed</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightCenterPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [activeTab, setActiveTab] = useState<TabId>("today")
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null)
  const [collecting, startCollect] = useTransition()
  const [reprocessing, startReprocess] = useTransition()

  const enabled = !!workspaceId

  const statsQ = useQuery({
    queryKey: ["knowledge-stats", workspaceId],
    queryFn: () => knowledgeApi.stats(workspaceId!),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const runsQ = useQuery({
    queryKey: ["knowledge-runs", workspaceId],
    queryFn: () => knowledgeApi.runs(workspaceId!),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  const docsQ = useQuery({
    queryKey: ["knowledge-docs", workspaceId, activeTab],
    queryFn: () => {
      const since = currentTab.isToday ? new Date(Date.now() - 86_400_000).toISOString() : undefined
      const filter = "filter" in currentTab && currentTab.filter ? currentTab.filter : undefined
      return knowledgeApi.documents(workspaceId!, { sourceType: filter, since, limit: 80 })
    },
    enabled,
    staleTime: 30_000,
  })

  function handleCollect() {
    if (!workspaceId) return
    startCollect(async () => {
      await knowledgeApi.collect(workspaceId)
      setTimeout(() => {
        statsQ.refetch()
        runsQ.refetch()
        docsQ.refetch()
      }, 3000)
    })
  }

  function handleReprocess() {
    if (!workspaceId) return
    startReprocess(async () => {
      await knowledgeApi.reprocess(workspaceId)
    })
  }

  const stats = statsQ.data
  const runs = runsQ.data ?? []
  const docs = docsQ.data ?? []
  const latestRun = stats?.latestRun

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No workspace selected
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Insight Center</h1>
              <p className="text-xs text-muted-foreground">
                Autonomous knowledge pipeline · {stats?.activeFeeds ?? 0} active feeds
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latestRun && (
              <div className="text-right">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  latestRun.status === "completed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : latestRun.status === "running"   ? "bg-blue-500/10 text-blue-600"
                  : "bg-red-500/10 text-red-600",
                )}>
                  {latestRun.status === "running" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                  {latestRun.status}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(latestRun.startedAt)}</p>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={handleReprocess} disabled={reprocessing} className="gap-1.5" title="Re-run AI extraction on all documents (uses Ollama qwen3:8b)">
              <Cpu className={cn("h-3.5 w-3.5", reprocessing && "animate-pulse")} />
              {reprocessing ? "Queued…" : "Reprocess"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCollect} disabled={collecting} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", collecting && "animate-spin")} />
              {collecting ? "Collecting…" : "Collect now"}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-6">
          {[
            { label: "Total documents", value: stats?.totalDocs ?? "—", color: "text-foreground" },
            { label: "Today",           value: stats?.docsToday ?? "—", color: "text-emerald-600 dark:text-emerald-400" },
            { label: "This week",       value: stats?.docsThisWeek ?? "—", color: "text-blue-600 dark:text-blue-400" },
            { label: "Active feeds",    value: stats?.activeFeeds ?? "—", color: "text-purple-600 dark:text-purple-400" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={cn("text-2xl font-bold leading-none", color)}>{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b bg-background px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon, filter }) => {
            const count = filter ? (stats?.bySourceType?.[filter] ?? 0) : null
            return (
              <button
                key={id}
                onClick={() => { setActiveTab(id); setSelectedDoc(null) }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === id
                    ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {count != null && count > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Doc list */}
        <div className={cn("flex-1 overflow-y-auto", selectedDoc && "max-w-[55%]")}>
          <div className="p-4 space-y-3">
            {docsQ.isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading…
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="rounded-full bg-emerald-500/10 p-5 mb-4">
                  <Sparkles className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="font-semibold text-lg">No {currentTab.label.toLowerCase()} knowledge yet</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                  Run a collection to start gathering knowledge from RSS feeds, ArXiv, GitHub, and more.
                </p>
                <Button className="mt-5 gap-2" onClick={handleCollect} disabled={collecting}>
                  <RefreshCw className={cn("h-4 w-4", collecting && "animate-spin")} />
                  {collecting ? "Collecting…" : "Start collecting"}
                </Button>
              </div>
            ) : (
              docs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                  active={selectedDoc?.id === doc.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedDoc && (
          <div className="w-[400px] shrink-0">
            <DetailPanel doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
          </div>
        )}

        {/* Right sidebar */}
        {!selectedDoc && (
          <div className="w-52 shrink-0 border-l overflow-y-auto p-3 space-y-4">
            {stats?.bySourceType && Object.keys(stats.bySourceType).length > 0 && (
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By source</p>
                {Object.entries(stats.bySourceType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const m = getSourceMeta(type)
                    const Icon = m.icon
                    const total = Object.values(stats.bySourceType).reduce((a, b) => a + b, 0)
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", m.color)} />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{m.label}</span>
                        <span className="text-xs font-medium">{count}</span>
                        <div className="w-10 h-1 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full", m.bg.replace("/10", "/60"))} style={{ width: `${(count / total) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {stats?.byTag && stats.byTag.length > 0 && (
              <div className="rounded-xl border bg-card p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top tags</p>
                <div className="flex flex-wrap gap-1">
                  {stats.byTag.slice(0, 18).map(({ tag, count }) => (
                    <span key={tag} className="rounded-full border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {tag} <span className="opacity-60">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent runs</p>
              <RunsList runs={runs.slice(0, 6)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
