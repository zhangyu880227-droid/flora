"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Network,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Star,
  Tag,
  Youtube,
  XCircle,
  Loader2,
} from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@flora/ui"
import { knowledgeApi, projectsApi, sourcesApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { KnowledgeDocument, KnowledgeFeed, Source } from "@flora/types"

/* ── helpers ── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

const SOURCE_TYPE_COLORS: Record<string, string> = {
  rss: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  arxiv: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  github_trending: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
  google_news: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  sec_edgar: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  pdf: "bg-red-500/10 text-red-700 dark:text-red-400",
  url: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  youtube: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rss: "RSS",
  arxiv: "ArXiv",
  github_trending: "GitHub",
  google_news: "Google News",
  sec_edgar: "SEC",
  pdf: "PDF",
  url: "Web",
  youtube: "YouTube",
}

/* ══════════════════════════════════════
   KNOWLEDGE DOCUMENTS TAB
══════════════════════════════════════ */

function KnowledgeDocCard({ doc }: { doc: KnowledgeDocument }) {
  const typeColor = SOURCE_TYPE_COLORS[doc.sourceType] ?? "bg-muted text-muted-foreground"
  const typeLabel = SOURCE_TYPE_LABELS[doc.sourceType] ?? doc.sourceType

  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-emerald-500/20 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold", typeColor)}>
          <Database className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="flex-1 truncate text-sm font-medium leading-snug">{doc.title}</p>
            <Badge variant="outline" className={cn("shrink-0 text-[10px] font-normal", typeColor)}>
              {typeLabel}
            </Badge>
          </div>
          {doc.summary && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {doc.summary}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {doc.tags && Array.isArray(doc.tags) && doc.tags.slice(0, 4).map((tag: string) => (
              <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-muted-foreground/60">
              {doc.collectedAt ? relativeTime(doc.collectedAt) : ""}
            </span>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
            {typeof doc.confidenceScore === "number" && (
              <span className="ml-auto text-xs text-muted-foreground/50">
                {Math.round(doc.confidenceScore * 100)}% confidence
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentsTab({ workspaceId }: { workspaceId: string }) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const { data: stats } = useQuery({
    queryKey: ["knowledge-stats", workspaceId],
    queryFn: () => knowledgeApi.stats(workspaceId),
    staleTime: 5 * 60 * 1000,
  })

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["knowledge-docs", workspaceId, typeFilter],
    queryFn: () =>
      knowledgeApi.documents(workspaceId, {
        sourceType: typeFilter === "all" ? undefined : typeFilter,
        limit: 100,
      }),
    staleTime: 2 * 60 * 1000,
  })

  const typeOptions = [
    { value: "all", label: "All" },
    { value: "rss", label: "RSS" },
    { value: "arxiv", label: "ArXiv" },
    { value: "github_trending", label: "GitHub" },
    { value: "google_news", label: "News" },
    { value: "sec_edgar", label: "SEC" },
  ]

  const filtered = search
    ? docs.filter((d) => {
        const q = search.toLowerCase()
        return (
          d.title?.toLowerCase().includes(q) ||
          d.summary?.toLowerCase().includes(q) ||
          (Array.isArray(d.tags) && d.tags.some((t: string) => t.toLowerCase().includes(q)))
        )
      })
    : docs

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats?.totalDocs ?? "—", color: "text-foreground" },
          { label: "Today", value: stats?.docsToday ?? "—", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "This week", value: stats?.docsThisWeek ?? "—", color: "text-blue-600 dark:text-blue-400" },
          { label: "Feeds", value: stats?.activeFeeds ?? "—", color: "text-violet-600 dark:text-violet-400" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className={cn("text-xl font-semibold tabular-nums", color)}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1">
          {typeOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                typeFilter === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4">
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Database className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">
            {search ? "No documents match your search" : "No knowledge documents yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? "Try a different search term" : "Run your feeds to collect documents"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <KnowledgeDocCard key={doc.id} doc={doc} />
          ))}
          <p className="pt-2 text-center text-xs text-muted-foreground">
            {filtered.length} document{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== docs.length ? ` (filtered from ${docs.length})` : ""}
          </p>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════
   FEEDS TAB
══════════════════════════════════════ */

function feedStatusColor(feed: KnowledgeFeed): string {
  if (!feed.isActive) return "text-muted-foreground"
  if ((feed.consecutiveFailures ?? 0) >= 3) return "text-red-500"
  return "text-emerald-500"
}

function FeedRow({ feed, workspaceId }: { feed: KnowledgeFeed; workspaceId: string }) {
  const qc = useQueryClient()
  const { mutate: runFeed, isPending } = useMutation({
    mutationFn: () => knowledgeApi.collect(workspaceId, feed.id),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey: ["knowledge-feeds", workspaceId] }), 2000)
      qc.invalidateQueries({ queryKey: ["knowledge-stats", workspaceId] })
    },
  })

  const typeColor = SOURCE_TYPE_COLORS[feed.type] ?? "bg-muted text-muted-foreground"
  const typeLabel = SOURCE_TYPE_LABELS[feed.type] ?? feed.type

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-normal w-20 justify-center", typeColor)}>
        {typeLabel}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{feed.name}</p>
        {feed.lastCollectedAt && (
          <p className="text-xs text-muted-foreground">
            Last collected {relativeTime(feed.lastCollectedAt)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {(feed.consecutiveFailures ?? 0) > 0 && (
          <Badge variant="destructive" className="text-xs">
            {feed.consecutiveFailures} fail{feed.consecutiveFailures !== 1 ? "s" : ""}
          </Badge>
        )}
        <div className={cn("flex items-center gap-1 text-xs", feedStatusColor(feed))}>
          {feed.isActive ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Active</>
          ) : (
            <><XCircle className="h-3.5 w-3.5" /> Paused</>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={isPending}
          onClick={() => runFeed()}
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run
        </Button>
      </div>
    </div>
  )
}

function FeedsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ["knowledge-feeds", workspaceId],
    queryFn: () => knowledgeApi.feeds(workspaceId),
    staleTime: 60 * 1000,
  })

  const { mutate: runAll, isPending: runningAll } = useMutation({
    mutationFn: () => knowledgeApi.collect(workspaceId),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["knowledge-feeds", workspaceId] })
        qc.invalidateQueries({ queryKey: ["knowledge-stats", workspaceId] })
        qc.invalidateQueries({ queryKey: ["knowledge-docs", workspaceId] })
      }, 3000)
    },
  })

  const activeFeeds = feeds.filter((f) => f.isActive)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeFeeds.length} of {feeds.length} feeds active
        </p>
        <Button
          size="sm"
          disabled={runningAll}
          onClick={() => runAll()}
          className="gap-1.5"
        >
          {runningAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Run all feeds
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border px-4 py-3">
              <Skeleton className="h-5 w-20 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-16 rounded" />
            </div>
          ))}
        </div>
      ) : feeds.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Rss className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No feeds configured</p>
          <p className="mt-1 text-xs text-muted-foreground">Default feeds will be seeded on first run</p>
          <Button size="sm" className="mt-4" onClick={() => runAll()}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Initialize feeds
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════
   PROJECT SOURCES TAB
