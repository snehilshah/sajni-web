import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Material 3 Expressive Button.
 *
 *  variants: filled (default) | tonal | outlined | text | elevated | destructive | secondary | link
 *  sizes:    sm | default | lg | icon variants | fab | fab-extended
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "font-sans font-medium tracking-[0.005em]",
    "transition-[background-color,box-shadow,transform,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
    "outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:ring-2 aria-invalid:ring-destructive/30",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-[18px]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Filled — high-emphasis primary CTA.
        default:
          "rounded-full bg-primary text-primary-foreground border border-transparent shadow-none hover:brightness-105 hover:shadow-[var(--m3-elev-1)]",
        // Tonal — medium-emphasis container fill.
        tonal:
          "rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border border-transparent hover:brightness-[0.97]",
        // Outlined — secondary action with outline.
        outline:
          "rounded-full bg-transparent text-foreground border border-[hsl(var(--outline))] hover:bg-[hsl(var(--on-surface)/0.05)]",
        // Text — lowest emphasis.
        ghost:
          "rounded-full bg-transparent text-foreground border border-transparent hover:bg-[hsl(var(--on-surface)/0.06)]",
        // Elevated — like text but with a subtle surface lift.
        elevated:
          "rounded-full bg-[hsl(var(--surface-container-low))] text-primary border border-transparent shadow-[var(--m3-elev-1)] hover:shadow-[var(--m3-elev-2)] hover:bg-[hsl(var(--surface-container))]",
        // Secondary alias — kept for backwards compat; renders tonal.
        secondary:
          "rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border border-transparent hover:brightness-[0.97]",
        // Destructive — error container fill.
        destructive:
          "rounded-full bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] border border-transparent hover:brightness-[0.97]",
        // Link — text + underline.
        link:
          "rounded-none border-0 text-primary underline underline-offset-4 hover:no-underline px-0 active:scale-100",
      },
      size: {
        default: "h-10 px-6 text-sm",
        xs: "h-7 gap-1 px-3 text-xs rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-4 text-xs rounded-full",
        lg: "h-12 gap-2 px-7 text-sm rounded-full",
        icon: "size-10 px-0 rounded-full",
        "icon-xs": "size-7 px-0 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 px-0 rounded-full",
        "icon-lg": "size-12 px-0 rounded-full",
        // M3 FABs — square-ish rounded.
        fab: "size-14 rounded-2xl shadow-[var(--m3-elev-3)] [&_svg:not([class*='size-'])]:size-6",
        "fab-extended": "h-14 px-6 rounded-2xl shadow-[var(--m3-elev-3)] gap-3 text-sm [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
