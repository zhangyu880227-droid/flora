"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Brain,
  CheckSquare,
  Database,
  FolderOpen,
  Globe,
  MessageSquare,
  Plus,
  Rss,
  Sparkles,
  TrendingUp,
  Zap,
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
import { engineApi, knowledgeApi, projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import { useTasks } from "@/stores/tasks"
import type { Project, Task } from "@flora/types"

/* ── helpers ── */

function greeting(name?: string | null): string {
  const h = new Date().getHours()
  const prefix = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  return name ? `${prefix}, ${name.split(" ")[0]}` : prefix
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/* ── Welcome banner ── */
function WelcomeBanner({ name, workspaceName }: { name?: string | null; workspaceName?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle at 1.5px 1.5px, white 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 right-1/3 h-36 w-36 rounded-full bg-teal-300/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-100/80">{formatDate()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(name)}</h1>
          <p className="mt-1 text-sm text-emerald-100/70">
            {workspaceName ? `${workspaceName} · ` : ""}Your intelligence workspace is ready
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30" asChild>
              <Link href="/projects"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Projects</Link>
            </Button>
            <Button size="sm" className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30" asChild>
              <Link href="/knowledge"><Globe className="mr-1.5 h-3.5 w-3.5" />Knowledge</Link>
            </Button>
            <Button size="sm" className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30" asChild>
              <Link href="/agents"><Bot className="mr-1.5 h-3.5 w-3.5" />Agents</Link>
            </Button>
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Sparkles className="h-6 w-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Stat card ── */
interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
  href?: string
  loading?: boolean
}

function StatCard({ icon: Icon, label, value, sub, color, href, loading }: StatCardProps) {
  const inner = (
    <CardContent className="p-5">
      <div className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-lg", color)}>
        <Icon className="h-4 w-4" />
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-12 mb-1" />
          <Skeleton className="h-3 w-20" />
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>}
        </>
      )}
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="overflow-hidden transition-all hover:shadow-sm hover:border-border/80">{inner}</Card>
      </Link>
    )
  }
  return <Card className="overflow-hidden">{inner}</Card>
}

