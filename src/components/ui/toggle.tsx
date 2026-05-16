"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * M3 segmented/filter Toggle.
 *  default = unpressed text, pressed = secondary-container fill (pill).
 *  outline = outlined chip variant.
 */
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium tracking-[0.005em] whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-pressed:bg-[hsl(var(--secondary-container))] aria-pressed:text-[hsl(var(--on-secondary-container))] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent text-foreground",
        outline: "border border-[hsl(var(--outline))] bg-transparent text-foreground aria-pressed:border-transparent",
      },
      size: {
        default: "h-10 min-w-10 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        sm: "h-8 min-w-8 px-4 text-xs has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-12 min-w-12 px-7 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
