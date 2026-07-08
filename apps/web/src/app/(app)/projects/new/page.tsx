"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Button, Card, CardContent, Input, Label } from "@flora/ui"
import { projectsApi, workspacesApi } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace"

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeWorkspaceId } = useWorkspaceStore()

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspacesApi.list,
  })

  const workspaceId = searchParams.get("workspace") ?? activeWorkspaceId ?? workspaces[0]?.id

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const project = await projectsApi.create(workspaceId, {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      router.push(`/projects/${project.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <div className="mb-6">
        <Link
          href="/projects"
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
        <h1 className="text-2xl font-semibold">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize research sources and AI conversations in one place.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">
                Project name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Market research Q3"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What are you researching?"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || !name.trim() || !workspaceId}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Create project
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/projects">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
