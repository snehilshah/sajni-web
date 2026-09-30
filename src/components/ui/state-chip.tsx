import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// Semantic tone (THEME.md "Colour roles"). Neutral is the default and the
// most common; only exceptions get colour, so the one that matters stands out.
export type BadgeTone = 'neutral' | 'accent' | 'alert' | 'positive';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[hsl(var(--on-surface-variant)/0.10)] text-[hsl(var(--on-surface-variant))] font-medium',
  accent: 'bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] font-semibold',
  alert: 'bg-[hsl(var(--error)/0.14)] text-[hsl(var(--error))] font-semibold',
  positive: 'bg-[hsl(var(--color-complete)/0.14)] text-[hsl(var(--color-complete))] font-semibold',
};

/** Small tonal badge for a category the eye should find without reading:
 *  a due date ("Today", "Fri", "Overdue"), a cadence, a count ("0/3").
 *  Default states get no badge at all. */
export function DateBadge({ children, tone = 'neutral', icon, className }: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-xs leading-5 whitespace-nowrap [&>svg]:size-3',
        BADGE_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const CHIP_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[hsl(var(--surface-container-high))] text-[hsl(var(--on-surface-variant))] font-medium',
  accent: BADGE_TONE.accent,
  alert: BADGE_TONE.alert,
  positive: BADGE_TONE.positive,
};

/** Live page state ("1 overdue", "6 open"). With `onClick` it is a filter
 *  or a jump, so the state is also the control; `selected` uses the single
 *  selection role (secondary-container). */
export function StateChip({ children, tone = 'neutral', selected, onClick, className }: {
  children: ReactNode;
  tone?: BadgeTone;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(
    'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors',
    selected
      ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] font-semibold'
      : CHIP_TONE[tone],
    className,
  );
  if (!onClick) return <span className={cls}>{children}</span>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(cls, 'outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/45 active:scale-[0.98]')}
    >
      {children}
    </button>
  );
}
