export type TaskStatus = "todo" | "in_progress" | "done"
export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  id: string
  workspaceId: string
  userId: string
  projectId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  source: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskRequest {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  projectId?: string
  dueDate?: string
  source?: string
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  projectId?: string | null
  dueDate?: string | null
}
