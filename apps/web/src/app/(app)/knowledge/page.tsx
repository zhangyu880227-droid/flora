"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  BookOpen,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Youtube,
} from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
  cn,
} from "@flora/ui"
import { projectsApi, sourcesApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Source } from "@flora/types"

/* ── helpers ── */

type SourceType = "all" | "pdf" | "url" | "youtube"
type SourceStatus = "all" | "ready" | "processing" | "error"

function sourceIcon(type: string) {
  switch (type) {
    case "pdf":     return FileText
    case "youtube": return Youtube
    default:        return Globe
  }
}

function sourceIconColor(type: string) {
  switch (type) {
    case "pdf":     return "bg-red-500/10 text-red-600 dark:text-red-400"
    case "youtube": return "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    default:        return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  }
}


function statusBadgeVariant(status: string): "secondary" | "outline" | "destructive" {
  switch (status) {
    case "ready":      return "secondary"
    case "processing": return "outline"
    default:           return "destructive"
  }
}

function statusDot(status: string) {
  switch (status) {
    case "ready":       return "bg-emerald-500"
    case "processing":  return "bg-amber-500 animate-pulse"
    case "pending":     return "bg-blue-500 animate-pulse"
    default:            return "bg-red-500"
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

/* ── Source card ── */
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
            <FolderOpen className="h-3 w-3" />
            {source.projectName}
          </Link>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-xs text-muted-foreground">{relativeTime(source.createdAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(source.status))} />
          <Badge variant={statusBadgeVariant(source.status)} className="text-xs capitalize font-normal">
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

/* ── Page ── */
export default function KnowledgePage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const [typeFilter, setTypeFilter] = useState<SourceType>("all")
  const [statusFilter, setStatusFilter] = useState<SourceStatus>("all")
  const [search, setSearch] = useState("")

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const { data: allSources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["all-sources-knowledge", workspaceId],
    queryFn: async () => {
      const results = await Promise.all(
        projects.map(async (p) => {
          const sources = await sourcesApi.list(p.id)
          return sources.map((s): EnrichedSource => ({
            ...s,
            projectName: p.name,
            projectId: p.id,
          }))
        }),
      )
      return results.flat()
    },
    enabled: projects.length > 0,
  })

  const isLoading = projectsLoading || sourcesLoading

  /* Filter */
  const filtered = allSources.filter((s) => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false
    if (statusFilter !== "all" && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const label = (s.title ?? s.url ?? "").toLowerCase()
      if (!label.includes(q) && !s.projectName.toLowerCase().includes(q)) return false
    }
    return true
  })

  /* Stats */
  const total = allSources.length
  const byType = {
    pdf:     allSources.filter((s) => s.type === "pdf").length,
    url:     allSources.filter((s) => s.type === "url").length,
    youtube: allSources.filter((s) => s.type === "youtube").length,
  }
  const processing = allSources.filter((s) => s.status === "processing" || s.status === "pending").length

  const typeFilters: { value: SourceType; label: string; count: number }[] = [
    { value: "all",     label: "All",     count: total },
    { value: "pdf",     label: "PDF",     count: byType.pdf },
    { value: "url",     label: "Web",     count: byType.url },
    { value: "youtube", label: "YouTube", count: byType.youtube },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
            <p className="text-sm text-muted-foreground">
              All sources across your workspace
            </p>
          </div>
        </div>
        {projects[0] && (
          <Button asChild size="sm">
            <Link href={`/projects/${projects[0].id}/sources/add`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add source
            </Link>
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-fade-up-1">
        {[
          { label: "Total sources",  value: isLoading ? "—" : total,         icon: BookOpen,   color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
          { label: "PDFs",           value: isLoading ? "—" : byType.pdf,    icon: FileText,   color: "bg-red-500/10 text-red-600 dark:text-red-400" },
          { label: "Web pages",      value: isLoading ? "—" : byType.url,    icon: Globe,      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
          { label: "Processing",     value: isLoading ? "—" : processing,    icon: RefreshCw,  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className={cn("mb-2 flex h-7 w-7 items-center justify-center rounded-lg", color)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="animate-fade-up-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Type filter tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {typeFilters.map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                typeFilter === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                  typeFilter === value
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(["all", "ready", "processing", "error"] as SourceStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all",
                statusFilter === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? "Any status" : s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or project…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Source list */}
      <div className="animate-fade-up-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              {search || typeFilter !== "all" || statusFilter !== "all" ? (
                <Filter className="h-5 w-5 text-muted-foreground" />
              ) : (
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium">
              {search || typeFilter !== "all" || statusFilter !== "all"
                ? "No sources match your filters"
                : "No sources yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || typeFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Add sources to projects to build your knowledge base"}
            </p>
            {!search && typeFilter === "all" && statusFilter === "all" && projects[0] && (
              <Button asChild size="sm" className="mt-4">
                <Link href={`/projects/${projects[0].id}/sources/add`}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add first source
                </Link>
              </Button>
            )}
          </div>
        ) : (
          filtered.map((source) => <SourceCard key={source.id} source={source} />)
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {filtered.length} source{filtered.length !== 1 ? "s" : ""}
          {total !== filtered.length && ` of ${total}`}
        </p>
      )}
    </div>
  )
}
