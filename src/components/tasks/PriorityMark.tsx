import type { Task } from '@/types';
import { PRIORITY_HUE, maxGradient } from './look';

/** A priority group's mark: a small ring in its colour (Max: its gradient). */
export function PriorityMark({ priority }: { priority: Task['priority'] }) {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full"
      style={
        priority === 'max'
          ? {
              background: maxGradient('135deg'),
              mask: 'radial-gradient(circle, transparent 3.5px, #000 4px)',
              WebkitMask: 'radial-gradient(circle, transparent 3.5px, #000 4px)',
            }
          : { boxShadow: `inset 0 0 0 2px ${PRIORITY_HUE[priority]}` }
      }
    />
  );
}
