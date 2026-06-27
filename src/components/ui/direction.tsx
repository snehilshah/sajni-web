import { DirectionProvider as DirectionProviderPrimitive } from "@base-ui/react/direction-provider"
import type * as React from "react"

function DirectionProvider({
  ...props
}: React.ComponentProps<typeof DirectionProviderPrimitive>) {
  return <DirectionProviderPrimitive {...props} />
}

export { DirectionProvider }
