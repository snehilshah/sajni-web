import { type ReactNode } from 'react';

// PageShell — single source of truth for the top page chrome.
// Sticky h-14 (mobile) / h-16 (desktop) bar: caption mono + title serif on
// the left, actions slot on the right. Body scrolls inside a centered
// max-w-6xl gutter, identical across pages.
export default function PageShell({
  caption, title, actions, children, contentClassName,
}: {
  caption?: ReactNode;
  title: ReactNode;
  /** Deprecated — fold into caption. Kept so existing call sites compile. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="page-fade-in flex-1 flex flex-col min-h-0">
      <header
        className="sticky top-0 z-20 h-14 md:h-16 border-b border-border bg-background flex items-center gap-3 px-4 md:px-8 shrink-0"
      >
        <div className="min-w-0 flex-1">
          {caption && (
            <div className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground leading-none truncate">
              {caption}
            </div>
          )}
          <h1 className="serif text-base md:text-lg font-semibold tracking-tight leading-tight truncate mt-0.5">
            {title}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className={contentClassName ?? 'max-w-6xl w-full mx-auto px-4 md:px-8 pt-6 md:pt-8 pb-20 flex flex-col gap-6'}>
          {children}
        </div>
      </div>
    </div>
  );
}
