import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, id, name, ...props }: React.ComponentProps<"textarea">) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  return (
    <textarea
      id={fieldId}
      name={name ?? fieldId}
      data-slot="textarea"
      className={cn(
        // base — no padding/border-width change on focus so caret/placeholder
        // never shift. Focus highlight is an inset box-shadow instead.
        "flex field-sizing-content min-h-20 w-full resize-none rounded-md border border-[hsl(var(--outline))]",
        "bg-transparent px-3.5 py-2.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "transition-[box-shadow,border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none focus-visible:outline-none hover:border-[hsl(var(--on-surface))]",
        "focus-visible:border-transparent focus-visible:hover:border-transparent focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--destructive))] aria-invalid:focus-visible:border-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
