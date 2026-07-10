/**
 * Tasks — React Query hooks replacing the former Zustand localStorage store.
 * The API is workspace-scoped; callers must supply the active workspace ID.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tasksApi } from "@/lib/api"
import type { CreateTaskRequest, Task, TaskStatus, UpdateTaskRequest } from "@flora/types"

export type { Task, TaskStatus }
export type TaskPriority = "low" | "medium" | "high"

// ── Query keys ─────────────────────────────────────────────────────────────

export const taskKeys = {
  all: (workspaceId: string) => ["tasks", workspaceId] as const,
  list: (workspaceId: string, filters?: object) =>
    ["tasks", workspaceId, "list", filters] as const,
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useTasks(
  workspaceId: string | null,
  params?: { status?: TaskStatus; projectId?: string },
) {
  return useQuery({
    queryKey: taskKeys.list(workspaceId ?? "", params),
    queryFn: () => tasksApi.list(workspaceId!, params),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

export function useCreateTask(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTaskRequest) => tasksApi.create(workspaceId!, body),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: taskKeys.all(workspaceId) })
    },
  })
}

export function useUpdateTask(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: UpdateTaskRequest }) =>
      tasksApi.update(workspaceId!, taskId, body),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: taskKeys.all(workspaceId) })
    },
  })
}

export function useDeleteTask(workspaceId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(workspaceId!, taskId),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: taskKeys.all(workspaceId) })
    },
  })
}
