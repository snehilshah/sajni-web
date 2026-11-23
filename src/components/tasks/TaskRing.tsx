import { useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Task } from '@/types';
import { PRIORITY_HUE, maxColors } from './look';
import { cn } from '@/lib/utils';

// A task's ring, as on the phone: To do dashed, In progress a plain outline,
// Blocked crossed through (sand), Done filled sage with a check. The ring is
// in the priority's colour (or the task's own); Max's ring runs through its
// gradient. No dots.
export function TaskRing({
  status,
  priority,
  color,
  size = 24,
  className,
}: {
  status: Task['status'];
  priority: Task['priority'];
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const done = status === 'done';
  const max = !color && priority === 'max';
  const hue = color || PRIORITY_HUE[priority];
  const stroke = done ? 'var(--task-sage)' : max ? `url(#${gid})` : hue;
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={cn('shrink-0 overflow-visible', className)}
    >
      {max && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            {maxColors().map((c, i, all) => (
              <stop key={c} offset={i / (all.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      <circle
        cx="12"
        cy="12"
        r={r}
        fill={
          done
            ? 'var(--task-sage)'
            : status === 'scratched'
              ? 'none'
              : `color-mix(in oklab, ${max ? 'var(--task-max)' : hue} 12%, transparent)`
        }
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={status === 'todo' ? `${c / 16} ${c / 16}` : undefined}
        strokeLinecap="round"
        style={{ transition: 'fill 200ms, stroke 200ms' }}
      />
      {status === 'blocked' && (
        <line x1="5.5" y1="18.5" x2="18.5" y2="5.5" stroke="var(--task-sand)" strokeWidth="2" strokeLinecap="round" />
      )}
      <AnimatePresence>
        {done && (
          <motion.path
            d="M7.5 12.5l3 3 6-6.5"
            fill="none"
            stroke="var(--task-sage-c)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
          />
        )}
      </AnimatePresence>
    </svg>
  );
}
