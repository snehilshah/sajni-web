import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

import StartDoc, { startMeta } from './StartDoc';
import TodayDoc, { todayMeta } from './TodayDoc';
import NotesDoc, { notesMeta } from './NotesDoc';
import JournalDoc, { journalMeta } from './JournalDoc';
import TasksDoc, { tasksMeta } from './TasksDoc';
import HabitsDoc, { habitsMeta } from './HabitsDoc';
import ProjectsDoc, { projectsMeta } from './ProjectsDoc';
import MediaDoc, { mediaMeta } from './MediaDoc';
import FinanceDoc, { financeMeta } from './FinanceDoc';
import AnalyticsDoc, { analyticsMeta } from './AnalyticsDoc';
import AiDoc, { aiMeta } from './AiDoc';
import SettingsDoc, { settingsMeta } from './SettingsDoc';

// The Sajni field guide — one docs page per primary-nav space (plus the
// cross-cutting Start / Ask Sajni / Settings pages), each broken into
// sections that mirror the space's secondary bar. Serves as user-facing
// AND internal reference: content lives in the *Doc.tsx files; when a
// feature changes, change its section.

interface PageMeta {
  id: string; // URL segment; '' = /docs root
  label: string;
  title: string;
  blurb: string;
  sections: { id: string; label: string }[];
}

interface PageDef {
  meta: PageMeta;
  Component: () => React.ReactNode;
}

const GROUPS: { name: string; pages: PageDef[] }[] = [
  {
    name: 'Guide',
    pages: [{ meta: startMeta, Component: StartDoc }],
  },
  {
    name: 'Spaces',
    pages: [
      { meta: todayMeta, Component: TodayDoc },
      { meta: notesMeta, Component: NotesDoc },
      { meta: journalMeta, Component: JournalDoc },
      { meta: tasksMeta, Component: TasksDoc },
      { meta: habitsMeta, Component: HabitsDoc },
      { meta: projectsMeta, Component: ProjectsDoc },
      { meta: mediaMeta, Component: MediaDoc },
      { meta: financeMeta, Component: FinanceDoc },
      { meta: analyticsMeta, Component: AnalyticsDoc },
    ],
  },
  {
    name: 'System',
    pages: [
      { meta: aiMeta, Component: AiDoc },
      { meta: settingsMeta, Component: SettingsDoc },
    ],
  },
];

const PAGES: PageDef[] = GROUPS.flatMap((g) => g.pages);

const pathFor = (id: string) => (id ? `/docs/${id}` : '/docs');

export default function DocsPage() {
  const { page } = useParams<{ page?: string }>();
  const current = PAGES.find((p) => p.meta.id === (page ?? '')) ?? PAGES[0];
  const idx = PAGES.indexOf(current);
  const prev = idx > 0 ? PAGES[idx - 1] : null;
  const next = idx < PAGES.length - 1 ? PAGES[idx + 1] : null;
  const { meta, Component } = current;

  // New page → top; #hash → its section (anchors within a page still work).
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [meta.id]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Masthead */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/docs" className="group flex items-baseline gap-2.5 outline-none">
            <span className="font-serif text-lg font-semibold tracking-tight group-hover:text-[hsl(var(--primary))] transition-colors">
              Sajni
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              field guide
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-full bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--on-primary))] transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 outline-none"
          >
            Open Sajni
          </Link>
        </div>
      </header>

      {/* Mobile page picker — horizontal chip row */}
      <nav aria-label="Docs pages" className="border-b border-border md:hidden">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 py-2.5">
          {PAGES.map((p) => (
            <Link
              key={p.meta.id}
              to={pathFor(p.meta.id)}
              aria-current={p === current ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors outline-none',
                'focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                p === current
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground',
              )}
            >
              {p.meta.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl gap-10 px-5 py-8">
        {/* Page rail (desktop) */}
        <nav aria-label="Docs pages" className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-8 flex flex-col gap-5">
            {GROUPS.map((g) => (
              <div key={g.name}>
                <div className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {g.name}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {g.pages.map((p) => (
                    <li key={p.meta.id}>
                      <Link
                        to={pathFor(p.meta.id)}
                        aria-current={p === current ? 'page' : undefined}
                        className={cn(
                          'block rounded-lg px-2.5 py-1.5 text-sm transition-colors outline-none',
                          'hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                          p === current
                            ? 'bg-[hsl(var(--secondary-container))] font-medium text-[hsl(var(--on-secondary-container))]'
                            : 'text-muted-foreground',
                        )}
                      >
                        {p.meta.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-16">
          <header>
            <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">
              {meta.title}
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {meta.blurb}
            </p>
            {/* On-this-page: one chip per section (the space's secondary bar) */}
            {meta.sections.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {meta.sections.map((s) => (
                  <a
                    key={s.id}
                    href={'#' + s.id}
                    className="rounded-full border border-[hsl(var(--outline-variant))] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:border-[hsl(var(--primary))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </header>

          <div className="mt-4">
            <Component />
          </div>

          {/* Prev / next */}
          <footer className="mt-10 flex items-stretch justify-between gap-3">
            {prev ? (
              <Link
                to={pathFor(prev.meta.id)}
                className="group flex min-h-11 flex-col justify-center rounded-xl border border-border px-4 py-2.5 outline-none transition-colors hover:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">‹ previous</span>
                <span className="text-sm font-medium group-hover:text-[hsl(var(--primary))]">{prev.meta.label}</span>
              </Link>
            ) : <span />}
            {next ? (
              <Link
                to={pathFor(next.meta.id)}
                className="group flex min-h-11 flex-col items-end justify-center rounded-xl border border-border px-4 py-2.5 text-right outline-none transition-colors hover:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">next ›</span>
                <span className="text-sm font-medium group-hover:text-[hsl(var(--primary))]">{next.meta.label}</span>
              </Link>
            ) : <span />}
          </footer>
        </main>
      </div>
    </div>
  );
}
