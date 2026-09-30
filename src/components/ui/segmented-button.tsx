import * as React from 'react';
import { Check } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * M3 Expressive Segmented Button.
 *
 *  ┌────────┬────────┐
 *  │ ✓ Day  │  Week  │
 *  └────────┴────────┘
 *
 * A connected row of options where exactly one is selected — the single-select
 * toggle from m3.material.io/components/segmented-buttons. Outlined pill body,
 * shared dividers, selected segment filled with the secondary container and an
 * optional leading check (M3 spec). Use for binary/short mode switches; for a
 * primary-action-plus-alternatives use `SplitButton` instead.
 */

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface SegmentedButtonProps<V extends string = string> {
  value: V;
  options: SegmentedOption<V>[];
  onChange: (v: V) => void;
  /** sm = compact (h-6, inline toggles); md = standard control height (h-9). */
  size?: 'sm' | 'md';
  /** M3 shows a check on the selected segment; drop it where width is tight. */
  showCheck?: boolean;
  /** Fill the container width with equal-width segments (full-row M3 group). */
  stretch?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SegmentedButton<V extends string = string>({
  value, options, onChange, size = 'md', showCheck = true, stretch = false, className, ...props
}: SegmentedButtonProps<V>) {
  const compact = size === 'sm';
  const iconSize = compact ? 'size-3' : 'size-4';
  return (
    <div
      role="group"
      className={cn(
        // Tonal track, no outline or dividers: the selected segment is the
        // only fill that changes (secondary-container), like Android's
        // connected toggle row.
        'items-stretch overflow-hidden rounded-full bg-[hsl(var(--surface-container-high))] p-0.5 gap-0.5',
        stretch ? 'flex w-full' : 'inline-flex shrink-0',
        className,
      )}
      {...props}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        const showLeading = active && showCheck;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium',
              'transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none',
              'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
              'rounded-full',
              stretch && 'flex-1',
              compact ? 'h-6 px-2.5 text-[11px]' : 'h-9 px-4 text-sm',
              active
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
            )}
          >
            {showLeading
              ? <Check className={iconSize} strokeWidth={2.5} />
              : Icon ? <Icon className={iconSize} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
