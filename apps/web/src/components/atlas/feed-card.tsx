"use client"

import { ExternalLink } from "lucide-react"
import type { KnowledgeDocument } from "@flora/types"

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

interface FeedCardProps {
  doc: KnowledgeDocument
  compact?: boolean
}

export function FeedCard({ doc, compact }: FeedCardProps) {
  const color = SOURCE_COLOR[doc.sourceType] ?? SOURCE_COLOR.default
  const label = SOURCE_LABEL[doc.sourceType] ?? doc.sourceType.toUpperCase()

  return (
    <div
      className="group border-b px-3 py-2.5 transition-colors hover:bg-white/[0.025] cursor-default"
      style={{ borderColor: "var(--atlas-border)" }}
    >
      {/* header row */}
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
          {doc.summary.length > 140 ? doc.summary.slice(0, 139) + "…" : doc.summary}
        </p>
      )}

      {/* tags + meta */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-[42px]">
        {doc.tags.slice(0, 4).map(tag => (
          <span
            key={tag}
            className="rounded px-1.5 py-0.5 font-mono text-[8.5px]"
            style={{ background: "var(--atlas-surface-3)", color: "var(--atlas-text-3)" }}
          >
            {tag}
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--atlas-text-3)" }}>
          {doc.publishedAt
            ? new Date(doc.publishedAt).toLocaleDateString("en", { month: "short", day: "numeric" })
            : ""}
        </span>
      </div>

      {/* key insights (if any) */}
      {!compact && doc.keyInsights.length > 0 && (
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
