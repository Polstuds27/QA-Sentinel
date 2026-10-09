import { cn } from "@/lib/utils"

// Linya is Filipino for "line": two lines meet as an L, and the cobalt dot is the
// moment on the call worth hearing. The dot never touches the lines.
function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight",
        className
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0">
        <path d="M3 3h4v14h14v4H3z" className="fill-foreground" />
        <circle cx="15.5" cy="8.5" r="4" className="fill-primary" />
      </svg>
      Linya
    </span>
  )
}

export { Logo }
