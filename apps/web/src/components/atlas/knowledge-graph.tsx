"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KGEdge, KGNode } from "@flora/types"

// ── colour palette ────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  tech:     "#58a6ff",
  org:      "#ffa657",
  person:   "#3fb950",
  concept:  "#bc8cff",
  place:    "#f85149",
  country:  "#58d9a8",
  event:    "#d29922",
  product:  "#e5a0ff",
  industry: "#c9a44a",
  default:  "#8b949e",
}
function nodeColor(t: string) { return TYPE_COLOR[t] ?? TYPE_COLOR.default }

// ── physics types ─────────────────────────────────────────────────────────────
interface Vec { x: number; y: number; vx: number; vy: number }

function layout(nodes: KGNode[], edges: KGEdge[], w: number, h: number): Map<string, { x: number; y: number }> {
  if (!nodes.length) return new Map()
  const pos = new Map<string, Vec>()
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI
    const r = Math.min(w, h) * 0.30
    pos.set(n.id, { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r, vx: 0, vy: 0 })
  })

  const ITERATIONS = 180, K_REPEL = 4500, K_SPRING = 0.06, IDEAL = 110, GRAVITY = 0.012, DAMP = 0.78

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cool = 1 - iter / ITERATIONS
    const arr = nodes.map(n => ({ id: n.id, ...(pos.get(n.id)!) }))
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const ai = arr[i]!, aj = arr[j]!
        const dx = aj.x - ai.x, dy = aj.y - ai.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = K_REPEL / (d * d)
        const fx = (dx / d) * f, fy = (dy / d) * f
        pos.get(aj.id)!.vx += fx; pos.get(aj.id)!.vy += fy
        pos.get(ai.id)!.vx -= fx; pos.get(ai.id)!.vy -= fy
      }
    }
    for (const e of edges) {
      const s = pos.get(e.sourceId), t = pos.get(e.targetId)
      if (!s || !t) continue
      const dx = t.x - s.x, dy = t.y - s.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - IDEAL) * K_SPRING
      const fx = (dx / d) * f, fy = (dy / d) * f
      s.vx += fx; s.vy += fy; t.vx -= fx; t.vy -= fy
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!
      p.vx += (w / 2 - p.x) * GRAVITY
      p.vy += (h / 2 - p.y) * GRAVITY
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!
      p.x = Math.max(18, Math.min(w - 18, p.x + p.vx * cool))
      p.y = Math.max(18, Math.min(h - 18, p.y + p.vy * cool))
      p.vx *= DAMP; p.vy *= DAMP
    }
  }
  return new Map(nodes.map(n => [n.id, { x: pos.get(n.id)!.x, y: pos.get(n.id)!.y }]))
}

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  nodes:       KGNode[]
  edges:       KGEdge[]
  selectedId:  string | null
  onSelect:    (id: string | null) => void
  activeTypes?: Set<string>
  searchQuery?: string
}

