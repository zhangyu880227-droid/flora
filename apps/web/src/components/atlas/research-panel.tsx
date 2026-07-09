"use client"

import { useState } from "react"
import { Network, FileText, TrendingUp } from "lucide-react"
import { cn } from "@flora/ui"
import type { KGEdge, KGNode, KnowledgeDocument } from "@flora/types"
import { FeedCard } from "./feed-card"

const TYPE_COLOR: Record<string, string> = {
  tech:    "#58a6ff",
  org:     "#ffa657",
  person:  "#3fb950",
  concept: "#bc8cff",
  place:   "#f85149",
  event:   "#d29922",
  default: "#8b949e",
}
function entityColor(t: string) { return TYPE_COLOR[t] ?? TYPE_COLOR.default }


type Tab = "feed" | "entity" | "gaps"

interface ResearchPanelProps {
  docs:         KnowledgeDocument[]
  nodes:        KGNode[]
  edges:        KGEdge[]
  selectedNode: KGNode | null
  gapTasks:     Array<{ entity: string; gapType: string; description: string; suggestedQuery: string }>
}

export function ResearchPanel({ docs, nodes, edges, selectedNode, gapTasks }: ResearchPanelProps) {
  const [tab, setTab] = useState<Tab>(selectedNode ? "entity" : "feed")

  // switch to entity tab when selection changes
  if (selectedNode && tab === "feed") setTab("entity")
  if (!selectedNode && tab === "entity") setTab("feed")

  return (
    <div
      className="flex h-full w-[320px] shrink-0 flex-col border-l"
      style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface)" }}
    >
      {/* tab bar */}
      <div className="flex shrink-0 border-b" style={{ borderColor: "var(--atlas-border)" }}>
        <TabBtn active={tab === "feed"}   label="Feed"   icon={FileText}   onClick={() => setTab("feed")} />
        <TabBtn active={tab === "entity"} label="Entity" icon={Network}    onClick={() => setTab("entity")} disabled={!selectedNode} />
        <TabBtn active={tab === "gaps"}   label={`Gaps${gapTasks.length ? ` (${gapTasks.length})` : ""}`} icon={TrendingUp} onClick={() => setTab("gaps")} />
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "feed" && <FeedTab docs={docs} />}
        {tab === "entity" && <EntityTab node={selectedNode} edges={edges} nodes={nodes} />}
        {tab === "gaps" && <GapsTab gaps={gapTasks} />}
      </div>
    </div>
  )
}

// ── Feed tab ──────────────────────────────────────────────────────────────────
function FeedTab({ docs }: { docs: KnowledgeDocument[] }) {
  if (!docs.length) {
    return <Empty msg="No documents collected yet" />
  }
  return (
    <div>
      {docs.slice(0, 40).map(d => (
        <FeedCard key={d.id} doc={d} />
      ))}
    </div>
  )
}

