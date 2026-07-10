"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  FileSearch,
  FolderOpen,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Rss,
  Sparkles,
  Upload,
  Zap,
  XCircle,
} from "lucide-react"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@flora/ui"
import { engineApi, knowledgeApi, projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"

/* ── helpers ── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function healthColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 60) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

/* ── Agent template card ── */
interface TemplateProps {
  icon: React.ElementType
  title: string
  description: string
  href: string
  color: string
  badge?: string
}

function AgentTemplate({ icon: Icon, title, description, href, color, badge }: TemplateProps) {
  return (
    <Link href={href} className="group block">
      <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-emerald-500/30 hover:shadow-md">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{title}</p>
            {badge && (
              <Badge variant="secondary" className="text-[10px] font-normal h-4 px-1.5">
                {badge}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
      </div>
    </Link>
  )
}

/* ── Engine status panel ── */
function EnginePanel() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["engine-status"],
    queryFn: engineApi.status,
    staleTime: 60 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  })

  const { data: history = [] } = useQuery({
    queryKey: ["engine-history"],
    queryFn: engineApi.history,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ["engine-tasks"],
    queryFn: engineApi.tasks,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })

  const activeTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress")
  const recentRun = history[0]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
            <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <CardTitle className="text-sm font-semibold">Self-Improvement Engine</CardTitle>
          {status?.isRunning && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Running
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : !status ? (
          <p className="text-xs text-muted-foreground py-2">Engine offline</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className={cn("text-lg font-semibold tabular-nums", healthColor(status.healthScore))}>
                  {status.healthScore}
                </p>
                <p className="text-xs text-muted-foreground">Health score</p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-lg font-semibold tabular-nums">{status.scanCount}</p>
                <p className="text-xs text-muted-foreground">Total scans</p>
              </div>
            </div>

            {recentRun && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                Last run {relativeTime(recentRun.timestamp)} · {recentRun.filesScanned} files
              </div>
            )}

            {activeTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Pending tasks</p>
                {activeTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 bg-muted/30">
                    <span className={cn(
                      "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      task.impact === "high" ? "bg-red-500" : task.impact === "medium" ? "bg-amber-500" : "bg-blue-500"
                    )} />
                    <p className="flex-1 text-xs leading-snug line-clamp-2">{task.title}</p>
                    <Badge variant="secondary" className="shrink-0 text-[9px] font-normal h-4 px-1">
                      {task.impact}
                    </Badge>
                  </div>
                ))}
                {activeTasks.length > 3 && (
                  <p className="text-xs text-muted-foreground pl-4">+{activeTasks.length - 3} more</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Knowledge pipeline panel ── */
function PipelinePanel({ workspaceId }: { workspaceId: string }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["knowledge-runs", workspaceId],
    queryFn: () => knowledgeApi.runs(workspaceId),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })

  const recentRuns = runs.slice(0, 8)
  const runningNow = runs.filter((r) => r.status === "running")

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10">
            <Rss className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <CardTitle className="text-sm font-semibold">Knowledge Pipeline</CardTitle>
          {runningNow.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {runningNow.length} running
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
          </div>
        ) : recentRuns.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">No runs yet</p>
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link href="/knowledge">Open Knowledge</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                {run.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : run.status === "running" ? (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-amber-500 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">
                      {run.runType === "manual" ? "Manual run" : "Scheduled"}
                    </span>
                    {run.documentsNew > 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
                        +{run.documentsNew}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground/60">
                  {relativeTime(run.startedAt)}
                </span>
              </div>
            ))}
            <Link
              href="/knowledge?tab=feeds"
              className="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Manage feeds <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
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

  const { data: kStats } = useQuery({
    queryKey: ["knowledge-stats", workspaceId],
    queryFn: () => knowledgeApi.stats(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const { data: engineStatus } = useQuery({
    queryKey: ["engine-status"],
    queryFn: engineApi.status,
    staleTime: 60 * 1000,
    retry: 1,
  })

  const templates: TemplateProps[] = [
    {
      icon: MessageSquare,
      title: "Research Assistant",
      description: "Start an AI conversation grounded in your knowledge base. Retrieves top context automatically.",
      href: projects[0] ? `/projects/${projects[0].id}/threads/new` : "/projects",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      badge: "RAG",
    },
    {
      icon: Upload,
      title: "Document Ingestion",
      description: "Upload a PDF or URL and let the AI extract, chunk, embed, and index the knowledge.",
      href: projects[0] ? `/projects/${projects[0].id}/sources/add` : "/projects",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      badge: "Pipeline",
    },
    {
      icon: Lightbulb,
      title: "Insight Generator",
      description: "AI synthesises your project sources into structured research insights on any topic.",
      href: "/insights",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      badge: "Synthesis",
    },
    {
      icon: FileSearch,
      title: "Semantic Search",
      description: "Search across all sources with natural language. Hybrid vector + keyword fusion.",
      href: "/search",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      badge: "Hybrid",
    },
  ]

  const stats = [
    {
      label: "Health score",
      value: engineStatus ? engineStatus.healthScore : "—",
      icon: Activity,
      color: engineStatus
        ? healthColor(engineStatus.healthScore) + " bg-emerald-500/10"
        : "text-muted-foreground bg-muted",
      note: engineStatus?.isRunning ? "Engine running" : "Last scan",
    },
    {
      label: "Knowledge docs",
      value: kStats?.totalDocs ?? "—",
      icon: Brain,
      color: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
      note: kStats?.docsToday ? `+${kStats.docsToday} today` : "Total indexed",
    },
    {
      label: "Active feeds",
      value: kStats?.activeFeeds ?? "—",
      icon: Rss,
      color: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
      note: "Data sources",
    },
    {
      label: "Projects",
      value: projectsLoading ? "—" : projects.length,
      icon: FolderOpen,
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
      note: "Research contexts",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <Bot className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Autonomous pipelines and research workflows
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color, note }) => (
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

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Templates — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agent templates</h2>
            <Zap className="h-4 w-4 text-muted-foreground/40" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <AgentTemplate key={t.title} {...t} />
            ))}
          </div>

          {!projectsLoading && projects.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Bot className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium text-sm">No projects yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a project first to use research agents
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href={`/projects/new${workspaceId ? `?workspace=${workspaceId}` : ""}`}>
                    Create project
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Autonomous agents section */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Autonomous agents</h2>
              <Badge variant="outline" className="text-[10px] font-normal">Celery Beat</Badge>
            </div>
            <div className="space-y-2">
              {[
                {
                  icon: Rss,
                  name: "Knowledge Pipeline",
                  desc: "Collects 15 feeds every 30 min — RSS, ArXiv, GitHub, Google News, SEC",
                  color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                  status: "active",
                  href: "/knowledge",
                },
                {
                  icon: Brain,
                  name: "Self-Improvement Engine",
                  desc: "Scans codebase, detects gaps, updates ATLAS.md — runs every 30 min",
                  color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
                  status: engineStatus?.isRunning ? "running" : "active",
                  href: "/agents",
                },
              ].map(({ icon: Icon, name, desc, color, status, href }) => (
                <Link key={name} href={href} className="group block">
                  <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:border-emerald-500/20 hover:shadow-sm">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">{desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status === "running" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                      )} />
                      <span className="text-xs text-muted-foreground capitalize">{status}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right — 1/3 */}
        <div className="space-y-4">
          <EnginePanel />
          {workspaceId && <PipelinePanel workspaceId={workspaceId} />}
        </div>
      </div>
    </div>
  )
}