══════════════════════════════════════ */

type SrcType = "all" | "pdf" | "url" | "youtube"

function sourceIcon(type: string) {
  switch (type) {
    case "pdf": return FileText
    case "youtube": return Youtube
    default: return Globe
  }
}

function sourceIconColor(type: string) {
  switch (type) {
    case "pdf": return "bg-red-500/10 text-red-600 dark:text-red-400"
    case "youtube": return "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    default: return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  }
}

function statusDot(status: string) {
  switch (status) {
    case "ready": return "bg-emerald-500"
    case "processing": return "bg-amber-500 animate-pulse"
    case "pending": return "bg-blue-500 animate-pulse"
    default: return "bg-red-500"
  }
}

interface EnrichedSource extends Source {
  projectName: string
  projectId: string
}

function SourceCard({ source }: { source: EnrichedSource }) {
  const Icon = sourceIcon(source.type)
  const label = source.title ?? source.url ?? "Untitled"

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-emerald-500/20 hover:shadow-sm">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", sourceIconColor(source.type))}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-none">{label}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${source.projectId}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3 w-3" />
            {source.projectName}
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-xs text-muted-foreground">{relativeTime(source.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(source.status))} />
          <Badge variant="secondary" className="text-xs capitalize font-normal">
            {source.status}
          </Badge>
        </div>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/0 transition-all group-hover:text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

function ProjectSourcesTab({ workspaceId }: { workspaceId: string }) {
  const [typeFilter, setTypeFilter] = useState<SrcType>("all")
  const [search, setSearch] = useState("")

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId),
    enabled: !!workspaceId,
  })

  const { data: allSources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["all-sources-knowledge", workspaceId],
    queryFn: async () => {
      const results = await Promise.all(
        projects.map(async (p) => {
          const sources = await sourcesApi.list(p.id)
          return sources.map((s): EnrichedSource => ({ ...s, projectName: p.name, projectId: p.id }))
        })
      )
      return results.flat()
    },
    enabled: projects.length > 0,
  })

  const isLoading = projectsLoading || sourcesLoading

  const filtered = allSources.filter((s) => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const label = (s.title ?? s.url ?? "").toLowerCase()
      if (!label.includes(q) && !s.projectName.toLowerCase().includes(q)) return false
    }
    return true
  })

  const typeFilters: { value: SrcType; label: string }[] = [
    { value: "all", label: `All (${allSources.length})` },
    { value: "pdf", label: `PDF (${allSources.filter((s) => s.type === "pdf").length})` },
    { value: "url", label: `Web (${allSources.filter((s) => s.type === "url").length})` },
    { value: "youtube", label: `YouTube (${allSources.filter((s) => s.type === "youtube").length})` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1">
          {typeFilters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                typeFilter === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or project…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        {projects[0] && (
          <Button asChild size="sm" className="shrink-0">
            <Link href={`/projects/${projects[0].id}/sources/add`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add source
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">
            {search || typeFilter !== "all" ? "No sources match" : "No project sources yet"}
          </p>
          {!search && typeFilter === "all" && projects[0] && (
            <Button asChild size="sm" className="mt-4">
              <Link href={`/projects/${projects[0].id}/sources/add`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add first source
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
          <p className="pt-2 text-center text-xs text-muted-foreground">
            {filtered.length} source{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════
   PAGE
══════════════════════════════════════ */

export default function KnowledgePage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const [tab, setTab] = useState("documents")

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <Network className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
            <p className="text-sm text-muted-foreground">
              Collected intelligence from all feeds and projects
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/atlas">
            <Network className="h-3.5 w-3.5" />
            Knowledge Graph
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      {workspaceId ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9">
            <TabsTrigger value="documents" className="gap-1.5 text-xs">
              <Database className="h-3.5 w-3.5" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="feeds" className="gap-1.5 text-xs">
              <Rss className="h-3.5 w-3.5" />
              Feeds
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Project Sources
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="feeds" className="mt-4">
            <FeedsTab workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="sources" className="mt-4">
            <ProjectSourcesTab workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed py-20 text-center">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="mt-3 h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
      )}
    </div>
  )
}
