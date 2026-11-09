import type { ReactNode, Ref } from 'react';

import { cn } from '@/lib/utils';

/**
 * The status line shown under the Notes and Journal editors while Vim keys
 * are on. A fixed row of the page, never an overlay.
 *
 *   [mode ⟩ save]  keys / prompt  message        [facts ⟩ … ⟩ view]  ⋯
 *
 * Each side is a chain of rounded pieces that overlap by one radius, so every
 * join is a curve (editor.css → .sajni-chain). Vim fills the mode slot, the
 * keys / prompt slot and the message slot; the page passes the rest.
 */
export default function VimStatusBar({ ref, leading, status, children, trailing, className }: {
  ref?: Ref<HTMLDivElement>;
  leading?: ReactNode;
  /** Pieces tucked under the mode chip (the save state). */
  status?: ReactNode;
  /** The right-hand chain: StatusSeg pieces, optionally ending in a SegmentedButton. */
  children?: ReactNode;
  /** Plain buttons after the right chain (⋯, details). */
  trailing?: ReactNode;
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
      <div className="sajni-chain">
        <span data-vim-mode className="contents" />
        {status}
      </div>
      <div data-vim-left className="sajni-vim-text flex min-w-0 items-center gap-2" />
      <div data-vim-msg className="sajni-vim-text min-w-0 flex-1 truncate" role="status" aria-live="polite" />
      {children && <div className="sajni-chain rtl">{children}</div>}
      {trailing}
    </div>
  );
}

/** One piece of a status chain. `tone` 1–3 runs from the bar's colour towards the lightest piece. */
export function StatusSeg({ children, tone = 1, onClick, title, className }: {
  children: ReactNode;
  tone?: 1 | 2 | 3;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} data-tone={tone} className={cn('sajni-seg is-button', className)}>
        {children}
      </button>
    );
  }
  return <span title={title} data-tone={tone} className={cn('sajni-seg', className)}>{children}</span>;
}
