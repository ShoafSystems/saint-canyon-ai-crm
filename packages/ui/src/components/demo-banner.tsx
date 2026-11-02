import * as React from "react"

import { cn } from "@crm/ui/lib/utils"

const DEMO_BANNER_TITLE = "Public demo"
const DEMO_BANNER_LINES = [
  "Sample data, shared with every visitor.",
  "Anything you type is visible to others.",
  "Do not enter real information.",
] as const
const DEMO_BANNER_TEXT = [DEMO_BANNER_TITLE, ...DEMO_BANNER_LINES].join(" ")

/**
 * The notice every visitor of the shared public demo sees. Plain markup with
 * no state, so the server and the client always render the same thing; the
 * caller decides on the server whether to show it. "strip" is the one-line
 * bar above the app; "card" is the boxed notice on the sign-in page.
 */
function DemoBanner({
  variant = "strip",
  className,
}: {
  variant?: "strip" | "card"
  className?: string
}) {
  if (variant === "card") {
    return (
      <div
        role="note"
        data-slot="demo-banner"
        data-variant="card"
        className={cn(
          "flex flex-col gap-1.5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-50",
          className
        )}
      >
        <strong className="flex items-center gap-2 font-semibold text-sm">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-amber-500 dark:bg-amber-300"
          />
          {DEMO_BANNER_TITLE}
        </strong>
        <ul className="flex flex-col gap-0.5 text-xs/5">
          {DEMO_BANNER_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div
      role="note"
      data-slot="demo-banner"
      data-variant="strip"
      className={cn(
        "shrink-0 border-b border-amber-300/60 bg-amber-50 px-3 py-1.5 text-center text-xs/5 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-50",
        className
      )}
    >
      <strong className="font-semibold">{DEMO_BANNER_TITLE}</strong>
      {DEMO_BANNER_LINES.map((line) => (
        <React.Fragment key={line}>
          <span aria-hidden="true" className="px-1.5 opacity-60">
            ·
          </span>
          {line}
        </React.Fragment>
      ))}
    </div>
  )
}

export { DEMO_BANNER_LINES, DEMO_BANNER_TEXT, DEMO_BANNER_TITLE, DemoBanner }
