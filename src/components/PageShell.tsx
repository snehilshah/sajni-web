import { type ComponentType, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

// PageShell — single source of truth for the top page chrome.
// Sticky Material 3 app bar: caption mono + title serif on the left,
// actions on the right, optional page-level navigation below. Body scrolls
// inside a centered max-w-6xl gutter, identical across pages.
export default function PageShell({
  caption, title, subtitle, actions, navigation, children, contentClassName, headerClassName, hideScrollbar = false,
}: {
  caption?: ReactNode;
  title: ReactNode;
  /** Deprecated - fold into caption. Kept so existing call sites compile. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  headerClassName?: string;
  hideScrollbar?: boolean;
}) {
  const eyebrow = caption ?? subtitle;

  return (
    <div className="page-fade-in flex-1 flex flex-col min-h-0">
      <header
        className={cn(
          'sticky top-0 z-20 shrink-0 border-b border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low)/0.96)] backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--surface-container-low)/0.9)]',
          headerClassName,
        )}
      >
        <div className="min-h-14 md:min-h-16 w-full max-w-6xl mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 md:px-8">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mono text-[10px] md:text-xs uppercase tracking-[0.22em] text-muted-foreground leading-none truncate">
                {eyebrow}
              </div>
            )}
            <h1 className="serif text-base md:text-lg font-semibold tracking-tight leading-tight truncate mt-0.5">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="min-w-0 max-w-[52vw] sm:max-w-none flex items-center justify-end gap-1.5 sm:gap-2 overflow-hidden">
              {actions}
            </div>
          )}
        </div>
        {navigation && (
          <div className="w-full max-w-6xl mx-auto min-w-0 overflow-hidden px-4 md:px-8 pb-3">
            {navigation}
          </div>
        )}
      </header>

      <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', hideScrollbar && 'no-scrollbar')}>
        <div className={contentClassName ?? 'max-w-6xl w-full mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-20 flex flex-col gap-6'}>
          {children}
        </div>
      </div>
    </div>
  );
}

export interface PageShellTabOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export function PageShellTabs<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: V;
  options: readonly PageShellTabOption<V>[];
  onChange: (value: V) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn('max-w-full min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar', className)}>
      <div className="flex w-max max-w-none mx-auto items-center gap-1 rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-current={active ? 'page' : undefined}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'h-9 sm:h-10 rounded-[22px] inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 text-xs sm:text-sm font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50',
                active
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] shadow-[var(--m3-elev-1)]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground',
              )}
            >
              {Icon && <Icon className="size-3.5 shrink-0" />}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
