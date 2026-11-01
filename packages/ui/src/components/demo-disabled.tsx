import * as React from "react"

import { cn } from "@crm/ui/lib/utils"

const DEMO_DISABLED_NOTE = "Disabled in demo"

/**
 * Wraps an action the public demo cannot use. A disabled fieldset turns off
 * every button and input inside it, and a short note says why. The API
 * refuses these actions regardless; this only spares visitors the error.
 */
function DemoDisabled({
  active,
  note = DEMO_DISABLED_NOTE,
  className,
  children,
}: {
  active: boolean
  note?: string
  className?: string
  children: React.ReactNode
}) {
  const noteId = React.useId()

  if (!active) return <>{children}</>

  return (
    <fieldset
      disabled
      data-slot="demo-disabled"
      aria-describedby={noteId}
      className={cn("m-0 flex min-w-0 items-center gap-2 border-0 p-0", className)}
    >
      {children}
      <span id={noteId} className="text-xs text-muted-foreground">
        {note}
      </span>
    </fieldset>
  )
}

export { DEMO_DISABLED_NOTE, DemoDisabled }
