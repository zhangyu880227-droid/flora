"use client"

import { use, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Bot, Send, User } from "lucide-react"
import { Badge, Button, Input, ScrollArea, cn } from "@flora/ui"
import { threadsApi } from "@/lib/api"
import type { Message } from "@flora/types"
import Link from "next/link"

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3.5">
        <Link
          href="/threads"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Threads
        </Link>
        <span className="text-muted-foreground/30">/</span>
        <h1 className="truncate font-medium text-sm">{thread?.title ?? "Loading…"}</h1>
        {streaming && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Thinking…
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 mb-3">
                <Bot className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="font-semibold">Ask anything</p>
              <p className="mt-1 text-sm text-muted-foreground">
                I&apos;ll search your knowledge base to answer
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {streamingContent && (
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</p>
                <span className="mt-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t px-6 py-4">
        <form onSubmit={sendMessage} className="mx-auto flex max-w-2xl gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your sources…"
            disabled={streaming}
            className="flex-1 rounded-xl text-sm"
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={streaming || !input.trim()}
            className="shrink-0 rounded-xl"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground/50">
          Responses are grounded in your project sources
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-foreground/10"
            : "bg-emerald-500/15",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        )}
      </div>

      {/* Bubble */}
      <div className={cn("min-w-0 max-w-[80%]", isUser && "items-end flex flex-col")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-foreground text-background"
              : "rounded-tl-sm bg-muted/50 text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Citations */}
        {message.sourcesCited.length > 0 && (
          <div className={cn("mt-2 flex flex-wrap gap-1.5", isUser && "justify-end")}>
            {message.sourcesCited.map((s) => (
              <Badge
                key={s.chunkId}
                variant="outline"
                className="h-5 px-1.5 text-[10px] font-normal"
              >
                {s.sourceTitle}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
