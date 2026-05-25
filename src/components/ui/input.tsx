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
function Input({ className, type, id, name, ...props }: React.ComponentProps<"input">) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  return (
    <InputPrimitive
      type={type}
      id={fieldId}
      name={name ?? fieldId}
      data-slot="input"
      className={cn(
        // base
        "flex h-11 w-full min-w-0 rounded-xl border border-[hsl(var(--outline))]",
        "bg-transparent px-3.5 py-2.5 text-sm text-foreground",
        "placeholder:text-muted-foreground",
        // transitions
        "transition-[box-shadow,border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none focus-visible:outline-none",
        // hover (state layer)
        "hover:border-[hsl(var(--on-surface))]",
        // focus — single 2px inset ring sits flush against the existing
        // 1px outline border. Keeping the border color stable (not flipping
        // to --primary) prevents the double-line look the previous combo
        // produced where both border AND inset shadow ended up visible.
        "focus-visible:border-transparent focus-visible:hover:border-transparent focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
        // file input bits
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // invalid
        "aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--destructive))] aria-invalid:focus-visible:border-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Input }
