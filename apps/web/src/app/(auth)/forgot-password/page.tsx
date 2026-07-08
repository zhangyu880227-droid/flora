"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"
import { Button, Input, Label } from "@flora/ui"
import { FloraLogo } from "@/components/flora-logo"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Simulates the password-reset request — wire up to your API when ready
      await new Promise((r) => setTimeout(r, 1200))
      setSent(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/45 shadow-2xl shadow-slate-900/15 ring-1 ring-inset ring-white/50 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/50 dark:shadow-black/60 dark:ring-white/5">
      <div className="px-8 pb-8 pt-8">
        <FloraLogo className="animate-auth-enter" />

        {sent ? (
          /* ── Success state ── */
          <div className="mt-10 flex flex-col items-center text-center animate-auth-enter">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-foreground">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a password-reset link to{" "}
              <span className="font-medium text-foreground">{email}</span>. It expires in 15
              minutes.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Didn&apos;t receive it? Check your spam folder or{" "}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-medium text-foreground underline-offset-4 hover:underline transition-colors"
              >
                try again
              </button>
              .
            </p>
            <Link
              href="/login"
              className="mt-8 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        ) : (
          /* ── Request form ── */
          <>
            <div className="mt-7 animate-auth-enter-delay-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Reset password
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5 animate-auth-enter-delay-2">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive dark:bg-destructive/15">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    className="h-11 pl-10 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full gap-2 text-sm font-medium"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>

            <Link
              href="/login"
              className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground animate-auth-enter-delay-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
