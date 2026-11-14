import * as React from "react"
import { Clock, X } from "@/components/ui/icons"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * M3 expressive time field — drop-in replacement for `<Input type="time" />`.
 *
 * value / onChange use 24h `HH:MM` strings (matches the HTML time input
 * contract). The popup is a shadcn Popover with the M3 time input: typed
 * hour and minute (↑/↓ move one), an AM/PM toggle and Now. No native
 * picker, no scrolling through 5-minute steps.
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

// One typed segment (hour or minute): type the digits, or ↑/↓ by one.
// Module-level so it isn't re-created on every render (React Compiler).
function Segment({
  value, min, max, onChange, onFilled, ariaLabel, inputRef, autoFocus,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  /** Called when the segment is complete (two digits, or one that can't grow). */
  onFilled?: () => void
  ariaLabel: string
  inputRef?: React.Ref<HTMLInputElement>
  autoFocus?: boolean
}) {
  const [text, setText] = React.useState<string | null>(null)
  const shown = text ?? String(value).padStart(2, "0")
  return (
    <Input
      ref={inputRef}
      inputMode="numeric"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      value={shown}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setText(null)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(-2)
        setText(digits)
        if (!digits) return
        const n = Number(digits)
        if (n >= min && n <= max) onChange(n)
        // "9" can't become a valid hour 9x, "6" no minute 6x: move on.
        if (digits.length === 2 || n * 10 > max) { setText(null); onFilled?.() }
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
        e.preventDefault()
        const span = max - min + 1
        const next = ((value - min + (e.key === "ArrowUp" ? 1 : -1)) % span + span) % span + min
        setText(null)
        onChange(next)
      }}
      className={cn(
        "h-16 w-[4.5rem] px-0 py-0 rounded-xl border-0 bg-[hsl(var(--surface-container-highest))] text-center text-4xl font-medium tabular-nums text-foreground outline-none",
        "focus:bg-[hsl(var(--primary-container))] focus:text-[hsl(var(--on-primary-container))] focus:shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
      )}
    />
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
  const minuteRef = React.useRef<HTMLInputElement>(null)
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
          "rounded-xl border border-transparent bg-[hsl(var(--surface-container-highest))] px-3.5 py-2.5 text-sm",
          "text-foreground transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:border-transparent",
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
      <PopoverContent align="start" className="w-auto p-4">
        <div className="flex items-center gap-2">
          <Segment
            value={current.h12}
            min={1}
            max={12}
            onChange={(h12) => emit({ ...current, h12 })}
            onFilled={() => minuteRef.current?.focus()}
            ariaLabel="Hour"
            autoFocus
          />
          <span className="text-3xl text-muted-foreground">:</span>
          <Segment
            value={current.min}
            min={0}
            max={59}
            onChange={(min) => emit({ ...current, min })}
            ariaLabel="Minute"
            inputRef={minuteRef}
          />
          <div className="ml-1 flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--outline-variant))]">
            {([false, true] as const).map((pm) => (
              <button
                key={pm ? "PM" : "AM"}
                type="button"
                aria-pressed={current.pm === pm}
                onClick={() => emit({ ...current, pm })}
                className={cn(
                  "h-8 w-12 text-xs font-semibold tracking-wide transition-colors",
                  current.pm === pm
                    ? "bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]"
                    : "text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)]",
                )}
              >
                {pm ? "PM" : "AM"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Type the time, or ↑ ↓ to move a minute.</p>
        <div className="mt-3 flex justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date()
              emit({ h12: now.getHours() % 12 || 12, min: now.getMinutes(), pm: now.getHours() >= 12 })
            }}
          >
            Now
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
