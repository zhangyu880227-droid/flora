"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileUp, Globe, Loader2 } from "lucide-react"
import { Button, Card, CardContent, Input, Label, cn } from "@flora/ui"
import { sourcesApi } from "@/lib/api"

type Tab = "url" | "pdf"

export default function AddSourcePage({ params }: { params: { id: string } }) {
  const { id: projectId } = params
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("url")
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = tab === "url" ? url.trim().length > 0 : file !== null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      if (tab === "url") {
        await sourcesApi.createUrl(projectId, "url", url.trim(), title.trim() || undefined)
      } else {
        await sourcesApi.upload(projectId, file!)
      }
      router.push(`/projects/${projectId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add source")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <div className="mb-6">
        <Link
          href={`/projects/${projectId}`}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to project
        </Link>
        <h1 className="text-2xl font-semibold">Add source</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a web page or PDF to your research project.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex rounded-lg border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab("url")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
            tab === "url"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="h-4 w-4" />
          URL / Web page
        </button>
        <button
          type="button"
          onClick={() => setTab("pdf")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
            tab === "pdf"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileUp className="h-4 w-4" />
          PDF upload
        </button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {tab === "url" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="url">
                    URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Title{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Descriptive title for this source"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>
                  PDF file <span className="text-destructive">*</span>
                </Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                    file
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-border hover:border-emerald-500/40 hover:bg-emerald-500/5",
                  )}
                >
                  <FileUp className="mb-2 h-8 w-8 text-muted-foreground" />
                  {file ? (
                    <p className="text-sm font-medium">{file.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Click to upload PDF</p>
                      <p className="mt-1 text-xs text-muted-foreground">PDF files up to 50 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={loading || !canSubmit} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  "Add source"
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/projects/${projectId}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
