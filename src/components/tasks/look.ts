import type { Task } from '@/types';

// Tasks' calm look, shared with the phone (Android `ui/components/TaskLook.kt`).
// Status: In progress wears the theme's own colour softened, Blocked sand,
// Done sage; no red for a status (only overdue dates keep the error colour).
// The tones are CSS variables (index.css `--task-*`), light and dark.
// Priority: low < medium < high < max; max has no single colour, it flows
// (`FlowFill` with MAX_COLORS).

export const PRIORITIES: Task['priority'][] = ['low', 'medium', 'high', 'max'];

export const PRIORITY_LABEL: Record<Task['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
};

/** A priority's colour (max: its leading hue, for places that need one). */
export const PRIORITY_HUE: Record<Task['priority'], string> = {
  low: 'hsl(var(--outline))',
  medium: 'var(--task-medium)',
  high: 'var(--task-high)',
  max: 'var(--task-max)',
};

/** Max's colours: ember, magenta, violet, electric blue. */
export function maxColors(): string[] {
  return isDark() ? ['#ff5a1f', '#ff2e7e', '#9b5cff', '#3d8bff'] : ['#e8400c', '#e0115f', '#7b2ff2', '#1f6feb'];
}

/** Max as a still gradient (rings, the slider's label, group marks). */
export function maxGradient(angle = '90deg'): string {
  return `linear-gradient(${angle}, ${maxColors().join(', ')})`;
}

/** Done's living fill: deep sage, bright sage, mid sage, mint. */
export function doneColors(): string[] {
  return isDark() ? ['#2e5a3e', '#6faf85', '#3f7a55', '#4f9e86'] : ['#4e8a63', '#8dc29e', '#6fa582', '#79b9a2'];
}

export function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.mode === 'dark';
}

/** Container + text for a status: the In progress card, chips, the status row. */
export const STATUS_TONE: Record<'todo' | 'in_progress' | 'blocked' | 'done', { bg: string; fg: string }> = {
  todo: { bg: 'hsl(var(--secondary-container))', fg: 'hsl(var(--on-secondary-container))' },
  in_progress: { bg: 'var(--task-prog-c)', fg: 'hsl(var(--on-primary-container))' },
  blocked: { bg: 'var(--task-sand-c)', fg: 'var(--task-sand-on)' },
  done: { bg: 'var(--task-sage-c)', fg: 'var(--task-sage-on)' },
};
