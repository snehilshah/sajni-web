import { cn } from '@/lib/utils';

// Shared building blocks for the docs pages. Content components compose
// these; the layout in DocsPage.tsx owns navigation chrome.

// One section per secondary-bar tab (or feature area when a page has no
// tabs). `chip` names the tab it documents.
export function Section({ id, title, chip, children }: {
  id: string;
  title: string;
  chip?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border/60 py-7 first:pt-2 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-xl font-semibold tracking-tight">{title}</h2>
        {chip && (
          <span className="rounded-full bg-[hsl(var(--secondary-container))] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--on-secondary-container))]">
            {chip}
          </span>
        )}
      </div>
      <div className="docs-prose mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90 [&_h3]:mt-2 [&_h3]:font-serif [&_h3]:text-base [&_h3]:font-semibold [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:list-disc [&_em]:text-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

// A single feature: name + how it behaves. The bread and butter of these
// docs — every feature gets one.
export function Feature({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--surface-container-low))] px-4 py-3">
      <h4 className="font-medium text-foreground">{name}</h4>
      <div className="mt-1.5 flex flex-col gap-2 text-sm leading-relaxed text-foreground/85 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-4.5 [&_li]:list-disc">
        {children}
      </div>
    </div>
  );
}

export function FeatureList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-[hsl(var(--surface-container-low))] px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-[hsl(var(--surface-container-high))] px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}

export function Callout({ children, tone = 'note' }: { children: React.ReactNode; tone?: 'note' | 'why' }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm leading-relaxed',
        tone === 'why'
          ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary-container)/0.3)] text-foreground/90'
          : 'border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] text-foreground/85',
      )}
    >
      {tone === 'why' && (
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
          why it works this way
        </span>
      )}
      {children}
    </div>
  );
}

// Small two-column reference table (command → effect, view → meaning …).
export function RefTable({ head, rows }: { head?: [string, string]; rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        {head && (
          <thead>
            <tr className="border-b border-border bg-[hsl(var(--surface-container-low))] text-left">
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{head[0]}</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{head[1]}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-foreground">{a}</td>
              <td className="px-3 py-2 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
