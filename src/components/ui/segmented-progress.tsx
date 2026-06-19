import { cn } from '@/lib/utils';

type ProgressState = 'active' | 'complete' | 'dropped';
type ProgressVariant = 'row' | 'wrap';

interface SegmentedProgressProps {
  value: number;
  total: number;
  /** Number of meaningful chunks, e.g. a show's seasons. */
  units?: number;
  state?: ProgressState;
  height?: number;
  variant?: ProgressVariant;
  className?: string;
  label?: string;
  showLabel?: boolean;
}

// Shared M3-style indicator. It reports progress by meaningful chunks instead
// of a generic fill, so a task's subtasks and a show's seasons read alike.
export function SegmentedProgress({
  value,
  total,
  units,
  state = 'active',
  height = 6,
  variant = 'row',
  className,
  label,
  showLabel = false,
}: SegmentedProgressProps) {
  if (total <= 0) return null;

  const safeValue = Math.min(total, Math.max(0, value));
  const segmentCount = Math.max(1, units && units > 0 ? units : Math.min(10, total));
  const perSegment = total / segmentCount;
  const percent = Math.round((safeValue / total) * 100);
  const gap = variant === 'row' ? '3px' : '4px';

  const colorFor = (index: number) => {
    const end = (index + 1) * perSegment;
    const start = index * perSegment;
    if (state === 'complete') return 'var(--progress-complete)';
    if (state === 'dropped') return safeValue >= end ? 'var(--progress-dropped)' : 'var(--progress-idle)';
    if (safeValue >= end) return 'var(--progress-complete)';
    if (safeValue > start) return 'var(--progress-active)';
    return 'var(--progress-idle)';
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {showLabel && (
        <div className="flex items-center justify-between gap-2 mono text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 tabular-nums">{safeValue}/{total} · {percent}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label || 'Progress'}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={safeValue}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${segmentCount}, minmax(0, 1fr))`, gap }}
      >
        {Array.from({ length: segmentCount }, (_, index) => (
          <span
            key={index}
            className="block rounded-full transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
            style={{ height, background: colorFor(index) }}
          />
        ))}
      </div>
    </div>
  );
}
