"use client"

import { use } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { FileText, Globe, MessageSquare, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { Badge, Button, Card, CardContent, Skeleton, cn } from "@flora/ui"
import { projectsApi, sourcesApi, threadsApi } from "@/lib/api"
import type { Source } from "@flora/types"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "secondary",
  ready: "default",
  error: "destructive",
}

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

  const deleteSource = useMutation({
    mutationFn: (sourceId: string) => sourcesApi.delete(sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources", id] }),
  })

  const retrySource = useMutation({
    mutationFn: (sourceId: string) => sourcesApi.reprocess(sourceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources", id] }),
  })

  if (projectLoading) return <div className="p-8"><Skeleton className="h-8 w-48" /></div>
  if (!project) return <div className="p-8 text-muted-foreground">Project not found</div>

  const pendingCount = sources.filter(
    (s) => s.status === "pending" || s.status === "processing",
  ).length

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
          {threads.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/threads/${threads[0]!.id}`}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Open chat
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sources */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">Sources</h2>
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {pendingCount} processing
                </span>
              )}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${id}/sources/add`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add source
              </Link>
            </Button>
          </div>

          {sourcesLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No sources yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a PDF or URL to start researching
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href={`/projects/${id}/sources/add`}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add source
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

        {/* Sidebar: Threads */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Threads</h2>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${id}/threads/new`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New
              </Link>
            </Button>
          </div>
          {threads.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-xs text-muted-foreground">No threads yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {threads.map((thread) => (
                <Link key={thread.id} href={`/threads/${thread.id}`}>
                  <Card className="cursor-pointer transition-all hover:border-emerald-500/30 hover:shadow-sm">
                    <CardContent className="flex items-center gap-2 py-3">
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{thread.title}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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

  return (
    <Card className={cn(isPending && "opacity-75")}>
      <CardContent className="flex items-center gap-3 py-3">
        {source.type === "pdf" ? (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{source.title}</p>
          <p className="text-xs text-muted-foreground">
            {isPending ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {source.status}…
              </span>
            ) : isError ? (
              <span className="text-destructive">Processing failed</span>
            ) : (
              `${source.chunkCount ?? 0} chunks`
            )}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[source.status] ?? "secondary"}>{source.status}</Badge>
        {isError && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600 disabled:opacity-40"
            aria-label="Retry processing"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
          aria-label="Delete source"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </CardContent>
    </Card>
  )
}
