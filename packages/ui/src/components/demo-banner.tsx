import * as React from "react"

import { cn } from "@crm/ui/lib/utils"

const DEMO_BANNER_TEXT =
  "Shared public demo · sample data only · everything you type is visible to other visitors · do not enter real information"

/**
 * The notice every visitor of the shared public demo sees. Plain markup with
 * no state, so the server and the client always render the same thing; the
 * caller decides on the server whether to show it.
 */
function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      data-slot="demo-banner"
      className={cn(
        "shrink-0 border-b border-amber-300/60 bg-amber-50 px-3 py-1 text-center text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100",
        className
      )}
    >
      {DEMO_BANNER_TEXT}
    </div>
  )
}

export { DEMO_BANNER_TEXT, DemoBanner }
