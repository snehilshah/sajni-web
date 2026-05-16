import { cn } from "@/lib/utils"

/**
 * Generic loading spinner. M3 Expressive cookie loader under the hood;
 * any consumer of `<Spinner />` gets the same morphing indicator the
 * rest of the app uses.
 */
function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("m3-cookie m3-cookie-sm", className)}
    />
  )
}

export { Spinner }
