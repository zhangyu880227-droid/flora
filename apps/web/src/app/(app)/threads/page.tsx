"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { MessageSquare, Plus } from "lucide-react"
import { Button, Card, CardContent, Skeleton } from "@flora/ui"
import { projectsApi, threadsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Thread } from "@flora/types"

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

  const allThreads = threadQueries.data ?? []
  const isLoading = projectsLoading || threadQueries.isLoading

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Threads</h1>
        {projects[0] && (
          <Button asChild size="sm">
            <Link href={`/projects/${projects[0].id}/threads/new`}>
              <Plus className="mr-1.5 h-4 w-4" />
              New thread
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : allThreads.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium">No threads yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Start a conversation in one of your projects
          </p>
          {projects[0] && (
            <Button asChild size="sm" className="mt-5">
              <Link href={`/projects/${projects[0].id}/threads/new`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New thread
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {allThreads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadRow({ thread }: { thread: Thread & { projectName: string } }) {
  return (
    <Link href={`/threads/${thread.id}`}>
      <Card className="transition-all hover:border-emerald-500/30 hover:shadow-sm">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{thread.title}</p>
            <p className="text-xs text-muted-foreground">{thread.projectName}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
