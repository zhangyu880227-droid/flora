"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowRight, FolderOpen, Plus } from "lucide-react"
import { Badge, Button, Skeleton } from "@flora/ui"
import { projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"

export default function ProjectsPage() {
  const { activeWorkspaceId } = useWorkspaceStore()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "—" : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {workspaceId && (
          <Button asChild size="sm">
            <Link href={`/projects/new?workspace=${workspaceId}`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New project
            </Link>
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="animate-fade-up-1 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border p-5">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="animate-fade-up-1 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-base font-semibold">No projects yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create your first project to start organising your research
          </p>
          {workspaceId && (
            <Button asChild size="sm" className="mt-5">
              <Link href={`/projects/new?workspace=${workspaceId}`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="animate-fade-up-1 space-y-2.5">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="group block">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-emerald-500/30 hover:shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <FolderOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                    {project.name}
                  </p>
                  {project.description && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {project.sourceCount ?? 0} source{project.sourceCount !== 1 ? "s" : ""}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
