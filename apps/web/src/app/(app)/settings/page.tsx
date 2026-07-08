"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Bell,
  Key,
  Laptop,
  Moon,
  Settings,
  Sun,
  User,
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
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { workspacesApi } from "@/lib/api"
import { useTheme } from "next-themes"

/* ── Section wrapper ── */
function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>
}

/* ── Page ── */
export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { activeWorkspaceId } = useWorkspaceStore()
  const { theme, setTheme } = useTheme()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const activeWorkspace = workspaces.find((w) => w.id === (activeWorkspaceId ?? workspaces[0]?.id))

  function initials(name?: string | null) {
    if (!name) return "?"
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 pb-12">
      {/* Header */}
      <div className="animate-fade-up flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
        </div>
      </div>

      {/* Account */}
      <Card className="animate-fade-up-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-muted-foreground" />
            Account
          </CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              {initials(user?.name)}
            </div>
            <div>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <Separator />

          <Section>
            <Label className="text-xs font-medium text-muted-foreground">Full name</Label>
            <Input value={user?.name ?? ""} disabled className="text-sm" />
          </Section>

          <Section>
            <Label className="text-xs font-medium text-muted-foreground">Email address</Label>
            <Input value={user?.email ?? ""} disabled className="text-sm" />
          </Section>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="animate-fade-up-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sun className="h-4 w-4 text-muted-foreground" />
            Appearance
          </CardTitle>
          <CardDescription>Choose how Flora looks on this device</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: "light",  label: "Light",  icon: Sun },
              { value: "dark",   label: "Dark",   icon: Moon },
              { value: "system", label: "System", icon: Laptop },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all",
                  theme === value
                    ? "border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
                    : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
                {theme === value && (
                  <Badge variant="secondary" className="text-[10px] font-normal px-1.5 h-4">
                    Active
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API keys */}
      <Card className="animate-fade-up-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-muted-foreground" />
            API configuration
          </CardTitle>
          <CardDescription>Managed server-side — no client keys needed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {[
            { label: "LLM provider", value: "OpenAI (GPT-4o)", status: "Connected" },
            { label: "Embedding model", value: "Voyage AI (voyage-3)", status: "Connected" },
            { label: "Vector database", value: "pgvector (PostgreSQL)", status: "Connected" },
          ].map(({ label, value, status }) => (
            <div key={label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{value}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{status}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Active workspace summary */}
      {activeWorkspace && (
        <Card className="animate-fade-up-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Active workspace
            </CardTitle>
            <CardDescription>Currently scoped to this workspace</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 dark:bg-emerald-500/10">
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {activeWorkspace.name}
                </p>
                <p className="text-xs text-muted-foreground">/{activeWorkspace.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-normal">Active</Badge>
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <a href="/workspaces">Manage</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
