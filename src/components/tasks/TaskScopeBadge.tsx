import type { Task } from '@/types';
import { cn } from '@/lib/utils';

type TaskScope = 'day' | 'week' | 'month';
type ScopeSource = Pick<Task, 'due_date' | 'week_of' | 'month_of'>;
type Props = (
  | { task: ScopeSource; scope?: never }
  | { task?: never; scope: TaskScope }
) & { className?: string };

const scopes = {
  day: { letter: 'D', label: 'Day task', colors: 'bg-primary-container text-on-primary-container border-primary/40' },
  week: { letter: 'W', label: 'Week task', colors: 'bg-secondary-container text-on-secondary-container border-secondary/40' },
  month: { letter: 'M', label: 'Month task', colors: 'bg-tertiary-container text-on-tertiary-container border-tertiary/40' },
} as const;

export default function TaskScopeBadge(props: Props) {
  const scope = props.scope ?? (props.task?.due_date ? 'day'
    : props.task?.week_of ? 'week'
    : props.task?.month_of ? 'month' : null);
  if (!scope) return null;
  const { letter, label, colors } = scopes[scope];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border text-xs font-semibold leading-none no-underline', colors, props.className)}
    >
      {letter}
    </span>
  );
}
