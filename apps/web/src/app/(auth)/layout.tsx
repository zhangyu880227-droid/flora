import { ThemeToggle } from "@/components/theme-toggle"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-gradient-to-br from-violet-200 via-indigo-100 to-sky-200 dark:from-violet-950 dark:via-slate-950 dark:to-indigo-950">
      {/* Dot-grid */}
      <div className="auth-dot-grid pointer-events-none absolute inset-0 opacity-30" />

      {/* Central bloom — directly behind the card, gives glass something to blur */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-[80px]" />

      {/* Orb — violet, top-right */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-[460px] w-[460px] animate-auth-float rounded-full bg-violet-400/50 blur-[64px] dark:bg-violet-500/25" />

      {/* Orb — emerald, bottom-left */}
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-[500px] w-[500px] animate-auth-float-alt rounded-full bg-emerald-400/45 blur-[64px] dark:bg-emerald-500/20" />

      {/* Orb — rose, lower-center-right */}
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[280px] w-[280px] animate-auth-float-slow rounded-full bg-rose-300/40 blur-[48px] dark:bg-rose-600/15" />

      {/* Orb — sky, upper-left */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-[300px] w-[300px] animate-auth-float rounded-full bg-sky-300/40 blur-[52px] dark:bg-sky-600/20" />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Content */}
      <div className="relative z-10 flex w-full items-center justify-center p-4 py-12 sm:p-8">
        <div className="w-full max-w-[420px] animate-auth-scale">
          {children}
        </div>
      </div>
    </div>
  )
}
