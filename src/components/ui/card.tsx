import * as React from 'react';

import { cn } from '@/lib/utils';

// M3 card surface. DESIGN.md has pointed at this file for a while; until now
// every card was a hand-rolled class string, which is why radii and hover
// states drifted apart across the finance tabs.
//
// Radius is `rounded-xl` (20px) deliberately. The project's M3 scale maps
// 2xl to 28px and reserves it for dialogs and sheets — a 28px radius on a
// list-sized card reads as a lozenge, not a card.
//
// Identity colour is never a left border. A thick border on a rounded box
// tapers into a wedge at the corners; `accent` draws an inset pill instead.

type Variant = 'outlined' | 'filled' | 'elevated';

const SURFACE: Record<Variant, string> = {
  // Outlined is the default: quiet, and the one that stacks safely inside
  // another surface without a tonal pile-up.
  outlined: 'border border-border bg-card',
  filled: 'border border-transparent bg-[hsl(var(--surface-container))]',
  elevated: 'border border-transparent bg-[hsl(var(--surface-container-low))] m3-elev-1',
};

export interface CardOptions {
  variant?: Variant;
  /** Adds hover, press and focus feedback. Pair with a real button/role. */
  interactive?: boolean;
  /** Identity colour (account, slate, category). Renders as an inset pill. */
  accent?: string;
}

/** Class string for callers that need their own element — a `motion.div`
 *  wanting `layout`, or a `<button>`. `<Card>` is the same thing on a div. */
export function cardClass({ variant = 'outlined', interactive, accent }: CardOptions = {}, className?: string) {
  return cn(
    'relative rounded-xl transition-colors',
    SURFACE[variant],
    accent && 'pl-5',
    interactive && [
      'cursor-pointer outline-none tap-highlight-none',
      'hover:bg-[hsl(var(--surface-container))]',
      'focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
    ],
    className,
  );
}

/** The inset identity pill. Rendered by `<Card>`; callers using `cardClass`
 *  place it themselves as the first child. */
export function CardAccent({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute left-2 top-3 bottom-3 w-1 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & CardOptions>(
  function Card({ variant, interactive, accent, className, children, ...props }, ref) {
    return (
      <div ref={ref} data-slot="card" className={cardClass({ variant, interactive, accent }, className)} {...props}>
        {accent && <CardAccent color={accent} />}
        {children}
      </div>
    );
  },
);
