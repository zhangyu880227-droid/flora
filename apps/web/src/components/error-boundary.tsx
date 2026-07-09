"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-mono text-[11px]" style={{ color: "#f85149" }}>
            Something went wrong
          </p>
          <p className="font-mono text-[10px] max-w-xs break-words opacity-60" style={{ color: "#8b949e" }}>
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            className="rounded border px-3 py-1.5 font-mono text-[10px] transition-colors hover:bg-white/5"
            style={{ borderColor: "#30363d", color: "#58a6ff" }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
