import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full resize-none rounded-xl border border-[hsl(var(--outline))] bg-transparent px-3.5 py-2.5 text-sm transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none placeholder:text-muted-foreground hover:border-[hsl(var(--on-surface))] focus-visible:border-primary focus-visible:border-2 focus-visible:px-[13px] focus-visible:py-[9px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
