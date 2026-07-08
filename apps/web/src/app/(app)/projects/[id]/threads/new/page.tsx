"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { threadsApi } from "@/lib/api"

export default function NewThreadPage({ params }: { params: { id: string } }) {
  const { id: projectId } = params
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function create() {
      try {
        const thread = await threadsApi.create(projectId, { title: "New conversation" })
        router.replace(`/threads/${thread.id}`)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create thread")
      }
    }
    create()
  }, [projectId, router])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
