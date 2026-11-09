import type { ReactNode, Ref } from 'react';

import { cn } from '@/lib/utils';

/**
 * The status line shown under the Notes and Journal editors while Vim keys
 * are on. A fixed row of the page, never an overlay: Vim fills the left slot
 * (mode, half-typed keys, ":" and "/" prompts) and the message slot; the page
 * puts its own controls on the right.
 */
export default function VimStatusBar({ ref, leading, status, children, className }: {
  ref?: Ref<HTMLDivElement>;
  leading?: ReactNode;
  /** Right after the mode chip (the note's save state), so nothing else moves when it changes. */
  status?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        'sajni-vim-status flex h-9 shrink-0 items-center gap-3 border-t border-[hsl(var(--outline-variant)/0.5)] bg-[hsl(var(--surface-container-low))] px-3 text-xs text-muted-foreground',
        className,
      )}
    >
      {leading}
      <span data-vim-mode className="flex shrink-0 items-center" />
      {status}
      <div data-vim-left className="sajni-vim-text flex min-w-0 items-center gap-2" />
      <div data-vim-msg className="sajni-vim-text min-w-0 flex-1 truncate" role="status" aria-live="polite" />
      {children && <div className="flex shrink-0 items-center gap-1 tabular-nums">{children}</div>}
    </div>
  );
}
