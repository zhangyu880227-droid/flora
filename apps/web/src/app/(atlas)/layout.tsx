export default function AtlasRootLayout({ children }: { children: React.ReactNode }) {
  // Full-screen dark shell — intentionally bypasses (app) layout (no sidebar / topbar)
  return <div className="h-screen overflow-hidden" style={{ background: "var(--atlas-bg)" }}>{children}</div>
}
