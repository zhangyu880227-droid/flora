"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BookMarked,
  Brain,
  Building2,
  ChevronRight,
  FileText,
  Globe,
  Layers,
  LayoutGrid,
  Link2,
  ListChecks,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { cn } from "@flora/ui"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
  badgeColor?: string
}

interface NavSection {
  group: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    group: "Markets",
    items: [
      { label: "Market Overview", href: "/atlas", icon: Activity, badge: "LIVE", badgeColor: "text-[#3fb950]" },
      { label: "Trending",        href: "/atlas/trending", icon: TrendingUp },
      { label: "Watchlist",       href: "/atlas/watchlist", icon: Star },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { label: "Knowledge Graph", href: "/atlas/graph",      icon: Brain },
      { label: "Companies",       href: "/atlas/companies",  icon: Building2 },
      { label: "Industries",      href: "/atlas/industries", icon: Layers },
      { label: "Supply Chain",    href: "/atlas/supply-chain", icon: Link2 },
      { label: "Policies",        href: "/atlas/policies",   icon: Globe },
    ],
  },
  {
    group: "Research",
    items: [
      { label: "Feed",       href: "/atlas/feed",      icon: FileText },
      { label: "Projects",   href: "/atlas/projects",  icon: LayoutGrid },
      { label: "Portfolio",  href: "/atlas/portfolio", icon: Wallet },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Atlas Engine", href: "/atlas/engine", icon: BookMarked },
      { label: "Tasks",        href: "/atlas/tasks",  icon: ListChecks },
    ],
  },
]

interface AtlasNavProps {
  graphStats?: { nodeCount: number; edgeCount: number }
  feedStats?: { totalDocs: number; activeFeeds: number }
}

export function AtlasNav({ graphStats, feedStats }: AtlasNavProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/atlas") return pathname === "/atlas"
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="flex h-full w-[220px] shrink-0 flex-col border-r"
      style={{ background: "var(--atlas-surface)", borderColor: "var(--atlas-border)" }}
    >
      {/* Logo */}
      <div
        className="flex h-11 shrink-0 items-center gap-2 border-b px-4"
        style={{ borderColor: "var(--atlas-border)" }}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded" style={{ background: "#58a6ff22" }}>
          <Brain className="h-3 w-3" style={{ color: "var(--atlas-cyan)" }} />
        </div>
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--atlas-text)" }}>
          Atlas
        </span>
        <span
          className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] font-medium"
          style={{ background: "#58a6ff15", color: "var(--atlas-cyan)", border: "1px solid #58a6ff30" }}
        >
          v1
        </span>
      </div>

      {/* Stats strip */}
      {(graphStats || feedStats) && (
        <div
          className="flex shrink-0 items-center justify-between border-b px-3 py-2"
          style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-bg)" }}
        >
          <StatPill label="NODES" value={graphStats?.nodeCount ?? 0} color="var(--atlas-cyan)" />
          <StatPill label="EDGES" value={graphStats?.edgeCount ?? 0} color="var(--atlas-purple)" />
          <StatPill label="DOCS"  value={feedStats?.totalDocs ?? 0}  color="var(--atlas-green)" />
        </div>
      )}

      {/* Navigation sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map((section) => (
          <div key={section.group} className="mb-1">
            <p
              className="px-4 pb-1 pt-3 text-[9px] font-bold uppercase tracking-widest"
              style={{ color: "var(--atlas-text-3)" }}
            >
              {section.group}
            </p>
            {section.items.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-1.5 mx-1.5 rounded-md text-[12.5px] font-medium transition-colors",
                    active ? "text-[#58a6ff]" : "hover:text-[#e6edf3]",
                  )}
                  style={{
                    color: active ? "var(--atlas-cyan)" : "var(--atlas-text-2)",
                    background: active ? "#58a6ff12" : "transparent",
                  }}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className={cn("ml-auto font-mono text-[9px] font-bold", item.badgeColor ?? "text-[#3fb950]")}>
                      {item.badge}
                    </span>
                  )}
                  {active && !item.badge && (
                    <ChevronRight className="ml-auto h-3 w-3 opacity-50" />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Bottom system status */}
      <div
        className="shrink-0 border-t px-3 py-2.5"
        style={{ borderColor: "var(--atlas-border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full animate-atlas-pulse" style={{ background: "var(--atlas-green)" }} />
          <span className="font-mono text-[10px]" style={{ color: "var(--atlas-text-3)" }}>
            {feedStats?.activeFeeds ?? 0} feeds active
          </span>
        </div>
      </div>
    </nav>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-[11px] font-bold" style={{ color }}>
        {value.toLocaleString()}
      </span>
      <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--atlas-text-3)" }}>
        {label}
      </span>
    </div>
  )
}
