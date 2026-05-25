"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

/**
 * M3 Checkbox — 18px square, 2px corner, primary-container fill on checked.
 */
function Checkbox({ className, id, name, ...props }: CheckboxPrimitive.Root.Props) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  return (
    <CheckboxPrimitive.Root
      id={fieldId}
      name={name ?? fieldId}
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 border-[hsl(var(--on-surface-variant))] bg-transparent transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-3.5 [&>svg]:stroke-[3px]"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
