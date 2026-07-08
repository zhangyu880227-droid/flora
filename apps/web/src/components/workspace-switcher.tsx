"use client"

import { useQuery } from "@tanstack/react-query"
import { Building2, ChevronsUpDown } from "lucide-react"
import { workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"

export function WorkspaceSwitcher() {
  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]

  return (
    <button
      className="flex w-full items-center gap-2 rounded-md p-1 text-left text-sm font-medium hover:bg-muted"
      title="Switch workspace"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-background">
        <Building2 className="h-3.5 w-3.5" />
      </div>
      <span className="flex-1 truncate">{active?.name ?? "Select workspace"}</span>
      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}
