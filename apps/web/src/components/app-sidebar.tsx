"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronLeft,
  FolderOpen,
  Lightbulb,
  LogOut,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  LayoutDashboard,
} from "lucide-react"
import { Avatar, AvatarFallback, ScrollArea, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@flora/ui"
import { FloraLogo } from "@/components/flora-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuthStore } from "@/stores/auth"
import { authApi } from "@/lib/api"

const NAV_ITEMS = [
  { href: "/workspace", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/threads",   icon: MessageSquare,   label: "Threads" },
  { href: "/projects",  icon: FolderOpen,      label: "Projects" },
  { href: "/search",    icon: Search,          label: "Search" },
  { href: "/insights",  icon: Lightbulb,       label: "Insights" },
] as const

const BOTTOM_NAV = [
  { href: "/settings", icon: Settings, label: "Settings" },
] as const

function initials(name?: string | null): string {
  if (!name) return "?"
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("")
}

interface NavItemProps {
  href: string
  icon: React.ElementType
  label: string
  active: boolean
  collapsed: boolean
}

function NavItem({ href, icon: Icon, label, active, collapsed }: NavItemProps) {
  const item = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-emerald-500" />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return item
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("flora-sidebar-collapsed") === "true")
    } catch {}
  }, [])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem("flora-sidebar-collapsed", String(next))
    } catch {}
  }

  async function handleLogout() {
    await authApi.logout().catch(() => {})
    setUser(null)
    router.push("/login")
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "relative flex h-full flex-col border-r border-sidebar bg-sidebar transition-[width] duration-300 ease-in-out",
          collapsed ? "w-[64px]" : "w-[280px]",
        )}
      >
        {/* ── Header ── */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-sidebar px-4",
            collapsed && "justify-center px-2",
          )}
        >
          {collapsed ? (
            <FloraLogo iconOnly size="sm" />
          ) : (
            <FloraLogo size="sm" />
          )}
        </div>

        {/* ── Nav ── */}
        <ScrollArea className="flex-1 py-3">
          <nav className={cn("space-y-0.5", collapsed ? "px-1.5" : "px-2.5")}>
            {NAV_ITEMS.map(({ href, icon, label }) => (
              <NavItem
                key={href}
                href={href}
                icon={icon}
                label={label}
                active={isActive(href)}
                collapsed={collapsed}
              />
            ))}
          </nav>
        </ScrollArea>

        {/* ── Bottom ── */}
        <div className={cn("shrink-0 space-y-0.5 border-t border-sidebar py-3", collapsed ? "px-1.5" : "px-2.5")}>
          {BOTTOM_NAV.map(({ href, icon, label }) => (
            <NavItem
              key={href}
              href={href}
              icon={icon}
              label={label}
              active={isActive(href)}
              collapsed={collapsed}
            />
          ))}

          {/* Theme toggle */}
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <ThemeToggle />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Toggle theme</TooltipContent>
            </Tooltip>
          ) : (
            <div className="px-3 py-1">
              <ThemeToggle />
            </div>
          )}
        </div>

        {/* ── User profile ── */}
        <div className={cn("shrink-0 border-t border-sidebar p-3", collapsed && "p-2")}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-accent"
                  title="Sign out"
                >
                  <Avatar className="h-7 w-7 text-xs">
                    <AvatarFallback className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                      {initials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{user?.name ?? "Account"} · Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <Avatar className="h-7 w-7 shrink-0 text-xs">
                <AvatarFallback className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-none">{user?.name ?? "User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
              </div>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Sign out</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* ── Collapse toggle ── */}
        <button
          onClick={toggleCollapse}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </aside>
    </TooltipProvider>
  )
}