// ── Entity detail tab ─────────────────────────────────────────────────────────
function EntityTab({ node, edges, nodes }: { node: KGNode | null; edges: KGEdge[]; nodes: KGNode[] }) {
  if (!node) return <Empty msg="Click a node in the graph to inspect it" />

  const color = entityColor(node.entityType)
  const nodeById = new Map(nodes.map(n => [n.id, n]))

  const outgoing = edges.filter(e => e.sourceId === node.id)
  const incoming = edges.filter(e => e.targetId === node.id)

  return (
    <div className="p-4 animate-atlas-slide-in">
      {/* entity header */}
      <div className="mb-4 flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <div className="h-3 w-3 rounded-full" style={{ background: color }} />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold capitalize" style={{ color: "var(--atlas-text)" }}>
            {node.label}
          </h3>
          <p className="font-mono text-[10px]" style={{ color: "var(--atlas-text-3)" }}>
            {node.entityType} · {node.docCount} doc{node.docCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* stats row */}
      <div
        className="mb-4 grid grid-cols-3 gap-px rounded-lg overflow-hidden border"
        style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-border)" }}
      >
        {[
          { label: "DOCS",       value: node.docCount },
          { label: "RELATIONS",  value: outgoing.length + incoming.length },
          { label: "RELEVANCE",  value: node.avgRelevance?.toFixed(2) ?? "—" },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 py-2.5" style={{ background: "var(--atlas-surface-2)" }}>
            <span className="font-mono text-[12px] font-bold" style={{ color }}>{s.value}</span>
            <span className="font-mono text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--atlas-text-3)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* relationships */}
      {outgoing.length > 0 && (
        <section className="mb-4">
          <SectionHead>Outgoing Relationships</SectionHead>
          <div className="space-y-1">
            {outgoing.slice(0, 8).map(e => {
              const tgt = nodeById.get(e.targetId)
              return (
                <RelRow
                  key={e.id}
                  label={e.relation}
                  target={tgt?.label ?? e.targetId.slice(0, 8)}
                  targetType={tgt?.entityType ?? ""}
                  weight={e.weight}
                />
              )
            })}
          </div>
        </section>
      )}

      {incoming.length > 0 && (
        <section className="mb-4">
          <SectionHead>Incoming Relationships</SectionHead>
          <div className="space-y-1">
            {incoming.slice(0, 8).map(e => {
              const src = nodeById.get(e.sourceId)
              return (
                <RelRow
                  key={e.id}
                  label={e.relation}
                  target={src?.label ?? e.sourceId.slice(0, 8)}
                  targetType={src?.entityType ?? ""}
                  weight={e.weight}
                  incoming
                />
              )
            })}
          </div>
        </section>
      )}

      {/* dates */}
      <section>
        <SectionHead>Timeline</SectionHead>
        <div className="space-y-1.5 font-mono text-[10px]" style={{ color: "var(--atlas-text-2)" }}>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--atlas-text-3)" }}>First seen</span>
            <span>{node.firstSeen ? new Date(node.firstSeen).toLocaleDateString() : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--atlas-text-3)" }}>Last seen</span>
            <span>{node.lastSeen ? new Date(node.lastSeen).toLocaleDateString() : "—"}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────
function GapsTab({ gaps }: { gaps: Array<{ entity: string; gapType: string; description: string; suggestedQuery: string }> }) {
  if (!gaps.length) {
    return <Empty msg="No knowledge gaps detected" sub="Run the self-improvement loop to analyse coverage" />
  }

  const GAP_COLOR: Record<string, string> = {
    orphan_reference:    "#f85149",
    stale_coverage:      "#d29922",
    low_confidence_hub:  "#bc8cff",
  }

  return (
    <div className="p-3 space-y-2">
      {gaps.map((g, i) => {
        const color = GAP_COLOR[g.gapType] ?? "#8b949e"
        const label = g.gapType.replace(/_/g, " ").toUpperCase()
        return (
          <div
            key={i}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)" }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
              >
                {label}
              </span>
              <span className="font-mono text-[10px] font-semibold capitalize" style={{ color: "var(--atlas-text)" }}>
                {g.entity}
              </span>
            </div>
            <p className="text-[10.5px] leading-relaxed mb-2" style={{ color: "var(--atlas-text-2)" }}>
              {g.description}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>Suggested:</span>
              <span className="font-mono text-[9px] italic" style={{ color: "var(--atlas-cyan)" }}>
                {g.suggestedQuery}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
function TabBtn({ active, label, icon: Icon, onClick, disabled }: {
  active: boolean; label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-[10.5px] font-medium transition-colors disabled:opacity-30",
        active ? "border-[#58a6ff]" : "border-transparent hover:border-[#21262d]",
      )}
      style={{ color: active ? "var(--atlas-cyan)" : "var(--atlas-text-2)" }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--atlas-text-3)" }}>
      {children}
    </p>
  )
}

function RelRow({ label, target, targetType, weight, incoming }: {
  label: string; target: string; targetType: string; weight: number; incoming?: boolean
}) {
  const color = TYPE_COLOR[targetType] ?? TYPE_COLOR.default
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="font-mono" style={{ color: "var(--atlas-text-3)" }}>
        {incoming ? "←" : "→"}
      </span>
      <span className="font-mono italic" style={{ color: "var(--atlas-text-2)" }}>{label}</span>
      <span className="mx-0.5" style={{ color: "var(--atlas-text-3)" }}>·</span>
      <span
        className="rounded px-1 py-0.5 font-mono text-[9px]"
        style={{ background: `${color}15`, color }}
      >
        {target}
      </span>
      {weight > 1 && (
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
          ×{weight}
        </span>
      )}
    </div>
  )
}

function Empty({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[11px]" style={{ color: "var(--atlas-text-3)" }}>{msg}</p>
      {sub && <p className="text-[10px]" style={{ color: "var(--atlas-text-3)", opacity: 0.6 }}>{sub}</p>}
    </div>
  )
}
