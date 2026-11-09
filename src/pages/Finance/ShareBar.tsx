import { cn } from '@/lib/utils';

/** Parts of a whole as one rounded bar, each part in its colour. */
export function ShareBar({ parts, className }: {
  parts: { key: string; label: string; value: number; color?: string | null }[];
  className?: string;
}) {
  return (
    <div className={cn('flex h-3 gap-0.5 overflow-hidden rounded-full', className)}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.key} title={p.label} className="h-full min-w-1"
          style={{ flexGrow: p.value, flexBasis: 0, backgroundColor: p.color || 'hsl(var(--outline))' }} />
      ))}
    </div>
  );
}
