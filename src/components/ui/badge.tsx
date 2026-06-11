import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-[0.02em] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/30 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border-transparent",
        secondary:
          "bg-[hsl(var(--surface-container-high))] text-[hsl(var(--on-surface-variant))] border-transparent",
        destructive:
          "bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] border-transparent",
        outline:
          "border-[hsl(var(--outline))] bg-transparent text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground",
        link:
          "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
