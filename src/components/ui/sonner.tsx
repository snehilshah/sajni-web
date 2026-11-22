import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "@/components/ui/icons"

function readMode(): "light" | "dark" {
  if (typeof document === "undefined") return "light"
  return document.documentElement.dataset.mode === "dark" ? "dark" : "light"
}

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<"light" | "dark">(readMode)

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readMode()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] })
    return () => obs.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // The theme's own surface, in its own mode: a dark card on a dark
          // page, tinted by the active theme (not Material's inverted snackbar).
          "--normal-bg": "hsl(var(--surface-container-high))",
          "--normal-text": "hsl(var(--on-surface))",
          "--normal-border": "hsl(var(--outline-variant))",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