/* ── Today's Intelligence Briefing ── */
function BriefingCard({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["knowledge-briefing", workspaceId],
    queryFn: () => knowledgeApi.briefing(workspaceId),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
            <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <CardTitle className="text-sm font-semibold">Today&apos;s Intelligence</CardTitle>
          {data && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {data.recentDocCount} new today
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        ) : isError || !data ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">No briefing available yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Run your feeds to generate intelligence.</p>
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link href="/knowledge">Open Knowledge</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-6">
              {data.briefing}
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground/60">
                {data.docCount} docs · {data.nodeCount} entities
              </span>
              <Link
                href="/knowledge"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Full knowledge base <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Trending Entities ── */
function TrendingCard({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["knowledge-trending", workspaceId],
    queryFn: () => knowledgeApi.trending(workspaceId, 24, 8),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const entityColor: Record<string, string> = {
    org: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    tech: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    person: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    product: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    concept: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
            <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-sm font-semibold">Trending</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">24h</span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12 ml-auto" />
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No trending data yet</p>
        ) : (
          <div className="space-y-1.5">
            {data.map((entity) => (
              <div key={entity.name} className="flex items-center gap-2 rounded-lg px-1 py-1">
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] font-normal uppercase tracking-wide shrink-0",
                    entityColor[entity.entity_type] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {entity.entity_type}
                </Badge>
                <span className="flex-1 truncate text-xs font-medium">{entity.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {entity.recent_count}×
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Project row ── */
function ProjectRow({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-all hover:border-emerald-500/30 hover:bg-muted/30 hover:shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
          <FolderOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
            {project.name}
          </p>
          {project.description && (
            <p className="truncate text-xs text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            {project.sourceCount ?? 0} source{project.sourceCount !== 1 ? "s" : ""}
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
        </div>
      </div>
    </Link>
  )
}

/* ── Page ── */
export default function WorkspacePage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaceStore()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id
  const { data: tasks = [] } = useTasks(workspaceId ?? null)
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0]

  const { data: projects = [], isLoading: projLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const { data: kStats, isLoading: kStatsLoading } = useQuery({
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

  const openTasks = tasks.filter((t: Task) => t.status !== "done").length

  const quickActions = [
    {
      icon: FolderOpen,
      label: "New project",
      desc: "Start a research project",
      href: workspaceId ? `/projects/new?workspace=${workspaceId}` : "/projects",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      icon: Globe,
      label: "Knowledge",
      desc: "Browse all collected docs",
      href: "/knowledge",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      icon: Bot,
      label: "AI Agents",
      desc: "Run research workflows",
      href: "/agents",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: MessageSquare,
      label: "Threads",
      desc: "AI research conversations",
      href: "/threads",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      icon: Zap,
      label: "Insights",
      desc: "AI-generated syntheses",
      href: "/insights",
      color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Welcome */}
      <WelcomeBanner name={user?.name} workspaceName={activeWorkspace?.name} />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FolderOpen}
          label="Projects"
          value={projLoading ? "—" : projects.length}
          sub="Active research"
          color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          href="/projects"
          loading={projLoading}
        />
        <StatCard
          icon={Database}
          label="Knowledge docs"
          value={kStatsLoading ? "—" : (kStats?.totalDocs ?? 0)}
          sub={kStats?.docsToday ? `+${kStats.docsToday} today` : "Total collected"}
          color="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          href="/knowledge"
          loading={kStatsLoading}
        />
        <StatCard
          icon={Rss}
          label="Active feeds"
          value={kStatsLoading ? "—" : (kStats?.activeFeeds ?? 0)}
          sub="Data sources"
          color="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
          href="/knowledge"
          loading={kStatsLoading}
        />
        <StatCard
          icon={CheckSquare}
          label="Open tasks"
          value={openTasks}
          sub={engineStatus?.activeTasks ? `${engineStatus.activeTasks} engine tasks` : "To do"}
          color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          href="/tasks"
        />
      </div>

      {/* Main grid: 2/3 + 1/3 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: briefing + projects */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Today's Intelligence */}
          {workspaceId && <BriefingCard workspaceId={workspaceId} />}

          {/* Recent projects */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent projects</CardTitle>
              {workspaceId && (
                <Button size="sm" variant="ghost" asChild className="h-7 gap-1.5 text-xs">
                  <Link href={`/projects/new?workspace=${workspaceId}`}>
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="pb-4">
              {projLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium">No projects yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Create your first to start researching</p>
                  {workspaceId && (
                    <Button asChild size="sm" className="mt-4">
                      <Link href={`/projects/new?workspace=${workspaceId}`}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New project
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 6).map((project) => (
                    <ProjectRow key={project.id} project={project} />
                  ))}
                  {projects.length > 6 && (
                    <Link
                      href="/projects"
                      className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      View all {projects.length} projects <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Trending entities */}
          {workspaceId && <TrendingCard workspaceId={workspaceId} />}

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5 pb-4">
              {quickActions.map(({ icon: Icon, label, desc, href, color }) => (
                <Link
                  key={label}
                  href={href}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Open tasks preview */}
          {tasks.filter((t: Task) => t.status !== "done").length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Open tasks</CardTitle>
                  <Link href="/tasks" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                    View all
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 pb-4">
                {tasks
                  .filter((t: Task) => t.status !== "done")
                  .slice(0, 4)
                  .map((task: Task) => (
                    <div key={task.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          task.priority === "high" ? "bg-red-500"
                            : task.priority === "medium" ? "bg-amber-500"
                            : "bg-blue-500"
                        )}
                      />
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{task.title}</p>
                      <Badge variant="secondary" className="shrink-0 text-[10px] font-normal capitalize h-4 px-1.5">
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
