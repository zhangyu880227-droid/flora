"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Bot,
  FolderOpen,
  Lightbulb,
  MessageSquare,
  Plus,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@flora/ui"
import { projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import type { Project } from "@flora/types"

/* ──────────────────────────────── helpers ── */

function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const prefix = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return name ? `${prefix}, ${name.split(" ")[0]}` : prefix
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/* ──────────────────────────────── components ── */

function WelcomeCard({ name, workspaceName }: { name?: string | null; workspaceName?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white animate-fade-up">
      {/* Background texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Glow orbs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 right-1/3 h-40 w-40 rounded-full bg-teal-300/20 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-100">{formatDate()}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(name)}</h1>
            <p className="mt-1 text-sm text-emerald-100">
              {workspaceName ? `${workspaceName} · ` : ""}Your AI research workspace is ready
            </p>
          </div>
          <div className="hidden shrink-0 sm:block">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
            asChild
          >
            <Link href="/projects">
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              View projects
            </Link>
          </Button>
          <Button
            size="sm"
            className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
            asChild
          >
            <Link href="/threads">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Start chat
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
  delay?: string
}

function StatCard({ icon: Icon, label, value, sub, color, delay = "" }: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden animate-fade-up", delay)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
        <div className="mt-3">
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground/60">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <div className="flex items-start gap-3 rounded-xl border border-border p-4 transition-all hover:border-emerald-500/30 hover:bg-muted/40 hover:shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
          <FolderOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
            {project.name}
          </p>
          {project.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground line-clamp-1">
              {project.description}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {project.sourceCount ?? 0} source{project.sourceCount !== 1 ? "s" : ""}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
      </div>
    </Link>
  )
}

function QuickActionsCard({ workspaceId }: { workspaceId?: string }) {
  const actions = [
    {
      icon: FolderOpen,
      label: "New project",
      desc: "Start a research project",
      href: workspaceId ? `/projects/new?workspace=${workspaceId}` : "/projects",
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    },
    {
      icon: Upload,
      label: "Upload PDF",
      desc: "Add a document to your brain",
      href: "/projects",
      color: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    },
    {
      icon: MessageSquare,
      label: "Start a chat",
      desc: "Talk to your knowledge base",
      href: "/threads",
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    },
    {
      icon: Lightbulb,
      label: "Generate insight",
      desc: "AI synthesis from sources",
      href: "/insights",
      color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    },
  ]

  return (
    <Card className="animate-fade-up-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {actions.map(({ icon: Icon, label, desc, href, color }) => (
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
  )
}

function SystemStatusCard() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/health`)
      return res.json() as Promise<{ status: string }>
    },
    retry: false,
    staleTime: 30_000,
  })

  const apiOk = !isLoading && health?.status === "ok"

  const statuses = [
    {
      label: "API server",
      ok: apiOk,
      loading: isLoading,
    },
    {
      label: "Database",
      ok: apiOk,
      loading: isLoading,
    },
    {
      label: "Background jobs",
      ok: true,
      loading: false,
      badge: "0 running",
    },
  ]

  return (
    <Card className="animate-fade-up-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">System status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {statuses.map(({ label, ok, loading, badge }) => (
          <div key={label} className="flex items-center gap-2.5">
            {loading ? (
              <Skeleton className="h-2 w-2 rounded-full" />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  ok ? "bg-emerald-500" : "bg-red-500",
                )}
              />
            )}
            <span className="flex-1 text-sm text-muted-foreground">{label}</span>
            {badge ? (
              <Badge variant="secondary" className="text-xs font-normal">
                {badge}
              </Badge>
            ) : loading ? (
              <Skeleton className="h-4 w-14" />
            ) : (
              <span className={cn("text-xs font-medium", ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                {ok ? "Operational" : "Offline"}
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/* ──────────────────────────────── page ── */

export default function WorkspacePage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaceStore()

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

  const stats = [
    {
      icon: FolderOpen,
      label: "Projects",
      value: isLoading ? "—" : String(projects.length),
      sub: "Active research",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      delay: "animate-fade-up-1",
    },
    {
      icon: BookOpen,
      label: "Sources",
      value: isLoading ? "—" : String(projects.reduce((s, p) => s + (p.sourceCount ?? 0), 0)),
      sub: "Docs ingested",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      delay: "animate-fade-up-2",
    },
    {
      icon: MessageSquare,
      label: "Threads",
      value: "—",
      sub: "Coming soon",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      delay: "animate-fade-up-3",
    },
    {
      icon: Bot,
      label: "Agents",
      value: "0",
      sub: "Running now",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      delay: "animate-fade-up-4",
    },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-12">
      {/* Welcome */}
      <WelcomeCard name={user?.name} workspaceName={activeWorkspace?.name} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent projects — 2/3 */}
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
                    <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <FolderOpen className="h-6 w-6 text-muted-foreground" />
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
                  {projects.slice(0, 5).map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                  {projects.length > 5 && (
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
          <QuickActionsCard workspaceId={workspaceId} />
          <SystemStatusCard />
        </div>
      </div>
    </div>
  )
}
