"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckSquare,
  FolderOpen,
  MessageSquare,
  Plus,
  Sparkles,
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
import { projectsApi, sourcesApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import { useTasksStore } from "@/stores/tasks"
import type { Project } from "@flora/types"

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
function WelcomeBanner({
  name,
  workspaceName,
}: {
  name?: string | null
  workspaceName?: string
}) {
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
            {workspaceName ? `${workspaceName} · ` : ""}Your AI research workspace is ready
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
              asChild
            >
              <Link href="/projects">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Projects
              </Link>
            </Button>
            <Button
              size="sm"
              className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
              asChild
            >
              <Link href="/agents">
                <Bot className="mr-1.5 h-3.5 w-3.5" />
                AI Agents
              </Link>
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
}

function StatCard({ icon: Icon, label, value, sub, color, href }: StatCardProps) {
  const inner = (
    <CardContent className="p-5">
      <div className={cn("mb-3 flex h-8 w-8 items-center justify-center rounded-lg", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>}
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="overflow-hidden transition-all hover:shadow-sm hover:border-border/80">
          {inner}
        </Card>
      </Link>
    )
  }

  return <Card className="overflow-hidden">{inner}</Card>
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
          <p className="truncate text-sm font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
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
  const { tasks } = useTasksStore()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0]

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const { data: allSources = [] } = useQuery({
    queryKey: ["all-sources-home", workspaceId],
    queryFn: async () => {
      const results = await Promise.all(projects.map((p) => sourcesApi.list(p.id)))
      return results.flat()
    },
    enabled: projects.length > 0,
  })

  const openTasks = tasks.filter((t) => t.status !== "done").length
  const totalSources = projects.reduce((s, p) => s + (p.sourceCount ?? 0), 0)

  const quickActions = [
    {
      icon: FolderOpen,
      label: "New project",
      desc: "Start a research project",
      href: workspaceId ? `/projects/new?workspace=${workspaceId}` : "/projects",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      icon: Bot,
      label: "AI Agents",
      desc: "Run research workflows",
      href: "/agents",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: BookOpen,
      label: "Knowledge base",
      desc: "Browse all sources",
      href: "/knowledge",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      icon: MessageSquare,
      label: "Threads",
      desc: "AI conversations",
      href: "/threads",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Welcome */}
      <div className="animate-fade-up">
        <WelcomeBanner name={user?.name} workspaceName={activeWorkspace?.name} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-fade-up-1">
        <StatCard
          icon={FolderOpen}
          label="Projects"
          value={isLoading ? "—" : projects.length}
          sub="Active research"
          color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          href="/projects"
        />
        <StatCard
          icon={BookOpen}
          label="Sources"
          value={isLoading ? "—" : totalSources}
          sub="Docs ingested"
          color="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          href="/knowledge"
        />
        <StatCard
          icon={CheckSquare}
          label="Open tasks"
          value={openTasks}
          sub="To do"
          color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          href="/tasks"
        />
        <StatCard
          icon={Bot}
          label="Agents"
          value={allSources.filter((s) => s.status === "processing").length}
          sub="Running now"
          color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          href="/agents"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Projects list — 2/3 */}
        <div className="lg:col-span-2 animate-fade-up-2">
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
              {isLoading ? (
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create your first project to start researching
                  </p>
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
                      View all {projects.length} projects
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — 1/3 */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <Card className="animate-fade-up-3">
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
          {tasks.filter((t) => t.status !== "done").length > 0 && (
            <Card className="animate-fade-up-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Open tasks</CardTitle>
                  <Link
                    href="/tasks"
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 pb-4">
                {tasks
                  .filter((t) => t.status !== "done")
                  .slice(0, 4)
                  .map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          task.priority === "high"
                            ? "bg-red-500"
                            : task.priority === "medium"
                              ? "bg-amber-500"
                              : "bg-blue-500",
                        )}
                      />
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {task.title}
                      </p>
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] font-normal capitalize h-4 px-1.5"
                      >
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
