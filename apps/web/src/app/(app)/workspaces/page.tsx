"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  Check,
  Loader2,
  Pencil,
  Plus,
  Users,
  X,
} from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  cn,
} from "@flora/ui"
import { workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import type { Workspace } from "@flora/types"

/* ── helpers ── */

function makeSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

/* ── Workspace card ── */
function WorkspaceCard({
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
      setName(workspace.name)
      setEditing(false)
    }
  }

  return (
    <div
      className={cn(
        "group rounded-2xl border p-5 transition-all",
        isActive
          ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10"
          : "border-border bg-card hover:border-border/80 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            isActive
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Building2 className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
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
                {rename.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => { setName(workspace.name); setEditing(false) }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className={cn("font-semibold", isActive && "text-emerald-700 dark:text-emerald-400")}>
                {workspace.name}
              </h3>
              {isActive && (
                <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
              )}
            </div>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">/{workspace.slug}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-accent group-hover:opacity-100"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {!isActive && !editing && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onActivate(workspace.id)}
            >
              Switch
            </Button>
          )}
        </div>
      </div>
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
    <Card className="border-emerald-500/30 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">New workspace</p>
          <button
            onClick={onDone}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            className="flex-1 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create.mutate(name.trim())
              if (e.key === "Escape") onDone()
            }}
          />
          <Button
            size="sm"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate(name.trim())}
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Page ── */
export default function WorkspacesPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore()
  const [showCreate, setShowCreate] = useState(false)

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const activeId = activeWorkspaceId ?? workspaces[0]?.id
  const activeWorkspace = workspaces.find((w) => w.id === activeId)

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members", activeId],
    queryFn: () => workspacesApi.listMembers(activeId!),
    enabled: !!activeId,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
            <Building2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
            <p className="text-sm text-muted-foreground">
              Manage your research workspaces
            </p>
          </div>
        </div>
        {!showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New workspace
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="animate-fade-up">
          <CreateWorkspaceForm onDone={() => setShowCreate(false)} />
        </div>
      )}

      {/* Active workspace detail */}
      {activeWorkspace && (
        <div className="animate-fade-up-1 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
            Active workspace
          </h2>
          <Card className="border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                  <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
                    {activeWorkspace.name}
                  </CardTitle>
                  <CardDescription>/{activeWorkspace.slug}</CardDescription>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs font-normal">Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <Separator className="mb-4" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <p className="mt-0.5 text-sm font-medium">{user?.name ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Members</Label>
                  <p className="mt-0.5 text-sm font-medium">
                    {membersLoading ? "—" : members.length}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Workspace ID</Label>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {activeWorkspace.id.slice(0, 16)}…
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members */}
          {members.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Members
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="divide-y">
                  {members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-3 py-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {(m.user?.name ?? "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{m.user?.name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{m.user?.email ?? ""}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs capitalize font-normal">
                        {m.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* All workspaces */}
      <div className="animate-fade-up-2 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
          All workspaces
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border bg-muted" />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed py-12 text-center">
            <Building2 className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No workspaces yet</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              Create workspace
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                isActive={ws.id === activeId}
                onActivate={setActiveWorkspaceId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
