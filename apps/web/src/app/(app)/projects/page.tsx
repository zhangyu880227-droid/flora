"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Skeleton, cn } from "@flora/ui"
import { FolderOpen } from "lucide-react"
import { projectsApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { workspacesApi } from "@/lib/api"

export default function ProjectsPage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: workspacesApi.list })
  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {workspaceId && (
          <Button asChild size="sm">
            <Link href={`/projects/new?workspace=${workspaceId}`}>
              <Plus className="mr-1.5 h-4 w-4" />
              New project
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-base font-medium">No projects yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create your first project to start organizing research
          </p>
          {workspaceId && (
            <Button asChild size="sm" className="mt-5">
              <Link href={`/projects/new?workspace=${workspaceId}`}>
                <Plus className="mr-1.5 h-4 w-4" />
                New project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className={cn("transition-all hover:shadow-md hover:border-emerald-500/30")}>
                <CardHeader className="flex-row items-center justify-between py-4">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.description && (
                      <CardDescription className="mt-0.5 line-clamp-1">{project.description}</CardDescription>
                    )}
                  </div>
                  <Badge variant="secondary">{project.sourceCount ?? 0} sources</Badge>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
