import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// Headline figures for a finance tab. One segmented group (tiles 2px apart,
// outer 20px / inner 6px) rather than a row of free-standing cards, so the
// figures read as one summary and nothing floats.

export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-0.5 overflow-hidden rounded-xl', className)}>{children}</div>;
}

const TONE = {
  default: '',
  primary: 'text-primary',
  destructive: 'text-destructive',
} as const;

export function Stat({ label, value, tone = 'default', className }: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-md bg-card px-4 py-3', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* A figure never wraps: a sign or currency symbol alone on a line reads
          as a different number. */}
      <div className={cn('mt-0.5 whitespace-nowrap font-serif text-2xl font-semibold tabular-nums', TONE[tone])}>
        {value}
      </div>
    </div>
  );
}
