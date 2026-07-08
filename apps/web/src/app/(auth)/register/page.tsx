"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react"
import { Button, Input, Label, Separator } from "@flora/ui"
import { FloraLogo } from "@/components/flora-logo"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"

export default function RegisterPage() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.register({ name, email, password })
      setUser(res.user)
      if (res.workspace) setActiveWorkspaceId(res.workspace.id)
      router.push("/workspace")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const passwordStrength =
    password.length === 0
      ? null
      : password.length < 8
        ? "weak"
        : password.length < 12
          ? "fair"
          : "strong"

  const strengthConfig = {
    weak:   { label: "Weak",   width: "w-1/3",  color: "bg-red-500" },
    fair:   { label: "Fair",   width: "w-2/3",  color: "bg-amber-500" },
    strong: { label: "Strong", width: "w-full", color: "bg-emerald-500" },
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/45 shadow-2xl shadow-slate-900/15 ring-1 ring-inset ring-white/50 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/50 dark:shadow-black/60 dark:ring-white/5">
      {/* Header */}
      <div className="px-8 pb-0 pt-8">
        <FloraLogo className="animate-auth-enter" />

        <div className="mt-7 animate-auth-enter-delay-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start your AI-powered research workspace
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-8 pb-8 pt-6">
        <div className="space-y-5 animate-auth-enter-delay-2">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive dark:bg-destructive/15">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Full name
            </Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder="Ada Lovelace"
                className="h-11 pl-10 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
              />
            </div>
          </div>

          {/* Email */}
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
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                className="h-11 pl-10 pr-11 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Password strength indicator */}
            {passwordStrength && (
              <div className="space-y-1">
                <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthConfig[passwordStrength].width} ${strengthConfig[passwordStrength].color}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password strength:{" "}
                  <span
                    className={
                      passwordStrength === "strong"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : passwordStrength === "fair"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    }
                  >
                    {strengthConfig[passwordStrength].label}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-4 animate-auth-enter-delay-3">
          <Button
            type="submit"
            className="h-11 w-full gap-2 text-sm font-medium"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <div className="relative flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            By creating an account you agree to our{" "}
            <span className="cursor-default font-medium text-foreground">Terms of Service</span>{" "}
            and{" "}
            <span className="cursor-default font-medium text-foreground">Privacy Policy</span>.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
