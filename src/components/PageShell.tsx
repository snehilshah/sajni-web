import { type ReactNode } from 'react';

// PageShell — the one place that defines page padding, max-width and
// hero-block placement. Every top-level page renders its content
// inside this so heading position, vertical rhythm and side gutters
// stay identical across tabs (no sticky-vs-inline split, no random
// max-w-Nxl variations).
export default function PageShell({
  caption, title, subtitle, actions, children,
}: {
  caption?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-fade-in max-w-6xl w-full mx-auto px-4 md:px-12 pt-10 md:pt-14 pb-20 flex flex-col gap-7">
      <header className="flex items-end justify-between gap-4 flex-wrap pl-12 md:pl-0">
        <div className="min-w-0">
          {caption && (
            <div className="mono text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
              {caption}
            </div>
          )}
          <h1 className="serif text-3xl md:text-4xl font-medium tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && (
            <div className="serif italic text-sm md:text-base text-muted-foreground mt-2">
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
