"use client"

import { useQuery } from "@tanstack/react-query"
import { Lightbulb } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@flora/ui"
import { insightsApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { projectsApi, workspacesApi } from "@/lib/api"

export default function InsightsPage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: workspacesApi.list })
  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const projectId = projects[0]?.id

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: () => insightsApi.list(projectId!),
    enabled: !!projectId,
  })

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Insights</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Lightbulb className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No insights yet. Select sources in a project to generate one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <Card key={insight.id}>
              <CardHeader>
                <CardTitle className="text-base">{insight.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-6">
                  {insight.content}
                </p>
                {insight.sources.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Sources: {insight.sources.map((s: { sourceTitle: string }) => s.sourceTitle).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
