"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Network, FileText, TrendingUp, MessageSquare, Zap, Rss, Plus, Trash2, ExternalLink } from "lucide-react"
import { cn } from "@flora/ui"
import type { KGEdge, KGNode, KnowledgeDocument, KnowledgeFeed, KnowledgeFeedType } from "@flora/types"
import { knowledgeApi } from "@/lib/api"
import { FeedCard } from "./feed-card"

const TYPE_COLOR: Record<string, string> = {
  tech:    "#58a6ff",
  org:     "#ffa657",
  person:  "#3fb950",
  concept: "#bc8cff",
  place:   "#f85149",
  country: "#58d9a8",
  event:   "#d29922",
  product: "#e5a0ff",
  default: "#8b949e",
}
function entityColor(t: string) { return TYPE_COLOR[t] ?? TYPE_COLOR.default }

type Tab = "feed" | "ask" | "briefing" | "entity" | "gaps" | "feeds"

interface ResearchPanelProps {
  docs:          KnowledgeDocument[]
  nodes:         KGNode[]
  edges:         KGEdge[]
  selectedNode:  KGNode | null
  gapTasks:      Array<{ entity: string; gapType: string; description: string; suggestedQuery: string }>
  workspaceId?:  string
  onSelectNode?: (id: string) => void
}

export function ResearchPanel({
  docs, nodes, edges, selectedNode, gapTasks, workspaceId, onSelectNode,
}: ResearchPanelProps) {
  const [tab, setTab] = useState<Tab>("feed")
  const [pendingAsk, setPendingAsk] = useState<string | null>(null)

  // auto-switch to entity tab when a node is selected
  useEffect(() => {
    if (selectedNode) setTab("entity")
  }, [selectedNode?.id])

  const askAbout = useCallback((q: string) => {
    setPendingAsk(q)
    setTab("ask")
  }, [])

  return (
    <div
      className="flex h-full w-[340px] shrink-0 flex-col border-l"
      style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface)" }}
    >
      {/* tab bar — two rows for 6 tabs */}
      <div className="flex shrink-0 flex-wrap border-b" style={{ borderColor: "var(--atlas-border)" }}>
        <TabBtn active={tab === "feed"}     label="Feed"     icon={FileText}       onClick={() => setTab("feed")} />
        <TabBtn active={tab === "ask"}      label="Ask"      icon={MessageSquare}  onClick={() => setTab("ask")} />
        <TabBtn active={tab === "briefing"} label="Intel"    icon={Zap}            onClick={() => setTab("briefing")} />
        <TabBtn active={tab === "entity"}   label="Entity"   icon={Network}        onClick={() => setTab("entity")} disabled={!selectedNode} />
        <TabBtn active={tab === "gaps"}     label={`Gaps${gapTasks.length ? ` (${gapTasks.length})` : ""}`} icon={TrendingUp} onClick={() => setTab("gaps")} />
        <TabBtn active={tab === "feeds"}    label="Sources"  icon={Rss}            onClick={() => setTab("feeds")} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "feed"     && <FeedTab docs={docs} />}
        {tab === "ask"      && <AskTab workspaceId={workspaceId} onSelectNode={onSelectNode} initialQuestion={pendingAsk} onInitialConsumed={() => setPendingAsk(null)} />}
        {tab === "briefing" && <BriefingTab workspaceId={workspaceId} />}
        {tab === "entity"   && <EntityTab node={selectedNode} edges={edges} nodes={nodes} docs={docs} onAsk={askAbout} />}
        {tab === "gaps"     && <GapsTab gaps={gapTasks} />}
        {tab === "feeds"    && <FeedsTab workspaceId={workspaceId} />}
      </div>
    </div>
  )
}

// ── Feed tab ──────────────────────────────────────────────────────────────────
function FeedTab({ docs }: { docs: KnowledgeDocument[] }) {
  if (!docs.length) return <Empty msg="No documents collected yet" />
  return (
    <div>
      {docs.slice(0, 40).map(d => <FeedCard key={d.id} doc={d} />)}
    </div>
  )
}

// ── Ask Flora tab ─────────────────────────────────────────────────────────────
interface AskMessage {
  role: "user" | "assistant"
  content: string
  sources?: Array<{ id: string; title: string; url: string | null; source_type: string; confidence_score: number }>
}

