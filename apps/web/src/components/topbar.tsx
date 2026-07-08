"use client"

import { useRouter } from "next/navigation"
import { Bell, Plus, Search, Settings, LogOut } from "lucide-react"
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@flora/ui"
import { useAuthStore } from "@/stores/auth"
import { authApi } from "@/lib/api"

function initials(name?: string | null): string {
  if (!name) return "?"
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("")
}

export function Topbar() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  async function handleLogout() {
    await authApi.logout().catch(() => {})
    setUser(null)
    router.push("/login")
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
      {/* ── Search ── */}
      <button className="flex flex-1 max-w-sm items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Search or ask anything…</span>
        <span className="sm:hidden">Search…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {/* ── Actions ── */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Create */}
        <Button size="sm" className="hidden gap-1.5 sm:flex">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
        <Button size="icon" variant="ghost" className="sm:hidden h-8 w-8" aria-label="New">
          <Plus className="h-4 w-4" />
        </Button>

        {/* Notifications */}
        <Button size="icon" variant="ghost" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </Button>

        {/* Avatar / user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-0.5 rounded-full outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-ring hover:ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Avatar className="h-8 w-8 text-xs">
                <AvatarFallback className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="font-medium text-sm text-foreground">{user?.name ?? "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
