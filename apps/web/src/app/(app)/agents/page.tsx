"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  Bot,
  Brain,
  FileSearch,
  FolderOpen,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@flora/ui"
import { projectsApi, sourcesApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Source } from "@flora/types"

/* ── helpers ── */

function statusColor(status: string) {
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
  if (m < 1)  return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/* ── Agent template card ── */
interface TemplateProps {
  icon: React.ElementType
  title: string
  description: string
  href: string
  color: string
}

function AgentTemplate({ icon: Icon, title, description, href, color }: TemplateProps) {
  return (
    <Link href={href} className="group block">
      <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-emerald-500/30 hover:shadow-md">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
      </div>
    </Link>
  )
}

/* ── Active agent row ── */
function ActiveAgentRow({ source, projectName }: { source: Source; projectName: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusColor(source.status))} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{source.title ?? source.url ?? "Document"}</p>
        <p className="text-xs text-muted-foreground">{projectName} · Ingestion agent</p>
      </div>
      <Badge
        variant={source.status === "ready" ? "secondary" : "outline"}
        className="shrink-0 text-xs capitalize"
      >
        {source.status}
      </Badge>
      <span className="shrink-0 text-xs text-muted-foreground">
        {relativeTime(source.createdAt)}
      </span>
    </div>
  )
}

/* ── Page ── */
export default function AgentsPage() {
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

  const sourcesQueries = useQuery({
    queryKey: ["all-sources", workspaceId],
    queryFn: async () => {
      const results = await Promise.all(
        projects.map(async (p) => {
          const sources = await sourcesApi.list(p.id)
          return sources.map((s) => ({ ...s, projectName: p.name, projectId: p.id }))
        }),
      )
      return results.flat()
    },
    enabled: projects.length > 0,
  })

  const allSources = sourcesQueries.data ?? []
  const activeSources = allSources.filter(
    (s) => s.status === "processing" || s.status === "pending",
  )
  const recentSources = [...allSources]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)

  const templates: TemplateProps[] = [
    {
      icon: MessageSquare,
      title: "Research Assistant",
      description: "Start an AI conversation grounded in your knowledge base",
      href: projects[0] ? `/projects/${projects[0].id}/threads/new` : "/projects",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Upload,
      title: "Document Ingestion",
      description: "Upload a PDF or URL and let the AI extract & index knowledge",
      href: projects[0] ? `/projects/${projects[0].id}/sources/add` : "/projects",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      icon: Lightbulb,
      title: "Insight Generator",
      description: "AI synthesises your sources into structured research insights",
      href: "/insights",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      icon: FileSearch,
      title: "Semantic Search",
      description: "Search across all your sources with natural language queries",
      href: "/search",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
  ]

  const statCards = [
    {
      label: "Active operations",
      value: projectsLoading ? "—" : activeSources.length,
      icon: RefreshCw,
      color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      note: activeSources.length === 0 ? "All idle" : "Running now",
    },
    {
      label: "Documents indexed",
      value: projectsLoading ? "—" : allSources.filter((s) => s.status === "ready").length,
      icon: Brain,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      note: "In knowledge base",
    },
    {
      label: "Projects",
      value: projectsLoading ? "—" : projects.length,
      icon: FolderOpen,
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
      note: "Research contexts",
    },
    {
      label: "Agent templates",
      value: 4,
      icon: Sparkles,
      color: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
      note: "Ready to run",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Bot className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
            <p className="text-sm text-muted-foreground">
              Orchestrate research workflows with AI
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-fade-up-1">
        {statCards.map(({ label, value, icon: Icon, color, note }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-lg", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Templates + Active */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Templates */}
        <div className="lg:col-span-2 space-y-4 animate-fade-up-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agent templates</h2>
            <Zap className="h-4 w-4 text-muted-foreground/40" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <AgentTemplate key={t.title} {...t} />
            ))}
          </div>

          {/* New project CTA */}
          {!projectsLoading && projects.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Bot className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium text-sm">No projects yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a project first to start using AI agents
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href={`/projects/new${workspaceId ? `?workspace=${workspaceId}` : ""}`}>
                    Create project
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Active & recent */}
        <div className="space-y-4 animate-fade-up-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                {activeSources.length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                )}
                Active operations
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {projectsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                </div>
              ) : activeSources.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <span className="text-2xl">✓</span>
                  <p className="mt-2 text-sm text-muted-foreground">All agents idle</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeSources.map((s) => (
                    <ActiveAgentRow key={s.id} source={s} projectName={(s as typeof s & {projectName:string}).projectName ?? ""} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pb-4">
              {projectsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
                </div>
              ) : recentSources.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No activity yet</p>
              ) : (
                recentSources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor(s.status))} />
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {s.title ?? s.url ?? "Document"}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground/50">
                      {relativeTime(s.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
