"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowRight, MessageSquare, Plus } from "lucide-react"
import { Badge, Button, Skeleton } from "@flora/ui"
import { projectsApi, threadsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Thread } from "@flora/types"

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ThreadRow({ thread }: { thread: Thread & { projectName: string } }) {
  return (
    <Link href={`/threads/${thread.id}`} className="group block">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-all hover:border-emerald-500/30 hover:shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
          <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
            {thread.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{thread.projectName}</span>
            {thread.messageCount !== undefined && thread.messageCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs text-muted-foreground">
                  {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{relativeTime(thread.updatedAt)}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
        </div>
      </div>
    </Link>
  )
}

export default function ThreadsPage() {
  const { activeWorkspaceId } = useWorkspaceStore()

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

  const threadQueries = useQuery({
    queryKey: ["all-threads", projects.map((p) => p.id).join(",")],
    queryFn: async () => {
      if (projects.length === 0) return []
      const results = await Promise.all(projects.map((p) => threadsApi.list(p.id)))
      return results.flatMap((threads, i) =>
        threads.map((t) => ({ ...t, projectName: projects[i]!.name, projectId: projects[i]!.id })),
      )
    },
    enabled: projects.length > 0,
  })

  const allThreads = (threadQueries.data ?? []).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  const isLoading = projectsLoading || threadQueries.isLoading

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Threads</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "—" : `${allThreads.length} conversation${allThreads.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {projects[0] && (
          <Button asChild size="sm">
            <Link href={`/projects/${projects[0].id}/threads/new`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New thread
            </Link>
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="animate-fade-up-1 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : allThreads.length === 0 ? (
        <div className="animate-fade-up-1 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-base font-semibold">No threads yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Start a conversation in one of your projects
          </p>
          {projects[0] && (
            <Button asChild size="sm" className="mt-5">
              <Link href={`/projects/${projects[0].id}/threads/new`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New thread
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="animate-fade-up-1 space-y-2">
          {allThreads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </div>
      )}

      {/* Group by project hint */}
      {allThreads.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {projects.map((p) => {
            const count = allThreads.filter((t) => t.projectId === p.id).length
            if (count === 0) return null
            return (
              <Badge key={p.id} variant="secondary" className="text-xs font-normal">
                {p.name}: {count}
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
