import { create } from "zustand"
import { persist } from "zustand/middleware"

export type TaskStatus = "todo" | "in_progress" | "done"
export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  projectId?: string
  projectName?: string
  createdAt: string
  completedAt?: string
}

interface TasksStore {
  tasks: Task[]
  addTask: (task: Omit<Task, "id" | "createdAt">) => void
  updateTask: (id: string, updates: Partial<Omit<Task, "id" | "createdAt">>) => void
  deleteTask: (id: string) => void
}

export const useTasksStore = create<TasksStore>()(
  persist(
    (set) => ({
      tasks: [
        {
          id: "task_seed_1",
          title: "Review Q3 market research sources",
          description: "Go through uploaded PDFs and tag key findings",
          status: "in_progress",
          priority: "high",
          createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        },
        {
          id: "task_seed_2",
          title: "Generate competitor analysis insight",
          description: "Use AI to synthesize sources into a structured report",
          status: "todo",
          priority: "medium",
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
        {
          id: "task_seed_3",
          title: "Upload annual report PDFs",
          status: "done",
          priority: "low",
          createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
          completedAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ],
      addTask: (task) =>
        set((s) => ({
          tasks: [
            {
              ...task,
              id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
            },
            ...s.tasks,
          ],
        })),
      updateTask: (id, updates) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...updates,
                  completedAt:
                    updates.status === "done" && t.status !== "done"
                      ? new Date().toISOString()
                      : updates.status && updates.status !== "done"
                        ? undefined
                        : t.completedAt,
                }
              : t,
          ),
        })),
      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
    }),
    { name: "flora-tasks" },
  ),
)
