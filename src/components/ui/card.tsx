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
// Identity colour is never a left border or bar; `accent` draws a soft
// corner wash of the colour behind the content instead.

type Variant = 'outlined' | 'filled' | 'elevated';

const SURFACE: Record<Variant, string> = {
  // Filled (tonal, borderless) is the default: separation comes from tone,
  // not lines (DESIGN.md). Outlined is for a *state* (selected, drop target).
  // Never nest a Card inside a Card — use a section inside one surface.
  outlined: 'bg-card',
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
export function cardClass({ variant = 'filled', interactive, accent }: CardOptions = {}, className?: string) {
  return cn(
    'relative rounded-xl transition-colors',
    SURFACE[variant],
    // Accent = soft identity wash behind content (see CardAccent); isolate
    // keeps the wash's negative z-index inside this card.
    accent && 'isolate overflow-hidden',
    interactive && [
      'cursor-pointer outline-none tap-highlight-none',
      'hover:bg-[hsl(var(--surface-container-high))]',
      'focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
    ],
    className,
  );
}

/** Identity accent: the colour washes in from the top-left corner and fades
 *  out, behind the content. Replaces the inset left bar, which tapered
 *  awkwardly against rounded corners and duplicated the icon tile's colour.
 *  Rendered by `<Card>`; callers using `cardClass` place it as a child. */
export function CardAccent({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background: `radial-gradient(130% 110% at 0% 0%, color-mix(in srgb, ${color} 22%, transparent), transparent 62%)`,
      }}
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
