import { MorphLoader } from "./morph-loader"

/**
 * Generic loading spinner. The M3 Expressive shape-morphing loader under
 * the hood; every <Spinner /> across the app smoothly tweens between
 * curated cookie / clover / pentagon / sunny shapes the same way Android
 * does it.
 */
function Spinner({ className }: { className?: string }) {
  return <MorphLoader size="sm" className={className} />
}

export { Spinner }
