"use client"

import { useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Badge, Button, Card, CardContent, Input, Skeleton, cn } from "@flora/ui"
import { searchApi, projectsApi, workspacesApi } from "@/lib/api"
import type { SearchResult } from "@flora/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { useQuery } from "@tanstack/react-query"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)

  const { activeWorkspaceId } = useWorkspaceStore()
  const { data: workspaces = [] } = useQuery({ queryKey: ["workspaces"], queryFn: workspacesApi.list })
  const workspaceId = activeWorkspaceId ?? workspaces[0]?.id

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => projectsApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const projectId = selectedProjectId ?? projects[0]?.id
  const selectedProject = projects.find((p) => p.id === projectId)

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim() || !projectId) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await searchApi.search({ query, projectId })
      setResults(res.results)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Search</h1>

      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across your sources…"
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Project selector */}
        {projects.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectOpen((v) => !v)}
              className="flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="max-w-[120px] truncate">
                {selectedProject?.name ?? "All projects"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>
            {projectOpen && (
              <div className="absolute right-0 top-11 z-50 w-48 rounded-lg border bg-popover p-1 shadow-md">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(p.id)
                      setProjectOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      p.id === projectId && "bg-accent font-medium",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Button type="submit" disabled={loading || !projectId}>
          Search
        </Button>
      </form>

      {!projectId && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Create a project and add sources before searching
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No results found — try different keywords or add more sources
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{results.length} results</p>
          {results.map((result) => (
            <Card key={result.chunkId}>
              <CardContent className="py-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium">{result.sourceTitle}</span>
                  <Badge variant="outline" className="text-xs">
                    {result.sourceType}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(result.score * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="line-clamp-4 text-sm text-muted-foreground">{result.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
