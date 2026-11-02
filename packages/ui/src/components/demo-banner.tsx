import * as React from "react"

import { cn } from "@crm/ui/lib/utils"

const DEMO_BANNER_TITLE = "Public demo"
const DEMO_BANNER_LINES = [
  "Sample data, shared with every visitor.",
  "Anything you type is visible to others.",
  "Do not enter real information.",
] as const
const DEMO_BANNER_TEXT = [DEMO_BANNER_TITLE, ...DEMO_BANNER_LINES].join(" ")

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M8.87 1.5a1 1 0 0 0-1.74 0L.63 13a1 1 0 0 0 .87 1.5h13a1 1 0 0 0 .87-1.5L8.87 1.5ZM7.25 5.5h1.5v4.25h-1.5V5.5ZM8 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  )
}

/** What the narrow layouts show in place of the full lines. */
const DEMO_BANNER_SHORT = "sample data · don't enter real info"
const DEMO_BANNER_CARD_LINE = "Sample data. Don't enter real info."

/**
 * The notice every visitor of the shared public demo sees. Plain markup with
 * no state, so the server and the client always render the same thing; the
 * caller decides on the server whether to show it. "strip" is the one-line
 * bar above the app; "card" is the boxed notice on the sign-in page. Both
 * keep the full lines for screen readers when they show a shorter one.
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
          "flex flex-col gap-0.5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 dark:rounded-2xl dark:border-(--glass-warning)/45 dark:bg-(--glass-warning)/12 dark:text-amber-50 dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.12)]",
          className
        )}
      >
        <strong className="flex items-center gap-2 font-semibold text-sm/5">
          <WarningIcon className="text-amber-600 dark:text-(--glass-warning)" />
          {DEMO_BANNER_TITLE}
        </strong>
        <p aria-hidden="true" className="pl-6 text-[13px]/5">
          {DEMO_BANNER_CARD_LINE}
        </p>
        <ul className="sr-only">
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
        "shrink-0 truncate border-b border-amber-300/60 bg-amber-50 px-3 py-1.5 text-center text-[13px]/5 text-amber-950 dark:border-(--glass-warning)/30 dark:bg-[rgb(26_18_4/0.5)] dark:bg-linear-to-b dark:from-(--glass-warning)/24 dark:to-(--glass-warning)/14 dark:text-[#fff4dc] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.1)] dark:backdrop-blur-xl dark:backdrop-saturate-[1.8]",
        className
      )}
    >
      <WarningIcon className="mr-1.5 inline-block align-[-3px] dark:text-(--glass-warning)" />
      <strong className="font-semibold">{DEMO_BANNER_TITLE}</strong>
      <span aria-hidden="true" className="md:hidden">
        <span className="px-1.5 opacity-60">·</span>
        {DEMO_BANNER_SHORT}
      </span>
      <span className="sr-only md:not-sr-only">
        {DEMO_BANNER_LINES.map((line) => (
          <React.Fragment key={line}>
            <span aria-hidden="true" className="px-1.5 opacity-60">
              ·
            </span>
            {line}
          </React.Fragment>
        ))}
      </span>
    </div>
  )
}

export { DEMO_BANNER_LINES, DEMO_BANNER_TEXT, DEMO_BANNER_TITLE, DemoBanner }
