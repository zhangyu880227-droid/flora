"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { Button, Input, ScrollArea } from "@flora/ui"
import { threadsApi } from "@/lib/api"
import type { Message } from "@flora/types"
import { cn } from "@flora/ui"

export default function ThreadPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: thread } = useQuery({
    queryKey: ["thread", id],
    queryFn: () => threadsApi.get(id),
  })

  const { data: serverMessages = [] } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => threadsApi.listMessages(id),
  })

  useEffect(() => {
    setMessages(serverMessages)
  }, [serverMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingContent])

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!input.trim() || streaming) return

    const content = input.trim()
    setInput("")
    setStreaming(true)
    setStreamingContent("")

    const userMsg: Message = {
      id: crypto.randomUUID(),
      threadId: id,
      role: "user",
      content,
      sourcesCited: [],
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const res = await fetch(`/api/v1/threads/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ""

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))
        for (const line of lines) {
          const data = JSON.parse(line.slice(6))
          if (data.token) {
            fullContent += data.token
            setStreamingContent(fullContent)
          }
          if (data.done) {
            const assistantMsg: Message = {
              id: crypto.randomUUID(),
              threadId: id,
              role: "assistant",
              content: fullContent,
              sourcesCited: data.sources ?? [],
              createdAt: new Date().toISOString(),
            }
            setMessages((prev) => [...prev, assistantMsg])
            setStreamingContent("")
          }
        }
      }
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="font-medium">{thread?.title ?? "Thread"}</h1>
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {streamingContent && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <span className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-foreground" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t px-6 py-4">
        <form onSubmit={sendMessage} className="mx-auto flex max-w-2xl gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your sources…"
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.sourcesCited.length > 0 && (
          <div className="mt-2 border-t border-current/20 pt-2">
            <p className="text-xs opacity-70">Sources: {message.sourcesCited.map((s) => s.sourceTitle).join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  )
}
