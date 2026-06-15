import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { Check, X } from "@/components/ui/icons"

import { cn } from "@/lib/utils"

/**
 * M3 Switch, modeled after Material Web:
 *   track  52x32 (default) / 40x24 (sm)
 *   handle 24dp default, 28dp pressed
 * The thumb travels by center position, so press size changes do not cause edge
 * jumps. Icons are on by default; use hideIcons for iconless switches.
 */
function Switch({
  className,
  size = "default",
  icons = true,
  hideIcons = false,
  showOnlySelectedIcon = false,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
  icons?: boolean
  hideIcons?: boolean
  showOnlySelectedIcon?: boolean
}) {
  const showIcons = icons && !hideIcons

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-icons={showIcons ? true : undefined}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 rounded-full outline-none after:absolute after:left-1/2 after:top-1/2 after:size-12 after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:ring-2 aria-invalid:ring-destructive/30 data-[size=default]:h-8 data-[size=default]:w-[52px] data-[size=sm]:h-6 data-[size=sm]:w-10 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className="absolute inset-0 rounded-full box-border transition-[background-color,border-color] duration-[67ms] ease-linear group-data-checked/switch:border-primary group-data-checked/switch:bg-primary group-data-unchecked/switch:border-2 group-data-unchecked/switch:border-[hsl(var(--outline))] group-data-unchecked/switch:bg-[hsl(var(--surface-container-highest))] group-data-disabled/switch:transition-none motion-reduce:transition-none"
      />
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none absolute top-1/2 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-0 will-change-[left] transition-[left] duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] data-unchecked:left-4 group-data-[size=default]/switch:data-checked:left-9 group-data-[size=sm]/switch:data-unchecked:left-3 group-data-[size=sm]/switch:data-checked:left-7 group-data-disabled/switch:transition-none motion-reduce:transition-none"
      >
        <span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--outline))] transition-[height,width] duration-[250ms] ease-[var(--m3-ease-standard)] group-active/switch:size-7 group-data-checked/switch:bg-primary-foreground group-data-[size=sm]/switch:size-5 group-data-[size=sm]/switch:group-active/switch:size-6 group-data-disabled/switch:transition-none motion-reduce:transition-none">
          {showIcons ? (
            <>
              <Check
                strokeWidth={3}
                className="col-start-1 row-start-1 size-4 text-primary opacity-0 transition-[opacity,transform] duration-[167ms] ease-[var(--m3-ease-standard)] group-data-checked/switch:opacity-100 group-data-unchecked/switch:-rotate-45 group-data-[size=sm]/switch:size-3.5 motion-reduce:transition-none"
              />
              {!showOnlySelectedIcon ? (
                <X
                  strokeWidth={3}
                  className="col-start-1 row-start-1 size-4 text-[hsl(var(--surface-container-highest))] opacity-100 transition-[opacity,transform] duration-[167ms] ease-[var(--m3-ease-standard)] group-data-checked/switch:opacity-0 group-data-[size=sm]/switch:size-3.5 motion-reduce:transition-none"
                />
              ) : null}
            </>
          ) : null}
        </span>
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