export function KnowledgeGraph({ nodes, edges, selectedId, onSelect, activeTypes, searchQuery }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize]       = useState({ w: 800, h: 600 })
  const [positions, setPos]   = useState<Map<string, { x: number; y: number }>>(new Map())
  const [hoverId, setHover]   = useState<string | null>(null)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const [transform, setTrans] = useState({ x: 0, y: 0, k: 1 })
  const dragging  = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const panOrigin = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null)

  // filter visible nodes by active types
  const visibleNodes = activeTypes?.size
    ? nodes.filter(n => activeTypes.has(n.entityType))
    : nodes

  const visibleIds = new Set(visibleNodes.map(n => n.id))
  const visibleEdges = edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId))

  // search highlight
  const searchIds = searchQuery
    ? new Set(visibleNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())).map(n => n.id))
    : new Set<string>()

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const e = entries[0]; if (!e) return
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!visibleNodes.length) return
    const pos = layout(visibleNodes, visibleEdges, size.w, size.h)
    setPos(pos)
  }, [visibleNodes.length, visibleEdges.length, size])

  function nodeR(n: KGNode) { return Math.max(5, Math.min(18, 4 + Math.sqrt(n.docCount) * 2.2)) }

  const highlightIds = new Set<string>()
  const focal = selectedId ?? hoverId
  if (focal) {
    visibleEdges.forEach(e => {
      if (e.sourceId === focal || e.targetId === focal) {
        highlightIds.add(e.sourceId); highlightIds.add(e.targetId)
      }
    })
    highlightIds.add(focal)
  }

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const sp = pt.matrixTransform(ctm.inverse())
    const cur = positions.get(id) ?? { x: 0, y: 0 }
    dragging.current = { id, ox: sp.x - cur.x, oy: sp.y - cur.y }
  }, [positions])

  const onSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    panOrigin.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
  }, [transform])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging.current) {
      const svg = svgRef.current
      if (!svg) return
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const sp = pt.matrixTransform(ctm.inverse())
      // Capture ref values before setPos (ref may be cleared by onMouseUp before callback runs)
      const { id, ox, oy } = dragging.current
      setPos(prev => {
        const next = new Map(prev)
        next.set(id, { x: sp.x - ox, y: sp.y - oy })
        return next
      })
    } else if (panOrigin.current) {
      const dx = e.clientX - panOrigin.current.mx, dy = e.clientY - panOrigin.current.my
      const { tx, ty } = panOrigin.current
      setTrans(t => ({ ...t, x: tx + dx, y: ty + dy }))
    }
  }, [])

  const onMouseUp = useCallback(() => { dragging.current = null; panOrigin.current = null }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.93
    setTrans(t => ({ ...t, k: Math.max(0.3, Math.min(3, t.k * factor)) }))
  }, [])

  const faded = (id: string) =>
    (highlightIds.size > 0 && !highlightIds.has(id)) ||
    (searchIds.size > 0 && !searchIds.has(id))

  return (
    <svg
      ref={svgRef}
      className="h-full w-full cursor-grab select-none active:cursor-grabbing"
      style={{ background: "var(--atlas-bg)" }}
      onMouseDown={onSvgMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#21262d" />
        </pattern>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />

      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {/* edges */}
        {visibleEdges.map(e => {
          const s = positions.get(e.sourceId), t = positions.get(e.targetId)
          if (!s || !t) return null
          const isHighlighted = highlightIds.size > 0 && (highlightIds.has(e.sourceId) || highlightIds.has(e.targetId))
          const isEdgeFaded   = highlightIds.size > 0 && !isHighlighted
          const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2

          return (
            <g key={e.id}>
              <line
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={isHighlighted ? "#58a6ff" : "#21262d"}
                strokeWidth={isHighlighted ? Math.min(3, 0.6 + e.weight * 0.4) : 0.8}
                strokeOpacity={isEdgeFaded ? 0.08 : isHighlighted ? 0.75 : 0.3}
                onMouseEnter={() => setHoverEdge(e.id)}
                onMouseLeave={() => setHoverEdge(null)}
                style={{ cursor: "default" }}
                strokeLinecap="round"
              />
              {/* edge label on hover */}
              {(hoverEdge === e.id || isHighlighted) && e.relation && (
                <text
                  x={mx} y={my}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="7.5" fill="#58a6ff" fontFamily="monospace"
                  style={{ pointerEvents: "none" }}
                >
                  {(e.relation as string).replace(/_/g, " ")}
                </text>
              )}
            </g>
          )
        })}

        {/* nodes */}
        {visibleNodes.map(n => {
          const p = positions.get(n.id)
          if (!p) return null
          const r       = nodeR(n)
          const color   = nodeColor(n.entityType)
          const active  = n.id === selectedId
          const hovered = n.id === hoverId
          const dimmed  = faded(n.id)
          const inSearch = searchIds.size > 0 && searchIds.has(n.id)

          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ cursor: "pointer", opacity: dimmed ? 0.12 : 1 }}
              onMouseDown={ev => onNodeMouseDown(ev, n.id)}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={ev => { ev.stopPropagation(); onSelect(active ? null : n.id) }}
            >
              {(active || hovered || inSearch) && (
                <circle r={r + 7} fill={color} opacity={inSearch ? 0.25 : 0.12} />
              )}
              <circle
                r={r}
                fill={color}
                fillOpacity={active ? 0.95 : 0.72}
                stroke={active ? "#fff" : inSearch ? color : "transparent"}
                strokeWidth={active ? 1.5 : inSearch ? 2 : 0}
                filter={active || hovered || inSearch ? "url(#glow)" : undefined}
              />
              {(visibleNodes.length < 80 || active || hovered) && (
                <text
                  y={r + 11}
                  textAnchor="middle"
                  fontSize={active || hovered ? 10 : 9}
                  fill={active || hovered ? "#e6edf3" : "#8b949e"}
                  style={{ pointerEvents: "none", fontFamily: "monospace" }}
                >
                  {n.label.length > 15 ? n.label.slice(0, 14) + "…" : n.label}
                </text>
              )}
            </g>
          )
        })}
      </g>

      {/* type legend */}
      <g transform="translate(12,12)">
        {Object.entries(TYPE_COLOR)
          .filter(([k]) => k !== "default" && visibleNodes.some(n => n.entityType === k))
          .map(([type, color], i) => (
            <g key={type} transform={`translate(0,${i * 16})`}>
              <circle cx="5" cy="5" r="4" fill={color} fillOpacity={0.75} />
              <text x="13" y="9" fontSize="9" fill="#484f58" fontFamily="monospace">{type}</text>
            </g>
          ))}
      </g>

      {visibleNodes.length > 0 && (
        <text x={size.w - 8} y={size.h - 8} textAnchor="end" fontSize="9" fill="#484f58" fontFamily="monospace">
          scroll to zoom · drag to pan · {visibleNodes.length} nodes
        </text>
      )}

      {!visibleNodes.length && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#484f58" fontFamily="monospace">
          {activeTypes?.size ? "No nodes match filter — try toggling types" : "No knowledge graph data yet — run the collection pipeline"}
        </text>
      )}
    </svg>
  )
}
