import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * M3 Switch — pill shape, primary-container colors, thumb expands on press.
 *  default: 32×20 track, 14 thumb idle / 18 thumb checked
 *  sm: 26×16 track
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 data-[size=default]:h-8 data-[size=default]:w-[52px] data-[size=sm]:h-6 data-[size=sm]:w-10 data-checked:border-primary data-checked:bg-primary data-unchecked:border-[hsl(var(--outline))] data-unchecked:bg-[hsl(var(--surface-container-highest))] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full ring-0 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-checked/switch:group-data-[size=default]/switch:size-6 group-data-checked/switch:group-data-[size=sm]/switch:size-5 data-checked:translate-x-[calc(100%+4px)] data-unchecked:translate-x-0.5 data-checked:bg-primary-foreground data-unchecked:bg-[hsl(var(--outline))]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