function AskTab({ workspaceId, onSelectNode, initialQuestion, onInitialConsumed }: {
  workspaceId?: string
  onSelectNode?: (id: string) => void
  initialQuestion?: string | null
  onInitialConsumed?: () => void
}) {
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-submit when a pending question arrives from another tab
  useEffect(() => {
    if (!initialQuestion || !workspaceId) return
    setInput(initialQuestion)
    onInitialConsumed?.()
    // Submit after state update
    const q = initialQuestion.trim()
    if (!q) return
    setMessages(m => [...m, { role: "user", content: q }])
    setLoading(true)
    knowledgeApi.ask(workspaceId, q).then(res => {
      setMessages(m => [...m, { role: "assistant", content: res.answer, sources: res.sources }])
    }).catch(() => {
      setMessages(m => [...m, { role: "assistant", content: "Failed to get an answer." }])
    }).finally(() => { setLoading(false); setInput("") })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  async function submit() {
    const q = input.trim()
    if (!q || !workspaceId || loading) return
    setInput("")
    setMessages(m => [...m, { role: "user", content: q }])
    setLoading(true)
    try {
      const res = await knowledgeApi.ask(workspaceId, q)
      setMessages(m => [...m, { role: "assistant", content: res.answer, sources: res.sources }])
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Failed to get an answer. Is the API running?" }])
    } finally {
      setLoading(false)
    }
  }

  const SOURCE_COLOR: Record<string, string> = {
    rss: "#58a6ff", arxiv: "#f85149", google_news: "#ffa657",
    github_trending: "#3fb950", sec_edgar: "#58d9a8", default: "#8b949e",
  }

  return (
    <div className="flex h-full flex-col">
      {/* messages */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="mt-8 text-center px-4 space-y-3">
            <div className="text-[11px] font-semibold" style={{ color: "var(--atlas-text-2)" }}>
              Ask Flora anything about the knowledge base
            </div>
            <div className="space-y-1.5">
              {[
                "What are the key AI trends this week?",
                "Which companies are acquiring others?",
                "What's happening in semiconductors?",
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full rounded border px-2.5 py-1.5 text-left text-[10px] transition-colors hover:bg-white/5"
                  style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text-2)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("text-[11px]", msg.role === "user" ? "text-right" : "text-left")}>
            {msg.role === "user" ? (
              <span
                className="inline-block rounded-lg px-3 py-1.5 text-[10.5px]"
                style={{ background: "var(--atlas-cyan)", color: "#07090f", maxWidth: "80%" }}
              >
                {msg.content}
              </span>
            ) : (
              <div>
                <div
                  className="rounded-lg border px-3 py-2.5 text-[10.5px] leading-relaxed whitespace-pre-wrap"
                  style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)", color: "var(--atlas-text)" }}
                >
                  {msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {msg.sources.slice(0, 4).map((src, j) => {
                      const color = SOURCE_COLOR[src.source_type] ?? SOURCE_COLOR.default
                      return (
                        <div
                          key={j}
                          className="flex items-center gap-1.5 rounded px-2 py-1 text-[9.5px]"
                          style={{ background: "var(--atlas-surface-3)" }}
                        >
                          <span className="font-mono font-bold" style={{ color }}>
                            [{j + 1}]
                          </span>
                          {src.url ? (
                            <a href={src.url} target="_blank" rel="noopener noreferrer"
                              className="flex-1 truncate hover:underline" style={{ color: "var(--atlas-text-2)" }}>
                              {src.title}
                            </a>
                          ) : (
                            <span className="flex-1 truncate" style={{ color: "var(--atlas-text-2)" }}>{src.title}</span>
                          )}
                          <span className="font-mono shrink-0" style={{ color: "var(--atlas-text-3)" }}>
                            {src.confidence_score.toFixed(2)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--atlas-text-3)" }}>
            <span className="animate-pulse">●</span>
            <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
            <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="shrink-0 border-t p-2" style={{ borderColor: "var(--atlas-border)" }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder="Ask about entities, events, trends…"
            className="min-w-0 flex-1 rounded border bg-transparent px-2.5 py-1.5 text-[10.5px] outline-none focus:border-[#58a6ff]"
            style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text)" }}
          />
          <button
            onClick={submit}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded px-2.5 py-1.5 text-[10px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--atlas-cyan)", color: "#07090f" }}
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Intelligence Briefing tab ─────────────────────────────────────────────────
function BriefingTab({ workspaceId }: { workspaceId?: string }) {
  const [briefing, setBriefing] = useState<{
    briefing: string; generatedAt: string; docCount: number; nodeCount: number; recentDocCount: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const data = await knowledgeApi.briefing(workspaceId)
      setBriefing(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate briefing")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [workspaceId])

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <Empty msg={error} />
  if (!briefing) return <Empty msg="No briefing available" />

  const lines = briefing.briefing.split("\n").filter(Boolean)

  return (
    <div className="p-4 space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold" style={{ color: "var(--atlas-text)" }}>
            Daily Intelligence Briefing
          </div>
          <div className="mt-0.5 font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
            {briefing.generatedAt ? new Date(briefing.generatedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          </div>
        </div>
        <button
          onClick={load}
          className="rounded px-2 py-1 font-mono text-[9px] transition-colors hover:bg-white/5"
          style={{ color: "var(--atlas-cyan)", border: `1px solid var(--atlas-border)` }}
        >
          Refresh
        </button>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "TOTAL DOCS",   value: briefing.docCount },
          { label: "NEW (24H)",    value: briefing.recentDocCount },
          { label: "ENTITIES",     value: briefing.nodeCount },
        ].map(s => (
          <div
            key={s.label}
            className="rounded border p-2 text-center"
            style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)" }}
          >
            <div className="font-mono text-[14px] font-bold" style={{ color: "var(--atlas-cyan)" }}>{s.value}</div>
            <div className="font-mono text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--atlas-text-3)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* briefing bullets */}
      <div className="space-y-2">
        {lines.map((line, i) => {
          const clean = line.replace(/^[-•*]\s*/, "")
          return (
            <div key={i} className="flex gap-2 text-[10.5px] leading-relaxed" style={{ color: "var(--atlas-text)" }}>
              <span className="mt-0.5 shrink-0 font-mono" style={{ color: "var(--atlas-cyan)" }}>›</span>
              <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--atlas-text)">$1</strong>') }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Entity detail tab ─────────────────────────────────────────────────────────
function EntityTab({
  node, edges, nodes, docs, onAsk,
}: {
  node: KGNode | null
  edges: KGEdge[]
  nodes: KGNode[]
  docs: KnowledgeDocument[]
  onAsk?: (q: string) => void
}) {
  if (!node) return <Empty msg="Click a node in the graph to inspect it" />

  const color = entityColor(node.entityType)
  const nodeById = new Map(nodes.map(n => [n.id, n]))

  const outgoing = edges.filter(e => e.sourceId === node.id)
  const incoming = edges.filter(e => e.targetId === node.id)

  // Docs that mention this entity (case-insensitive label match)
  const labelLower = node.label.toLowerCase()
  const linkedDocs = docs.filter(d =>
    (d.entities as Array<{ name?: string }>).some(e => (e.name ?? "").toLowerCase() === labelLower)
  ).slice(0, 8)

  return (
    <div className="p-4 animate-atlas-slide-in space-y-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <div className="h-3 w-3 rounded-full" style={{ background: color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold capitalize" style={{ color: "var(--atlas-text)" }}>
            {node.label}
          </h3>
          <p className="font-mono text-[10px]" style={{ color: "var(--atlas-text-3)" }}>
            {node.entityType} · {node.docCount} doc{node.docCount !== 1 ? "s" : ""}
          </p>
        </div>
        {onAsk && (
          <button
            onClick={() => onAsk(`Tell me about ${node.label} based on recent news`)}
            className="shrink-0 flex items-center gap-1 rounded border px-2 py-1 font-mono text-[9px] transition-colors hover:bg-white/5"
            style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-cyan)" }}
            title="Ask Flora about this entity"
          >
            <MessageSquare className="h-2.5 w-2.5" /> Ask
          </button>
        )}
      </div>

      {/* stats */}
      <div
        className="grid grid-cols-3 gap-px rounded-lg overflow-hidden border"
        style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-border)" }}
      >
        {[
          { label: "DOCS",      value: node.docCount },
          { label: "RELATIONS", value: outgoing.length + incoming.length },
          { label: "RELEVANCE", value: node.avgRelevance?.toFixed(2) ?? "—" },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 py-2.5" style={{ background: "var(--atlas-surface-2)" }}>
            <span className="font-mono text-[12px] font-bold" style={{ color }}>{s.value}</span>
            <span className="font-mono text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--atlas-text-3)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* relationships */}
      {outgoing.length > 0 && (
        <section>
          <SectionHead>Outgoing</SectionHead>
          <div className="space-y-1">
            {outgoing.slice(0, 6).map(e => {
              const tgt = nodeById.get(e.targetId)
              return <RelRow key={e.id} label={e.relation} target={tgt?.label ?? "?"} targetType={tgt?.entityType ?? ""} weight={e.weight} />
            })}
          </div>
        </section>
      )}

      {incoming.length > 0 && (
        <section>
          <SectionHead>Incoming</SectionHead>
          <div className="space-y-1">
            {incoming.slice(0, 6).map(e => {
              const src = nodeById.get(e.sourceId)
              return <RelRow key={e.id} label={e.relation} target={src?.label ?? "?"} targetType={src?.entityType ?? ""} weight={e.weight} incoming />
            })}
          </div>
        </section>
      )}

      {/* linked documents */}
      {linkedDocs.length > 0 && (
        <section>
          <SectionHead>Source Documents ({linkedDocs.length})</SectionHead>
          <div className="space-y-1.5">
            {linkedDocs.map(doc => (
              <a
                key={doc.id}
                href={doc.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded border p-2 text-[10px] transition-colors hover:bg-white/5 group"
                style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)", color: "var(--atlas-text)" }}
              >
                <span className="mt-0.5 shrink-0 font-mono" style={{ color }}>›</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium group-hover:underline">{doc.title}</span>
                  {doc.summary && (
                    <span className="mt-0.5 block line-clamp-2 leading-relaxed" style={{ color: "var(--atlas-text-3)" }}>
                      {doc.summary.slice(0, 120)}
                    </span>
                  )}
                </span>
                {doc.url && <ExternalLink className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-60" />}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* timeline */}
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
  if (!gaps.length) return <Empty msg="No knowledge gaps detected" sub="Run the self-improvement loop to analyse coverage" />

  const GAP_COLOR: Record<string, string> = {
    orphan_reference:   "#f85149",
    stale_coverage:     "#d29922",
    low_confidence_hub: "#bc8cff",
  }

  return (
    <div className="p-3 space-y-2">
      {gaps.map((g, i) => {
        const color = GAP_COLOR[g.gapType] ?? "#8b949e"
        return (
          <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                {g.gapType.replace(/_/g, " ").toUpperCase()}
              </span>
              <span className="font-mono text-[10px] font-semibold capitalize" style={{ color: "var(--atlas-text)" }}>{g.entity}</span>
            </div>
            <p className="text-[10.5px] leading-relaxed mb-2" style={{ color: "var(--atlas-text-2)" }}>{g.description}</p>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>Suggested:</span>
              <span className="font-mono text-[9px] italic" style={{ color: "var(--atlas-cyan)" }}>{g.suggestedQuery}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Feeds / Sources tab (S8 Feed Manager) ─────────────────────────────────────
const SOURCE_COLOR: Record<string, string> = {
  rss: "#58a6ff", arxiv: "#f85149", google_news: "#ffa657",
  github_trending: "#3fb950", sec_edgar: "#58d9a8", youtube: "#f85149",
  url: "#bc8cff", pdf: "#d29922", default: "#8b949e",
}
const FEED_TYPES = ["rss", "google_news", "arxiv", "github_trending", "sec_edgar", "url"] as const

function FeedsTab({ workspaceId }: { workspaceId?: string }) {
  const [feeds, setFeeds] = useState<KnowledgeFeed[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<KnowledgeFeedType>("rss")
  const [newUrl, setNewUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadFeeds() {
    if (!workspaceId) return
    setLoading(true)
    try { setFeeds(await knowledgeApi.feeds(workspaceId)) } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { loadFeeds() }, [workspaceId])

  async function addFeed() {
    if (!workspaceId || !newName.trim()) return
    setSaving(true)
    try {
      const config: Record<string, string> = {}
      if (newUrl.trim()) config.url = newUrl.trim()
      await knowledgeApi.addFeed(workspaceId, { name: newName.trim(), type: newType, config })
      setNewName(""); setNewUrl(""); setShowAdd(false)
      await loadFeeds()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function deleteFeed(id: string) {
    if (!workspaceId) return
    setDeletingId(id)
    try { await knowledgeApi.deleteFeed(workspaceId, id); await loadFeeds() } catch { /* ignore */ } finally { setDeletingId(null) }
  }

  if (loading) return <LoadingSkeleton rows={8} />

  return (
    <div className="p-2 space-y-1.5">
      {/* header */}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--atlas-text-3)" }}>
          {feeds.filter(f => f.isActive).length} active · {feeds.length} total
        </span>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] transition-colors hover:bg-white/5"
          style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-cyan)" }}
        >
          <Plus className="h-2.5 w-2.5" /> Add
        </button>
      </div>

      {/* add feed form */}
      {showAdd && (
        <div
          className="rounded-lg border p-3 space-y-2"
          style={{ borderColor: "var(--atlas-border)", background: "var(--atlas-surface-2)" }}
        >
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--atlas-text-3)" }}>New Feed</p>
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as KnowledgeFeedType)}
            className="w-full rounded border bg-transparent px-2 py-1 font-mono text-[10px] outline-none"
            style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text)" }}
          >
            {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Feed name"
            className="w-full rounded border bg-transparent px-2 py-1 text-[10px] outline-none focus:border-[#58a6ff]"
            style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text)" }}
          />
          <input
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="URL (optional)"
            className="w-full rounded border bg-transparent px-2 py-1 font-mono text-[9.5px] outline-none focus:border-[#58a6ff]"
            style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={addFeed}
              disabled={saving || !newName.trim()}
              className="flex-1 rounded px-2 py-1 font-mono text-[9px] font-bold transition-opacity disabled:opacity-40"
              style={{ background: "var(--atlas-cyan)", color: "#07090f" }}
            >
              {saving ? "Adding…" : "Add Feed"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded border px-2 py-1 font-mono text-[9px] hover:bg-white/5"
              style={{ borderColor: "var(--atlas-border)", color: "var(--atlas-text-3)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* feed list */}
      {feeds.map(feed => {
        const color = SOURCE_COLOR[feed.type] ?? SOURCE_COLOR.default
        const lastRun = feed.lastCollectedAt
          ? new Date(feed.lastCollectedAt).toLocaleDateString("en", { month: "short", day: "numeric" })
          : "never"

        return (
          <div
            key={feed.id}
            className="group flex items-center gap-2 rounded border px-2.5 py-2 text-[10px]"
            style={{
              borderColor: feed.isActive ? `${color}30` : "var(--atlas-border)",
              background: feed.isActive ? `${color}08` : "transparent",
              opacity: feed.isActive ? 1 : 0.5,
            }}
          >
            <span
              className="shrink-0 rounded px-1 py-0.5 font-mono text-[7.5px] font-bold"
              style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
            >
              {feed.type.toUpperCase().replace("_", " ")}
            </span>
            <span className="flex-1 truncate font-medium" style={{ color: "var(--atlas-text)" }}>{feed.name}</span>
            <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>{lastRun}</span>
            <div
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: feed.isActive ? "#3fb950" : "#8b949e" }}
              title={feed.isActive ? "Active" : "Paused"}
            />
            <button
              onClick={() => deleteFeed(feed.id)}
              disabled={deletingId === feed.id}
              className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity disabled:opacity-30"
              style={{ color: "#f85149" }}
              title="Delete feed"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      {feeds.length === 0 && !showAdd && <Empty msg="No feeds configured" sub="Click Add to create your first feed" />}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
function TabBtn({ active, label, icon: Icon, onClick, disabled }: {
  active: boolean; label: string; icon: React.ElementType; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 basis-[33%] items-center justify-center gap-1 border-b-2 py-1.5 text-[9.5px] font-medium transition-colors disabled:opacity-30",
        active ? "border-[#58a6ff]" : "border-transparent hover:border-[#21262d]",
      )}
      style={{ color: active ? "var(--atlas-cyan)" : "var(--atlas-text-2)" }}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
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
      <span className="font-mono" style={{ color: "var(--atlas-text-3)" }}>{incoming ? "←" : "→"}</span>
      <span className="font-mono italic" style={{ color: "var(--atlas-text-2)" }}>{label.replace(/_/g, " ")}</span>
      <span className="mx-0.5" style={{ color: "var(--atlas-text-3)" }}>·</span>
      <span className="rounded px-1 py-0.5 font-mono text-[9px]" style={{ background: `${color}15`, color }}>
        {target}
      </span>
      {weight > 1 && (
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>×{weight}</span>
      )}
    </div>
  )
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded animate-pulse" style={{ background: "var(--atlas-surface-2)", opacity: 1 - i * 0.1 }} />
      ))}
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
