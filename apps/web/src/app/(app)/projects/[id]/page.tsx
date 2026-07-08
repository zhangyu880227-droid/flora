"use client"

import { use } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileText,
  Globe,
  Lightbulb,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Youtube,
} from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@flora/ui"
import { insightsApi, projectsApi, sourcesApi, threadsApi } from "@/lib/api"
import type { Source, Insight } from "@flora/types"

/* ── helpers ── */

function sourceIcon(type: string) {
  switch (type) {
    case "pdf":     return FileText
    case "youtube": return Youtube
    default:        return Globe
  }
}

function sourceIconBg(type: string) {
  switch (type) {
    case "pdf":     return "bg-red-500/10 text-red-600 dark:text-red-400"
    case "youtube": return "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    default:        return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  }
}

function statusDot(status: string) {
  switch (status) {
    case "ready":      return "bg-emerald-500"
    case "processing": return "bg-amber-500 animate-pulse"
    case "pending":    return "bg-blue-500 animate-pulse"
    default:           return "bg-red-500"
  }
}

/* ── Source row ── */
function SourceRow({
  source,
  onDelete,
  deleting,
  onRetry,
  retrying,
}: {
  source: Source
  onDelete: () => void
  deleting: boolean
  onRetry: () => void
  retrying: boolean
}) {
  const isPending = source.status === "pending" || source.status === "processing"
  const isError = source.status === "error"
  const Icon = sourceIcon(source.type)

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-all",
        isPending && "opacity-70",
      )}
    >
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sourceIconBg(source.type))}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{source.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot(source.status))} />
          {isPending ? (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              {source.status}…
            </span>
          ) : isError ? (
            <span className="text-xs text-destructive">Processing failed</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {source.chunkCount ?? 0} chunk{source.chunkCount !== 1 ? "s" : ""} · ready
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/0 transition-all hover:bg-accent group-hover:text-muted-foreground/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {isError && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600 disabled:opacity-40"
            title="Retry"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/0 transition-all hover:bg-destructive/10 hover:!text-destructive disabled:opacity-40 group-hover:text-muted-foreground/50"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ── Page ── */
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id),
  })

  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["sources", id],
    queryFn: () => sourcesApi.list(id),
    refetchInterval: (query) => {
      const data = query.state.data ?? []
      return data.some((s) => s.status === "pending" || s.status === "processing") ? 2500 : false
    },
  })

  const { data: threads = [] } = useQuery({
    queryKey: ["threads", id],
    queryFn: () => threadsApi.list(id),
  })

  const { data: insights = [] } = useQuery({
    queryKey: ["insights", id],
    queryFn: () => insightsApi.list(id),
  })

  const deleteSource = useMutation({
    mutationFn: (sourceId: string) => sourcesApi.delete(sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources", id] }),
  })

  const retrySource = useMutation({
    mutationFn: (sourceId: string) => sourcesApi.reprocess(sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources", id] }),
  })

  if (projectLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-muted-foreground">Project not found</div>
    )
  }

  const pendingCount = sources.filter(
    (s) => s.status === "pending" || s.status === "processing",
  ).length
  const readyCount = sources.filter((s) => s.status === "ready").length

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up">
        <Link
          href="/projects"
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{project.description}</p>
              )}
              <div className="mt-1.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{readyCount} sources ready</span>
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {pendingCount} processing
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${id}/sources/add`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add source
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/projects/${id}/threads/new`}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Chat
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sources — 2/3 */}
        <div className="space-y-3 lg:col-span-2 animate-fade-up-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">
              Sources
              {sources.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">({sources.length})</span>
              )}
            </h2>
          </div>

          {sourcesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No sources yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload a PDF or add a URL to start researching
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href={`/projects/${id}/sources/add`}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add first source
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onDelete={() => deleteSource.mutate(source.id)}
                  deleting={deleteSource.isPending && deleteSource.variables === source.id}
                  onRetry={() => retrySource.mutate(source.id)}
                  retrying={retrySource.isPending && retrySource.variables === source.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4 animate-fade-up-2">
          {/* Threads */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                Threads
              </CardTitle>
              <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
                <Link href={`/projects/${id}/threads/new`}>
                  <Plus className="h-3 w-3" />
                  New
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pb-4">
              {threads.length === 0 ? (
                <div className="rounded-xl border border-dashed py-6 text-center">
                  <p className="text-xs text-muted-foreground">No threads yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {threads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/threads/${thread.id}`}
                      className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="truncate text-sm group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                        {thread.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Insights */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
                Insights
              </CardTitle>
              {readyCount > 0 && (
                <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
                  <Link href="/insights">
                    <Sparkles className="h-3 w-3" />
                    Generate
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="pb-4">
              {insights.length === 0 ? (
                <div className="rounded-xl border border-dashed py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    {readyCount === 0
                      ? "Add ready sources to generate insights"
                      : "No insights yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {insights.slice(0, 3).map((insight: Insight) => (
                    <div
                      key={insight.id}
                      className="rounded-lg border border-border px-3 py-2.5"
                    >
                      <p className="line-clamp-2 text-xs font-medium">{insight.title}</p>
                    </div>
                  ))}
                  {insights.length > 3 && (
                    <Link
                      href="/insights"
                      className="flex items-center justify-center py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View all {insights.length}
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Sources",  value: sources.length,  color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
              { label: "Ready",    value: readyCount,      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
              { label: "Threads",  value: threads.length,  color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
              { label: "Insights", value: insights.length, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className={cn("flex flex-col rounded-xl p-3", color.split(" ").slice(-1).join(" ").replace("text-", "bg-").replace(/dark.*/, "") || "bg-muted/50")}>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
