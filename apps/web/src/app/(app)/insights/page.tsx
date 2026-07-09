"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  ChevronDown,
  Lightbulb,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@flora/ui"
import { insightsApi, projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Insight } from "@flora/types"

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function InsightCard({ insight, onDelete }: { insight: Insight; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold leading-snug">{insight.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{relativeTime(insight.createdAt)}</p>
          </div>
          <button
            onClick={() => onDelete(insight.id)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/50 hover:bg-destructive/10 hover:!text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <p
          className={cn(
            "whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed",
            !expanded && "line-clamp-4",
          )}
        >
          {insight.content}
        </p>
        {insight.content.length > 300 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {insight.sources && insight.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {insight.sources.map((s: { sourceTitle: string; sourceId: string }) => (
              <Badge key={s.sourceId} variant="secondary" className="text-xs font-normal">
                {s.sourceTitle}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function InsightsPage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const queryClient = useQueryClient()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)

  const projectId = selectedProjectId ?? projects[0]?.id
  const selectedProject = projects.find((p) => p.id === projectId)

  const { data: insights = [], isLoading: insightsLoading, isError: insightsError, error: insightsErr } = useQuery({
    queryKey: ["insights", projectId],
    queryFn: () => insightsApi.list(projectId!),
    enabled: !!projectId,
  })

  const deleteInsight = useMutation({
    mutationFn: (id: string) => insightsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights", projectId] }),
  })

  const isLoading = projectsLoading || insightsLoading

  if (projectsError || insightsError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 m-6">
        <p className="text-sm font-medium text-destructive">Failed to load insights</p>
        <p className="text-xs text-muted-foreground">{insightsErr instanceof Error ? insightsErr.message : "Unknown error"}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
            <p className="text-sm text-muted-foreground">AI-generated research synthesis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Project selector */}
          {projects.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setProjectPickerOpen((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span className="max-w-[120px] truncate">{selectedProject?.name ?? "All projects"}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
              {projectPickerOpen && (
                <div className="absolute right-0 top-9 z-50 min-w-[160px] rounded-xl border bg-popover p-1 shadow-lg">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProjectId(p.id); setProjectPickerOpen(false) }}
                      className={cn(
                        "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                        p.id === projectId && "bg-accent font-medium",
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {projectId && (
            <Button asChild size="sm">
              <Link href={`/projects/${projectId}`}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Generate
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!projectId && !projectsLoading ? (
        <div className="animate-fade-up-1 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Lightbulb className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No projects yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a project and add sources first</p>
          <Button asChild size="sm" className="mt-4">
            <Link href={workspaceId ? `/projects/new?workspace=${workspaceId}` : "/projects"}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New project
            </Link>
          </Button>
        </div>
      ) : isLoading ? (
        <div className="animate-fade-up-1 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : insights.length === 0 ? (
        <div className="animate-fade-up-1 flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Sparkles className="h-6 w-6 text-amber-500" />
          </div>
          <p className="mt-3 text-sm font-medium">No insights yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a project and use the Insights tab to generate AI synthesis
          </p>
          {projectId && (
            <Button asChild size="sm" className="mt-4">
              <Link href={`/projects/${projectId}`}>
                Go to project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="animate-fade-up-1 space-y-4">
          <p className="text-xs text-muted-foreground px-1">
            {insights.length} insight{insights.length !== 1 ? "s" : ""}{selectedProject ? ` · ${selectedProject.name}` : ""}
          </p>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDelete={(id) => deleteInsight.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
