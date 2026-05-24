import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // base — no padding/border-width change on focus so caret/placeholder
        // never shift. Focus highlight is an inset box-shadow instead.
        "flex field-sizing-content min-h-20 w-full resize-none rounded-xl border border-[hsl(var(--outline))]",
        "bg-transparent px-3.5 py-2.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "transition-[box-shadow,border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none hover:border-[hsl(var(--on-surface))]",
        "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--primary))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--destructive))] aria-invalid:focus-visible:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
