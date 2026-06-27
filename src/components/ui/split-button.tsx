import * as React from 'react';
import { ChevronDown } from '@/components/ui/icons';

import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * M3 Expressive Split Button.
 *
 *  ┌────────────────┬───┐
 *  │  Primary       │ ⌄ │
 *  └────────────────┴───┘
 *
 *  Left segment = primary action (most common choice).
 *  Right segment = chevron that opens a menu of alternatives.
 *  Both segments share a pill body — the chevron rotates 180° on press
 *  for an expressive flourish.
 */

export interface SplitButtonOption<V extends string = string> {
  value: V;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface SplitButtonProps<V extends string = string> {
  value: V;
  options: SplitButtonOption<V>[];
  onChange: (v: V) => void;
  onPrimary?: () => void;
  className?: string;
  size?: 'sm' | 'default';
  iconOnly?: boolean;
  /**
   * tonal | filled | outlined — defaults to tonal (M3 secondary-container).
   */
  variant?: 'tonal' | 'filled' | 'outlined';
}

export function SplitButton<V extends string = string>({
  value, options, onChange, onPrimary, className, size = 'default', iconOnly = false, variant = 'tonal',
}: SplitButtonProps<V>) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  const h = size === 'sm' ? 'h-9' : 'h-11';
  const px = size === 'sm' ? 'px-3' : 'px-4';

  const bgClasses =
    variant === 'filled'   ? 'bg-primary text-primary-foreground hover:brightness-105' :
    variant === 'outlined' ? 'border border-[hsl(var(--outline))] text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]' :
                              'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:brightness-[0.97]';

  const divider =
    variant === 'filled'   ? 'bg-primary-foreground/30' :
    variant === 'outlined' ? 'bg-[hsl(var(--outline))]' :
                              'bg-[hsl(var(--on-secondary-container))]/20';

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <button
        type="button"
        onClick={onPrimary ?? (() => setOpen(true))}
        className={cn(
          'inline-flex items-center justify-center rounded-l-full font-medium text-sm tracking-[0.005em] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97]',
          h, iconOnly ? (size === 'sm' ? 'w-9 px-0' : 'w-11 px-0') : px, bgClasses,
        )}
        title={current?.label}
        aria-label={current?.label}
      >
        <span className="grid grid-cols-1 grid-rows-1 items-center justify-center">
          {options.map((o) => {
            const O = o.icon;
            const isActive = o.value === value;
            return (
              <span
                key={o.value}
                aria-hidden={!isActive}
                className={cn(
                  'col-start-1 row-start-1 inline-flex items-center gap-2 transition-opacity duration-200 ease-in-out',
                  isActive ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
              >
                {O && <O className="size-4" />}
                {!iconOnly && <span className="whitespace-nowrap">{o.label}</span>}
              </span>
            );
          })}
        </span>
      </button>
      <span className={cn('w-px self-center', divider)} style={{ height: '60%' }} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center rounded-r-full transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.95]',
                h, size === 'sm' ? 'w-9' : 'w-11',
                bgClasses,
              )}
              aria-label="More options"
            >
              <span className={cn('transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]', open && 'rotate-180')}>
                <ChevronDown className="size-4" />
              </span>
            </button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-44">
          {options.map((o) => {
            const O = o.icon;
            return (
              <DropdownMenuItem
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                data-active={o.value === value}
              >
                {O && <O className="size-4 mr-1.5 opacity-80" />}
                {o.label}
                {o.value === value && <span className="ml-auto mono text-xs text-muted-foreground">●</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
