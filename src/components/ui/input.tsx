import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Material 3 outlined text-field input.
 *  - 12px corner radius
 *  - generous internal padding (left/right 14, vertical 10)
 *  - focused ring uses primary, with subtle elevation
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
        "transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none",
        // hover (state layer)
        "hover:border-[hsl(var(--on-surface))]",
        // focus — M3 outlined text field highlights border w/ primary at 2px
        "focus-visible:border-primary focus-visible:border-2 focus-visible:px-[13px]",
        // file input bits
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // invalid
        "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
