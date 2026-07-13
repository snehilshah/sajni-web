import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

// The Sajni changelog — a standalone, public page (same shell family as
// /docs). Newest release first; every change is one Entry tagged New /
// Improved / Fixed. When you ship something, add an Entry — however small.

type Kind = 'feature' | 'improvement' | 'fix';

interface Entry {
  kind: Kind;
  /** The space it touches: Library, Navigation, Tasks, Habits … */
  area: string;
  title: string;
  detail: string;
}

interface Release {
  version: string;
  /** ISO date, shown as-is. */
  date: string;
  summary: string;
  entries: Entry[];
}

const KIND_META: Record<Kind, { label: string; group: string; tag: string; dot: string }> = {
  feature: {
    label: 'New',
    group: 'Features',
    tag: 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
    dot: 'bg-[hsl(var(--primary))]',
  },
  improvement: {
    label: 'Improved',
    group: 'Improvements',
    tag: 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
    dot: 'bg-[hsl(var(--secondary))]',
  },
  fix: {
    label: 'Fixed',
    group: 'Fixes',
    tag: 'bg-[hsl(var(--color-waiting)/0.18)] text-[hsl(var(--color-waiting))]',
    dot: 'bg-[hsl(var(--color-waiting))]',
  },
};

const GROUP_ORDER: Kind[] = ['feature', 'improvement', 'fix'];

const RELEASES: Release[] = [
  {
    version: '0.40.0',
    date: '2026-07-14',
    summary:
      'The first tracked release. A new sliding hover highlight across the navigation, a friendlier '
      + 'media library, and a sweep of layout and polish fixes.',
    entries: [
      // ── Features ──────────────────────────────────────────────────────
      {
        kind: 'feature',
        area: 'Navigation',
        title: 'Sliding hover highlight on the bars',
        detail:
          'The primary icon bar and the page tabs now show a faint highlight that glides to whatever '
          + 'you hover, separate from the solid marker on the page you are actually on. It appears in '
          + 'place when your cursor enters a bar, travels only when you move between items, and '
          + 'disappears in place when you leave — never flying in from the edge. On the primary bar the '
          + 'highlight is a circle that stays centred under the magnifying dock icons and is sized to '
          + 'frame the enlarged icon. It respects the reduced-motion setting.',
      },

      // ── Improvements ──────────────────────────────────────────────────
      {
        kind: 'improvement',
        area: 'Library',
        title: 'Completed progress bars turn green',
        detail:
          'When a show, a movie series, or a task with subtasks/steps reaches 100%, its wavy progress '
          + 'bar flattens into a calm line — and now that line is green to signify completion, instead '
          + 'of staying the in-progress accent colour.',
      },
      {
        kind: 'improvement',
        area: 'Library',
        title: 'Gentler close for the media card',
        detail:
          'Closing a movie or show card eases back into its poster over a slightly longer, softer curve '
          + '(about 420ms, Material standard easing) so it reads as a deliberate settle rather than a '
          + 'quick snap. Opening is unchanged.',
      },

      // ── Fixes ─────────────────────────────────────────────────────────
      {
        kind: 'fix',
        area: 'Library',
        title: 'Poster no longer flashes when a card closes',
        detail:
          'The edit dialog used to disappear while still almost fully opaque as it shrank, hard-cutting '
          + 'to the poster underneath it. It now fades to fully transparent as it shrinks into the '
          + 'poster, so the panel and poster crossfade cleanly with no flash.',
      },
      {
        kind: 'fix',
        area: 'Library',
        title: 'Editing a book no longer errors on save',
        detail:
          'Saving an edit to a book — or any entry without a release date — failed with '
          + '“invalid release_date”, because an empty date was being rejected. Empty dates now clear the '
          + 'field correctly, the same way creating an entry already did.',
      },
      {
        kind: 'fix',
        area: 'Library',
        title: 'Books say “Started reading”',
        detail:
          'A book’s activity timeline showed “Started watching” when you began it. Books now read '
          + '“Started reading”; movies and shows keep “Started watching”.',
      },
      {
        kind: 'fix',
        area: 'Navigation',
        title: 'Visible hover in the page switcher',
        detail:
          'In the compact “all pages” dropdown — the one that appears once the top bars merge as you '
          + 'scroll — each tile’s hover colour matched the panel background, so hovering did nothing '
          + 'visible. Tiles now shift to a clearly distinct shade on hover in both light and dark themes.',
      },
      {
        kind: 'fix',
        area: 'Tasks',
        title: 'No sideways jump when opening “missed” review',
        detail:
          'Expanding the missed-tasks review grew the page tall enough to summon the scrollbar, which '
          + 'pushed all the content sideways. The scrollbar’s space is now permanently reserved (on '
          + 'every page), so nothing shifts when it appears.',
      },
      {
        kind: 'fix',
        area: 'Habits',
        title: 'Steady arrows when changing weeks',
        detail:
          'Stepping through weeks nudged the ‹ › arrows left and right because the date-range label '
          + 'changed width between months and single- vs double-digit days. The label now has a fixed '
          + 'width, so the arrows stay put as you cycle.',
      },
    ],
  },
];

function Tag({ kind }: { kind: Kind }) {
  const meta = KIND_META[kind];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider',
        meta.tag,
      )}
    >
      {meta.label}
    </span>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--surface-container-low))] px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag kind={entry.kind} />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {entry.area}
        </span>
      </div>
      <h4 className="mt-1.5 font-serif text-[15px] font-semibold tracking-tight text-foreground">
        {entry.title}
      </h4>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{entry.detail}</p>
    </div>
  );
}

function ReleaseBlock({ release }: { release: Release }) {
  const groups = GROUP_ORDER
    .map((kind) => ({ kind, entries: release.entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.entries.length > 0);

  return (
    <section id={release.version} className="scroll-mt-24 border-b border-border/60 py-10 first:pt-2 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">
          v{release.version}
        </h2>
        <time className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {release.date}
        </time>
      </div>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {release.summary}
      </p>

      <div className="mt-6 flex flex-col gap-7">
        {groups.map(({ kind, entries }) => {
          const meta = KIND_META[kind];
          return (
            <div key={kind}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className={cn('size-2 rounded-full', meta.dot)} />
                <h3 className="font-serif text-base font-semibold tracking-tight">{meta.group}</h3>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{entries.length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {entries.map((entry) => (
                  <EntryCard key={entry.title} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ChangelogPage() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Masthead — mirrors the field guide's chrome. */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/changelog" className="group flex items-baseline gap-2.5 outline-none">
            <span className="font-serif text-lg font-semibold tracking-tight transition-colors group-hover:text-[hsl(var(--primary))]">
              Sajni
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              changelog
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/docs"
              className="hidden h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:border-[hsl(var(--primary))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] sm:inline-flex"
            >
              Field guide
            </Link>
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-full bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--on-primary))] outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2"
            >
              Open Sajni
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 pb-16">
        <header>
          <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">Changelog</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Everything that changes in Sajni, newest first — features, improvements, and fixes, down to
            the small stuff.
          </p>
        </header>

        <div className="mt-4">
          {RELEASES.map((release) => (
            <ReleaseBlock key={release.version} release={release} />
          ))}
        </div>
      </main>
    </div>
  );
}
