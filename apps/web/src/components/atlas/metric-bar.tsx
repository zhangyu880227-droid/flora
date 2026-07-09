"use client"

import { RefreshCw } from "lucide-react"

interface Metric {
  label: string
  value: string | number
  color?: string
  sub?: string
}

interface MetricBarProps {
  metrics: Metric[]
  title?: string
  onRefresh?: () => void
  refreshing?: boolean
  lastUpdated?: string
  live?: boolean
}

export function MetricBar({ metrics, title, onRefresh, refreshing, lastUpdated, live }: MetricBarProps) {
  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0 border-b px-0"
      style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface)" }}
    >
      {title && (
        <>
          <div className="flex h-full items-center border-r px-4" style={{ borderColor: "var(--atlas-border)" }}>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--atlas-text-2)" }}>
              {title}
            </span>
          </div>
        </>
      )}

      <div className="flex flex-1 items-center overflow-x-auto">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="flex h-full shrink-0 items-center gap-2 border-r px-4"
            style={{ borderColor: "var(--atlas-border)" }}
          >
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--atlas-text-3)" }}>
              {m.label}
            </span>
            <span
              className="font-mono text-[12px] font-bold tabular-nums"
              style={{ color: m.color ?? "var(--atlas-text)" }}
            >
              {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
            </span>
            {m.sub && (
              <span className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
                {m.sub}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex h-full shrink-0 items-center gap-3 border-l px-3" style={{ borderColor: "var(--atlas-border)" }}>
        {/* live pulse — flashes on each auto-poll */}
        <div
          className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
          style={{ background: live ? "var(--atlas-green)" : "var(--atlas-text-3)" }}
          title="Auto-refresh active"
        />
        {lastUpdated && (
          <span className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
            {lastUpdated}
          </span>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded p-1 transition-colors hover:bg-white/5 disabled:opacity-40"
            title="Trigger knowledge loop"
          >
            <RefreshCw
              className="h-3 w-3"
              style={{ color: "var(--atlas-text-2)", animationDuration: "1s" }}
              data-spinning={refreshing ? "" : undefined}
            />
          </button>
        )}
      </div>
    </div>
  )
}
