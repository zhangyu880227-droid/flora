"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  Bot,
  Brain,
  CheckSquare,
  Network,
  RefreshCw,
  Shield,
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
import {
  agentsApi,
  engineHealthApi,
  knowledgeGraphApi,
  learningApi,
  memoriesApi,
  tasksApi,
} from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"

/* ── mini helpers ── */

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
    </div>
  )
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  loading?: boolean
}) {
  return (
    <Card>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground">{sub}</p>
            )}
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── page ── */

export default function DashboardPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const user = useAuthStore((s) => s.user)

  const wsId = workspaceId ?? ""
  const enabled = !!workspaceId

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => engineHealthApi.health(),
    enabled: true,
    staleTime: 60_000,
  })

  const { data: memStats, isLoading: memLoading } = useQuery({
    queryKey: ["memory-stats", wsId],
    queryFn: () => memoriesApi.stats(wsId),
    enabled,
    staleTime: 60_000,
  })

  const { data: kgStats, isLoading: kgLoading } = useQuery({
    queryKey: ["kg-stats", wsId],
    queryFn: () => knowledgeGraphApi.stats(wsId),
    enabled,
    staleTime: 60_000,
  })

  const { data: learnStats, isLoading: learnLoading } = useQuery({
    queryKey: ["learning-stats", wsId],
    queryFn: () => learningApi.stats(wsId),
    enabled,
    staleTime: 60_000,
  })

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", wsId],
    queryFn: () => tasksApi.list(wsId, { pageSize: 5 }),
    enabled,
    staleTime: 30_000,
  })

  const { data: agentJobs, isLoading: agentsLoading } = useQuery({
    queryKey: ["agent-jobs", wsId],
    queryFn: () => agentsApi.listJobs(wsId, { pageSize: 5 }),
    enabled,
    staleTime: 30_000,
  })

  const todoTasks = (tasks ?? []).filter((t) => t.status === "todo")
  const runningAgents = (agentJobs ?? []).filter((j) => j.status === "running")

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Flora OS Overview"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Today's Tasks"
          value={todoTasks.length}
          sub="pending"
          icon={CheckSquare}
          loading={tasksLoading}
        />
        <StatCard
          title="Memory Records"
          value={memStats?.total ?? "—"}
          sub={
            memStats
              ? `${memStats.by_type?.document ?? 0} docs · ${memStats.by_type?.semantic ?? 0} entities`
              : undefined
          }
          icon={Brain}
          loading={memLoading}
        />
        <StatCard
          title="KG Nodes"
          value={
            kgStats
              ? (kgStats as unknown as { node_count?: number; nodeCount?: number })
                  ?.node_count ??
                (kgStats as unknown as { node_count?: number; nodeCount?: number })
                  ?.nodeCount ??
                "—"
              : "—"
          }
          sub="knowledge graph"
          icon={Network}
          loading={kgLoading}
        />
        <StatCard
          title="Active Agents"
          value={runningAgents.length}
          sub={`${agentJobs?.length ?? 0} total jobs`}
          icon={Bot}
          loading={agentsLoading}
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* System Health */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : health ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Health Score</span>
                    <span className="font-bold text-lg">{health.health_score}/100</span>
                  </div>
                  <HealthBar score={health.health_score} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {Object.entries(health.by_severity ?? {}).map(([sev, count]) => (
                    <div key={sev} className="rounded-lg bg-muted p-2">
                      <p className="text-xs text-muted-foreground capitalize">{sev}</p>
                      <p className="font-bold text-sm">{String(count)}</p>
                    </div>
                  ))}
                </div>
                {health.top_issues?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Issues</p>
                    {health.top_issues.slice(0, 3).map((issue) => (
                      <div
                        key={issue.id}
                        className="flex items-start gap-2 rounded-md border border-border/60 p-2.5 text-xs"
                      >
                        <Badge
                          variant={issue.severity === "critical" || issue.severity === "high" ? "destructive" : "secondary"}
                          className="shrink-0 text-[10px] py-0"
                        >
                          {issue.severity}
                        </Badge>
                        <span className="text-muted-foreground leading-relaxed line-clamp-2">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No scan data yet. Run a scan to see results.</p>
            )}
          </CardContent>
        </Card>

        {/* Learning Progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Auto-Learning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {learnLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : learnStats ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-xs text-muted-foreground">Jobs Run</p>
                    <p className="text-xl font-bold">{learnStats.completed_jobs}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-xs text-muted-foreground">Docs Scanned</p>
                    <p className="text-xl font-bold">{learnStats.total_documents_scanned}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-xs text-muted-foreground">Memories</p>
                    <p className="text-xl font-bold">{learnStats.total_memories_created}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-xs text-muted-foreground">KG Updates</p>
                    <p className="text-xl font-bold">{learnStats.total_kg_nodes_updated}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No learning runs yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pending Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" />
              Pending Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : todoTasks.length > 0 ? (
              <div className="space-y-2">
                {todoTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-md border border-border/60 p-2.5 text-sm"
                  >
                    <div
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        task.priority === "high"
                          ? "bg-red-500"
                          : task.priority === "medium"
                          ? "bg-yellow-500"
                          : "bg-muted-foreground",
                      )}
                    />
                    <span className="flex-1 truncate">{task.title}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending tasks.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Agent Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent Agent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : agentJobs && agentJobs.length > 0 ? (
              <div className="space-y-2">
                {agentJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 rounded-md border border-border/60 p-2.5 text-sm"
                  >
                    <div
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        job.status === "completed"
                          ? "bg-green-500"
                          : job.status === "running"
                          ? "bg-blue-500 animate-pulse"
                          : job.status === "failed"
                          ? "bg-red-500"
                          : "bg-muted-foreground",
                      )}
                    />
                    <span className="flex-1 truncate">{job.name || job.agentType}</span>
                    <Badge
                      variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] py-0"
                    >
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No agent jobs yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Recommended Engine Tasks */}
        {health?.recommended_tasks && health.recommended_tasks.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top Recommended Improvements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {health.recommended_tasks.slice(0, 6).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-md border border-border/60 p-3 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] py-0 capitalize">
                        {task.impact} impact
                      </Badge>
                      <span className="text-muted-foreground">{Math.round(task.score)} pts</span>
                    </div>
                    <p className="font-medium leading-snug line-clamp-2">{task.title}</p>
                    {task.files[0] && (
                      <p className="text-muted-foreground truncate font-mono">{task.files[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
