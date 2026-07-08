"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Pencil, Plus, X } from "lucide-react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Separator, cn } from "@flora/ui"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { workspacesApi } from "@/lib/api"
import type { Workspace } from "@flora/types"

function makeSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

/* ── Rename workspace inline editor ── */
function WorkspaceRow({
  workspace,
  isActive,
  onActivate,
}: {
  workspace: Workspace
  isActive: boolean
  onActivate: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(workspace.name)
  const queryClient = useQueryClient()

  const rename = useMutation({
    mutationFn: (newName: string) => workspacesApi.update(workspace.id, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      setEditing(false)
    },
  })

  function handleSave() {
    if (name.trim() && name.trim() !== workspace.name) {
      rename.mutate(name.trim())
    } else {
      setEditing(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 flex-1 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave()
              if (e.key === "Escape") { setName(workspace.name); setEditing(false) }
            }}
          />
          <button
            onClick={handleSave}
            disabled={rename.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {rename.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => { setName(workspace.name); setEditing(false) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span
            className={cn("flex-1 text-sm font-medium", isActive && "text-emerald-700 dark:text-emerald-400")}
          >
            {workspace.name}
          </span>
          {isActive && (
            <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
          )}
          <button
            onClick={() => setEditing(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100"
            aria-label="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!isActive && (
            <button
              onClick={() => onActivate(workspace.id)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Switch
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Create workspace form ── */
function CreateWorkspaceForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)

  const create = useMutation({
    mutationFn: (n: string) => workspacesApi.create({ name: n, slug: makeSlug(n) }),
    onSuccess: (ws) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      setActiveWorkspaceId(ws.id)
      onDone()
    },
  })

  return (
    <div className="mt-3 flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        className="h-8 flex-1 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) create.mutate(name.trim())
          if (e.key === "Escape") onDone()
        }}
      />
      <Button
        size="sm"
        className="h-8"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate(name.trim())}
      >
        {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onDone}>
        Cancel
      </Button>
    </div>
  )
}

/* ── Page ── */
export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore()
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const activeId = activeWorkspaceId ?? workspaces[0]?.id

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <p className="mt-0.5 text-sm font-medium">{user?.name}</p>
          </div>
          <Separator />
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p className="mt-0.5 text-sm font-medium">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Workspaces */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Manage your research workspaces</CardDescription>
          </div>
          {!showCreateWorkspace && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => setShowCreateWorkspace(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {workspaces.map((ws) => (
                <div key={ws.id} className="group">
                  <WorkspaceRow
                    workspace={ws}
                    isActive={ws.id === activeId}
                    onActivate={setActiveWorkspaceId}
                  />
                </div>
              ))}
            </div>
          )}

          {showCreateWorkspace && (
            <CreateWorkspaceForm onDone={() => setShowCreateWorkspace(false)} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
