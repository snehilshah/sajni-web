import type { CSSProperties, ReactNode } from 'react';

import { Check, type LucideIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// The one filter/selector chip (mirrors Android `TonalChip`). Unselected: a
// quiet neutral pill, muted label; the glyph keeps its hue so the chip is
// recognised by shape + colour before the label is read. Selected: a soft
// wash of the hue, a hairline of it (borders carry state) and full-ink
// label. `hue` is any CSS colour; default = theme primary. The glyph mixes
// the hue toward on-surface so it holds contrast in light and dark alike.
export const huePillBase = 'inline-flex shrink-0 items-center gap-1.5 h-9 rounded-full border text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45';
export const huePillOn = 'font-semibold text-foreground border-[color-mix(in_oklab,var(--hue)_45%,transparent)] bg-[color-mix(in_oklab,var(--hue)_16%,hsl(var(--surface)))]';
export const huePillOff = 'font-medium text-muted-foreground border-transparent bg-[hsl(var(--surface-container))] hover:text-foreground hover:bg-[hsl(var(--surface-container-high))]';
export const huePillGlyph = 'size-4 shrink-0 text-[color-mix(in_oklab,var(--hue)_80%,hsl(var(--on-surface)))]';
// Tinted: the chip *is* the colour (categories), so no dot. A faint wash
// of the hue with hue-tinted ink even when unselected; selected deepens the
// wash, adds the hairline and a check. Translucent, so it sits on any surface.
export const huePillTintOff = 'font-medium border-transparent text-[color-mix(in_oklab,var(--hue)_65%,hsl(var(--on-surface)))] bg-[color-mix(in_oklab,var(--hue)_13%,transparent)] hover:bg-[color-mix(in_oklab,var(--hue)_20%,transparent)]';
export const huePillTintOn = 'font-semibold text-foreground border-[color-mix(in_oklab,var(--hue)_70%,transparent)] bg-[color-mix(in_oklab,var(--hue)_30%,transparent)]';
export const hueVar = (hue?: string | null) => ({ '--hue': hue || 'hsl(var(--primary))' }) as CSSProperties;

export function HuePill({
  selected = false, icon: Icon, hue, count, onClick, title, className, children, disabled, tinted = false,
}: {
  selected?: boolean;
  tinted?: boolean;
  icon?: LucideIcon;
  hue?: string | null;
  count?: number | string | null;
  onClick?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={selected}
      style={hueVar(hue)}
      className={cn(
        huePillBase,
        Icon || (tinted && selected) ? 'pl-3 pr-3.5' : 'px-3.5',
        tinted ? (selected ? huePillTintOn : huePillTintOff) : selected ? huePillOn : huePillOff,
        disabled && 'opacity-50',
        className,
      )}
    >
      {Icon && <Icon className={cn(huePillGlyph, !hue && !selected && 'text-current')} aria-hidden />}
      {!Icon && tinted && selected && <Check className={huePillGlyph} aria-hidden />}
      {children}
      {count != null && count !== 0 && count !== '' && (
        <span className={cn('text-xs font-semibold tabular-nums', hue || selected ? 'text-[color-mix(in_oklab,var(--hue)_80%,hsl(var(--on-surface)))]' : 'opacity-70')}>
          {count}
        </span>
      )}
    </button>
  );
}
