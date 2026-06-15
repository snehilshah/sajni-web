import * as React from "react"
import { Clock, X } from "@/components/ui/icons"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * M3 expressive time field — drop-in replacement for `<Input type="time" />`.
 *
 * value / onChange use 24h `HH:MM` strings (matches the HTML time input
 * contract). The popup is a shadcn Popover with two scroll columns (12h
 * hour, 5-min minute) and an AM/PM segmented control — no native picker.
 */
export interface TimePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 0,5,..55

interface Parts { h12: number; min: number; pm: boolean }

function parse(value?: string): Parts | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  const pm = h >= 12
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { h12, min, pm }
}

function to24({ h12, min, pm }: Parts): string {
  let h = h12 % 12
  if (pm) h += 12
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

function display(parts: Parts | null): string {
  if (!parts) return ""
  return `${parts.h12}:${String(parts.min).padStart(2, "0")} ${parts.pm ? "PM" : "AM"}`
}

// One scroll column (hour / minute). Module-level so it isn't re-created on
// every TimePicker render — the React Compiler forbids defining a component
// during render (react-hooks/static-components).
function Col({
  items, selected, onPick, fmt, ariaLabel,
}: {
  items: number[]
  selected: number
  onPick: (n: number) => void
  fmt: (n: number) => string
  ariaLabel: string
}) {
  return (
    <ScrollArea className="h-[200px] w-14">
      <div className="flex flex-col gap-0.5 pr-2" role="listbox" aria-label={ariaLabel}>
        {items.map((n) => {
          const active = n === selected
          return (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={active}
              ref={active ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
              onClick={() => onPick(n)}
              className={cn(
                "h-9 shrink-0 rounded-full text-sm tabular-nums transition-colors",
                active
                  ? "bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] font-medium"
                  : "text-foreground/80 hover:bg-[hsl(var(--on-surface)/0.08)]",
              )}
            >
              {fmt(n)}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Set time",
  className,
  disabled,
  id,
  name,
}: TimePickerProps) {
  const generatedId = React.useId()
  const fieldId = id ?? generatedId
  const [open, setOpen] = React.useState(false)
  const parts = parse(value)

  // Editing defaults: a fresh pick lands on 9:00 AM so the columns aren't
  // arbitrary. Committed only once the user touches a column.
  const current: Parts = parts ?? { h12: 9, min: 0, pm: false }

  const emit = (next: Parts) => onChange?.(to24(next))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name ?? fieldId} value={value ?? ""} />
      <PopoverTrigger
        id={fieldId}
        disabled={disabled}
        className={cn(
          "group inline-flex h-11 w-full items-center justify-between gap-2",
          "rounded-md border border-[hsl(var(--outline))] bg-transparent px-3.5 py-2.5 text-sm",
          "text-foreground transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:border-[hsl(var(--on-surface))]",
          "data-[popup-open]:border-transparent data-[popup-open]:shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
          "disabled:opacity-50 disabled:pointer-events-none",
          !parts && "text-muted-foreground",
          className,
        )}
      >
        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          <span className="min-w-0 truncate">{parts ? display(parts) : placeholder}</span>
        </span>
        {parts && !disabled && (
          <span
            role="button"
            aria-label="Clear time"
            onClick={(e) => { e.stopPropagation(); onChange?.("") }}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.08)]"
          >
            <X className="size-3.5" />
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex items-stretch gap-1">
          <Col
            items={HOURS}
            selected={current.h12}
            onPick={(h12) => emit({ ...current, h12 })}
            fmt={(n) => String(n)}
            ariaLabel="Hour"
          />
          <div className="flex items-center text-muted-foreground">:</div>
          <Col
            items={parts && !MINUTES.includes(parts.min) ? [...MINUTES, parts.min].sort((a, b) => a - b) : MINUTES}
            selected={current.min}
            onPick={(min) => emit({ ...current, min })}
            fmt={(n) => String(n).padStart(2, "0")}
            ariaLabel="Minute"
          />
          <div className="ml-1 flex flex-col justify-center gap-1">
            {([false, true] as const).map((pm) => {
              const active = current.pm === pm
              return (
                <button
                  key={pm ? "PM" : "AM"}
                  type="button"
                  onClick={() => emit({ ...current, pm })}
                  className={cn(
                    "h-9 w-12 rounded-full text-xs font-medium tracking-wide transition-colors",
                    active
                      ? "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]"
                      : "border border-[hsl(var(--outline-variant))] text-foreground/70 hover:bg-[hsl(var(--on-surface)/0.06)]",
                  )}
                >
                  {pm ? "PM" : "AM"}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
