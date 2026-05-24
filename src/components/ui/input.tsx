import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Material 3 outlined text-field input.
 *  - 12px corner radius
 *  - generous internal padding (left/right 14, vertical 10)
 *  - focus highlight via box-shadow (inset) so padding/border never change
 *    -> placeholder + caret never shift on focus
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // base
        "flex h-11 w-full min-w-0 rounded-xl border border-[hsl(var(--outline))]",
        "bg-transparent px-3.5 py-2.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        // transitions
        "transition-[box-shadow,border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none",
        // hover (state layer)
        "hover:border-[hsl(var(--on-surface))]",
        // focus — inset shadow ring instead of border-width change. No layout shift.
        "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--primary))]",
        // file input bits
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // invalid
        "aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--destructive))] aria-invalid:focus-visible:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
