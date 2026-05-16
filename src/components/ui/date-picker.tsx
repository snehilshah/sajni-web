import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parseISO } from "date-fns"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * M3 outlined date field. Drop-in replacement for `<Input type="date" />`.
 *
 *  value / onChange use ISO `YYYY-MM-DD` strings (matches HTML date input contract).
 */
export interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
}

function isoToDate(iso?: string): Date | undefined {
  if (!iso) return undefined
  try {
    return parseISO(iso)
  } catch {
    return undefined
  }
}

function dateToIso(d?: Date): string {
  if (!d) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = isoToDate(value)
  const display = selected ? format(selected, "EEE, d MMM") : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "group inline-flex h-11 w-full items-center justify-between gap-2",
          "rounded-xl border border-[hsl(var(--outline))] bg-transparent px-3.5 py-2.5 text-sm",
          "text-foreground transition-[border-color,box-shadow,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:border-[hsl(var(--on-surface))]",
          "data-[popup-open]:border-2 data-[popup-open]:border-primary data-[popup-open]:px-[13px]",
          "disabled:opacity-50 disabled:pointer-events-none",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{display}</span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange?.(dateToIso(d))
            setOpen(false)
          }}
          captionLayout="dropdown-months"
        />
      </PopoverContent>
    </Popover>
  )
}
