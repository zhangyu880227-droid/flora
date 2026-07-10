"use client"

import { useState } from "react"
import {
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Badge, Button, Card, CardContent, Input, Label, cn } from "@flora/ui"
import type { Task, TaskPriority, TaskStatus } from "@flora/types"
import {
  useCreateTask,
  useDeleteTask,
  useTasks,
  useUpdateTask,
} from "@/stores/tasks"
import { useWorkspaceStore } from "@/stores/workspace"

/* ── helpers ── */

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ElementType; color: string }> = {
  todo:        { label: "To Do",       icon: Circle,        color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock,         color: "text-amber-600 dark:text-amber-400" },
  done:        { label: "Done",        icon: CheckCircle2,  color: "text-emerald-600 dark:text-emerald-400" },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  high:   { label: "High",   variant: "destructive" },
  medium: { label: "Medium", variant: "outline" },
  low:    { label: "Low",    variant: "secondary" },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return "just now"
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/* ── Task card ── */
function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: Task
  onUpdate: (taskId: string, status: TaskStatus) => void
  onDelete: (taskId: string) => void
}) {
  const StatusIcon = STATUS_CONFIG[task.status].icon

  const nextStatus: TaskStatus =
    task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo"

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-card px-4 py-3.5 transition-all hover:shadow-sm",
        task.status === "done" ? "border-border/50 opacity-60" : "border-border",
      )}
    >
      {/* Status toggle */}
      <button
        onClick={() => onUpdate(task.id, nextStatus)}
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          STATUS_CONFIG[task.status].color,
          "hover:opacity-70",
        )}
        title={`Mark as ${nextStatus.replace("_", " ")}`}
      >
        <StatusIcon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            task.status === "done" && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{task.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge
            variant={PRIORITY_CONFIG[task.priority].variant}
            className="h-4 px-1.5 text-[10px] font-medium"
          >
            {PRIORITY_CONFIG[task.priority].label}
          </Badge>
          <span className="text-[10px] text-muted-foreground/50">{relativeTime(task.createdAt)}</span>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 rounded-md p-1 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/50 hover:bg-destructive/10 hover:!text-destructive"
        title="Delete task"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ── New task form ── */
function NewTaskForm({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (title: string, description: string | undefined, priority: TaskPriority) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("medium")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onCreate(title.trim(), description.trim() || undefined, priority)
    onClose()
  }

  return (
    <Card className="border-emerald-500/30 shadow-md">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">New task</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
            className="text-sm"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Priority:</Label>
            {(["low", "medium", "high"] as TaskPriority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all",
                  priority === p
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Add task
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ── Status column ── */
function StatusColumn({
  status,
  tasks,
  onUpdate,
  onDelete,
}: {
  status: TaskStatus
  tasks: Task[]
  onUpdate: (taskId: string, status: TaskStatus) => void
  onDelete: (taskId: string) => void
}) {
  const { label, icon: Icon, color } = STATUS_CONFIG[status]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed py-6 text-center">
            <p className="text-xs text-muted-foreground">No tasks</p>
          </div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onUpdate={onUpdate} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Page ── */
export default function TasksPage() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: tasks = [], isLoading } = useTasks(activeWorkspaceId)
  const createTask = useCreateTask(activeWorkspaceId)
  const updateTask = useUpdateTask(activeWorkspaceId)
  const deleteTask = useDeleteTask(activeWorkspaceId)

  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<TaskStatus | "all">("all")

  function handleCreate(title: string, description: string | undefined, priority: TaskPriority) {
    createTask.mutate({ title, description, status: "todo", priority })
  }

  function handleUpdate(taskId: string, status: TaskStatus) {
    updateTask.mutate({ taskId, body: { status } })
  }

  function handleDelete(taskId: string) {
    deleteTask.mutate(taskId)
  }

  const byStatus: Record<TaskStatus, Task[]> = {
    todo:        tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done:        tasks.filter((t) => t.status === "done"),
  }

  const filteredForList =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.filter((t) => t.status !== "done").length} open ·{" "}
              {tasks.filter((t) => t.status === "done").length} done
            </p>
          </div>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New task
          </Button>
        )}
      </div>

      {/* New task form */}
      {showForm && (
        <div className="animate-fade-up">
          <NewTaskForm onClose={() => setShowForm(false)} onCreate={handleCreate} />
        </div>
      )}

      {/* No workspace warning */}
      {!activeWorkspaceId && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Select a workspace to see your tasks.
        </div>
      )}

      {/* View toggle */}
      <div className="animate-fade-up-1 flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit">
        {([
          { value: "all",        label: "All",         count: tasks.length },
          { value: "todo",       label: "To Do",       count: byStatus.todo.length },
          { value: "in_progress",label: "In Progress", count: byStatus.in_progress.length },
          { value: "done",       label: "Done",        count: byStatus.done.length },
        ] as { value: TaskStatus | "all"; label: string; count: number }[]).map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              filter === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                filter === value
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Task list (filtered) or Kanban columns */}
      {filter !== "all" ? (
        <div className="animate-fade-up-2 space-y-2">
          {filteredForList.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
              <CheckSquare className="mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No tasks here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filter === "todo" ? "Add a task to get started" : "Nothing in this state yet"}
              </p>
            </div>
          ) : (
            filteredForList.map((t) => (
              <TaskCard key={t.id} task={t} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}
        </div>
      ) : (
        <div className="animate-fade-up-2 grid gap-6 lg:grid-cols-3">
          {(["todo", "in_progress", "done"] as TaskStatus[]).map((status) => (
            <StatusColumn
              key={status}
              status={status}
              tasks={byStatus[status]}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {tasks.length === 0 && activeWorkspaceId && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <CheckSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No tasks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first task to track research to-dos
          </p>
          <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add task
          </Button>
        </div>
      )}
    </div>
  )
}
