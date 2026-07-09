"use client"

import { ExternalLink } from "lucide-react"
import type { KnowledgeDocument, KnowledgeEntity, KnowledgeRelationship } from "@flora/types"

const SOURCE_COLOR: Record<string, string> = {
  arxiv:           "#f85149",
  rss:             "#58a6ff",
  github_trending: "#3fb950",
  google_news:     "#ffa657",
  url:             "#bc8cff",
  pdf:             "#d29922",
  youtube:         "#f85149",
  sec_edgar:       "#58d9a8",
  default:         "#8b949e",
}

const SOURCE_LABEL: Record<string, string> = {
  arxiv:           "ARXIV",
  rss:             "RSS",
  github_trending: "GITHUB",
  google_news:     "NEWS",
  url:             "WEB",
  pdf:             "PDF",
  youtube:         "YOUTUBE",
  sec_edgar:       "SEC",
}

// Entity type → accent color
const ENTITY_COLOR: Record<string, string> = {
  org:      "#ffa657",
  person:   "#3fb950",
  tech:     "#58a6ff",
  product:  "#bc8cff",
  country:  "#58d9a8",
  place:    "#f85149",
  event:    "#d29922",
  industry: "#8b949e",
  concept:  "#c9d1d9",
}

function confidenceColor(score: number): string {
  if (score >= 0.75) return "#3fb950"
  if (score >= 0.5)  return "#d29922"
  return "#f85149"
}

function EntityPill({ entity }: { entity: KnowledgeEntity }) {
  const color = ENTITY_COLOR[entity.type] ?? ENTITY_COLOR.concept
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[8.5px]"
      style={{ background: `${color}14`, color, border: `1px solid ${color}28` }}
      title={`${entity.type} · relevance ${entity.relevance.toFixed(2)}`}
    >
      <span className="h-1 w-1 rounded-full shrink-0" style={{ background: color }} />
      {entity.name.length > 18 ? entity.name.slice(0, 17) + "…" : entity.name}
    </span>
  )
}

function RelationRow({ rel }: { rel: KnowledgeRelationship }) {
  const conf = rel.confidence ?? 0.7
  const color = confidenceColor(conf)
  const verb = rel.relation.replace(/_/g, " ")
  return (
    <li className="flex items-baseline gap-1 text-[9.5px] leading-tight" style={{ color: "var(--atlas-text-2)" }}>
      <span style={{ color: "var(--atlas-cyan)" }}>›</span>
      <span className="font-medium" style={{ color: "var(--atlas-text)" }}>{rel.from}</span>
      <span className="italic opacity-60">{verb}</span>
      <span className="font-medium" style={{ color: "var(--atlas-text)" }}>{rel.to}</span>
      <span className="ml-auto font-mono text-[8px] shrink-0" style={{ color }}>
        {conf.toFixed(2)}
      </span>
    </li>
  )
}

interface FeedCardProps {
  doc: KnowledgeDocument
  compact?: boolean
}

export function FeedCard({ doc, compact }: FeedCardProps) {
  const color = SOURCE_COLOR[doc.sourceType] ?? SOURCE_COLOR.default
  const label = SOURCE_LABEL[doc.sourceType] ?? doc.sourceType.toUpperCase()

  const topEntities = (doc.entities ?? [])
    .slice()
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 6)

  const topRelations = (doc.relationships ?? [])
    .slice()
    .sort((a, b) => (b.confidence ?? 0.7) - (a.confidence ?? 0.7))
    .slice(0, 3)

  const confScore = doc.confidenceScore ?? 0
  const confColor = confidenceColor(confScore)

  return (
    <div
      className="group border-b px-3 py-2.5 transition-colors hover:bg-white/[0.025] cursor-default"
      style={{ borderColor: "var(--atlas-border)" }}
    >
      {/* header */}
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 shrink-0 rounded px-1 py-0.5 font-mono text-[8px] font-bold"
          style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
        >
          {label}
        </span>

        <p
          className="min-w-0 flex-1 text-[11.5px] font-medium leading-tight"
          style={{ color: "var(--atlas-text)" }}
          title={doc.title}
        >
          {doc.title.length > 72 ? doc.title.slice(0, 71) + "…" : doc.title}
        </p>

        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="ml-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <ExternalLink className="h-3 w-3" style={{ color: "var(--atlas-text-3)" }} />
          </a>
        )}
      </div>

      {/* summary */}
      {!compact && doc.summary && (
        <p
          className="mt-1 pl-[42px] text-[10.5px] leading-relaxed"
          style={{ color: "var(--atlas-text-2)" }}
        >
          {doc.summary.length > 160 ? doc.summary.slice(0, 159) + "…" : doc.summary}
        </p>
      )}

      {/* entities */}
      {!compact && topEntities.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-[42px]">
          {topEntities.map((ent, i) => (
            <EntityPill key={`${ent.name}-${i}`} entity={ent} />
          ))}
        </div>
      )}

      {/* relationships */}
      {!compact && topRelations.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-[42px]">
          {topRelations.map((rel, i) => (
            <RelationRow key={i} rel={rel} />
          ))}
        </ul>
      )}

      {/* tags + confidence + date */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[42px]">
        {doc.tags.slice(0, compact ? 3 : 4).map(tag => (
          <span
            key={tag}
            className="rounded px-1.5 py-0.5 font-mono text-[8.5px]"
            style={{ background: "var(--atlas-surface-3)", color: "var(--atlas-text-3)" }}
          >
            {tag}
          </span>
        ))}

        <span className="ml-auto flex items-center gap-2">
          {/* confidence score */}
          {confScore > 0 && (
            <span
              className="font-mono text-[9px] font-semibold"
              style={{ color: confColor }}
              title={`Confidence: ${confScore.toFixed(2)}`}
            >
              ●{confScore.toFixed(2)}
            </span>
          )}
          {/* date */}
          <span className="font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
            {doc.publishedAt
              ? new Date(doc.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric" })
              : ""}
          </span>
        </span>
      </div>

      {/* key insights — only if no relationships shown */}
      {!compact && topRelations.length === 0 && doc.keyInsights.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-[42px]">
          {doc.keyInsights.slice(0, 2).map((ins, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: "var(--atlas-text-2)" }}>
              <span style={{ color: "var(--atlas-cyan)" }}>›</span>
              {ins.length > 90 ? ins.slice(0, 89) + "…" : ins}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
