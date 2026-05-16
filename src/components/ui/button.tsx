import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 border whitespace-nowrap font-serif font-normal lowercase tracking-[0.04em] transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background hover:bg-primary hover:border-primary",
        outline:
          "border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/85",
        ghost:
          "border-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
        link:
          "border-transparent text-primary underline underline-offset-4 hover:no-underline px-0",
      },
      size: {
        default: "h-9 px-[18px] text-sm",
        xs: "h-7 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-11 gap-2 px-6 text-sm",
        icon: "size-9 px-0",
        "icon-xs": "size-7 px-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 px-0",
        "icon-lg": "size-11 px-0",
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
