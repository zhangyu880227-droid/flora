import { cn } from "@flora/ui"

interface FloraLogoProps {
  className?: string
  iconOnly?: boolean
  size?: "sm" | "md" | "lg"
}

export function FloraLogo({ className, iconOnly = false, size = "md" }: FloraLogoProps) {
  const iconSizes = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" }
  const leafSizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" }
  const textSizes = { sm: "text-base", md: "text-xl", lg: "text-2xl" }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20",
          iconSizes[size],
        )}
      >
        <svg
          className={cn("text-white", leafSizes[size])}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 3C12 3 5 8.5 5 15.5A7 7 0 0019 15.5C19 8.5 12 3 12 3Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
          <path
            d="M12 3C12 3 8.5 11 12 22"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeOpacity="0.5"
          />
        </svg>
      </div>
      {!iconOnly && (
        <span className={cn("font-semibold tracking-tight text-foreground", textSizes[size])}>
          Flora
        </span>
      )}
    </div>
  )
}
