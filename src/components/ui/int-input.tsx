import * as React from "react"

import { Input } from "@/components/ui/input"

type IntInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}

/**
 * A whole-number field that keeps what the user types. Clearing it leaves it
 * empty: nothing is reported, so no "0" or "1" is written back ahead of the
 * caret (and 53 never becomes 530). Leaving it empty restores the current
 * value. It follows `value` when that changes from outside.
 */
function IntInput({ value, onChange, min = 0, max, onBlur, ...props }: IntInputProps) {
  const [draft, setDraft] = React.useState(String(value))
  // Adopt an outside change; our own reports already match the draft.
  const [seen, setSeen] = React.useState(value)
  if (value !== seen) {
    setSeen(value)
    if (Number.parseInt(draft, 10) !== value) setDraft(String(value))
  }
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 9)
        setDraft(digits)
        if (digits === "") return
        const n = Number.parseInt(digits, 10)
        const clamped = Math.max(min, max === undefined ? n : Math.min(max, n))
        if (clamped !== n) setDraft(String(clamped))
        if (clamped !== value) onChange(clamped)
      }}
      onBlur={(e) => {
        if (draft === "") setDraft(String(value))
        onBlur?.(e)
      }}
    />
  )
}

export { IntInput }
