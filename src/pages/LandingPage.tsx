import { useState, type MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

import {
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckSquare,
  Download,
  Film,
  MessageSquare,
  NotebookPen,
  Quote,
  Repeat,
  Wallet,
  type LucideIcon,
} from '@/components/ui/icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRESETS, type PresetId } from '@/theme/presets';
import { useTheme } from '@/theme/ThemeProvider';

type CareViewId = 'today' | 'remember' | 'tend' | 'reflect';

interface CareItem {
  icon: LucideIcon;
  title: string;
  detail: string;
  state: string;
}

interface CareView {
  id: CareViewId;
  label: string;
  title: string;
  body: string;
  items: CareItem[];
}

const CARE_VIEWS: CareView[] = [
  {
    id: 'today',
    label: 'Today',
    title: 'The day, already gathered.',
    body: 'What is due, what you are tending, and one thought worth returning to.',
    items: [
      { icon: CheckSquare, title: 'Review the project draft', detail: 'On deck · 10:30', state: 'Task' },
      { icon: Repeat, title: 'Evening walk', detail: 'Four-day rhythm', state: 'Habit' },
      { icon: Quote, title: 'A thought from four days ago', detail: 'Resurfaced gently', state: 'Echo' },
    ],
  },
  {
    id: 'remember',
    label: 'Remember',
    title: 'Nothing useful has to disappear.',
    body: 'Notes keep their links, quick captures return, and media remembers where you left off.',
    items: [
      { icon: NotebookPen, title: 'Garden planning', detail: 'Linked to three notes', state: 'Note' },
      { icon: Film, title: 'The Odyssey', detail: 'Released · moved to Pending', state: 'Movie' },
      { icon: Quote, title: 'A line worth keeping', detail: 'Captured last Thursday', state: 'Memo' },
    ],
  },
  {
    id: 'tend',
    label: 'Tend',
    title: 'Small care, at the right time.',
    body: 'Reminders follow your local clock. Recurring money and routines move without duplicate work.',
    items: [
      { icon: Bell, title: 'Call home', detail: 'Tomorrow · 7:00 PM', state: 'Reminder' },
      { icon: Wallet, title: 'Recurring deposit', detail: 'Next contribution scheduled', state: 'Finance' },
      { icon: Repeat, title: 'Read before bed', detail: 'Five days this week', state: 'Habit' },
    ],
  },
  {
    id: 'reflect',
    label: 'Reflect',
    title: 'Your days become a longer story.',
    body: 'Journal, projects, and analytics help you see patterns without turning life into a score.',
    items: [
      { icon: BookOpen, title: 'What felt lighter today?', detail: 'A prompt, not a demand', state: 'Journal' },
      { icon: MessageSquare, title: 'The garden project', detail: 'Continue the open thread', state: 'Project' },
      { icon: Quote, title: 'A steadier week', detail: 'Reflection, not a leaderboard', state: 'Insight' },
    ],
  },
];

const TENDING_ROWS: {
  icon: LucideIcon;
  number: string;
  title: string;
  body: string;
  detail: string;
}[] = [
  {
    icon: NotebookPen,
    number: '01',
    title: 'Capture and connect',
    body: 'Notes, memos, backlinks, folders, and universal tags keep a passing thought close to the work it belongs to.',
    detail: 'Notes · memos · tags',
  },
  {
    icon: CheckSquare,
    number: '02',
    title: 'Plan and tend',
    body: 'Tasks, habits, reminders, and a contextual Today page surface what deserves attention without making everything urgent.',
    detail: 'Tasks · habits · reminders',
  },
  {
    icon: BookOpen,
    number: '03',
    title: 'Remember and reflect',
    body: 'Journal entries, project threads, old echoes, books, films, and shows preserve both progress and the texture around it.',
    detail: 'Journal · projects · media',
  },
  {
    icon: Wallet,
    number: '04',
    title: 'Understand and protect',
    body: 'Money, trends, private exports, and calm analytics help you understand your life while keeping ownership with you.',
    detail: 'Finance · analytics · takeout',
  },
];

const QUIET_ACTIONS = [
  {
    ask: '“Remind me to call Mum tomorrow at seven.”',
    result: 'Creates the task and reminder in your timezone.',
  },
  {
    ask: '“I paid ₹620 for groceries from HDFC.”',
    result: 'Records the expense against the right account.',
  },
  {
    ask: '“Save this thought under the garden project.”',
    result: 'Keeps the thought with the project it belongs to.',
  },
];

function Brand() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="sajni-logo size-8!" aria-hidden="true" />
      <span className="serif text-xl font-semibold tracking-[-0.02em]">sajni</span>
    </span>
  );
}

function CarePreview() {
  const [activeId, setActiveId] = useState<CareViewId>('today');
  const reduceMotion = useReducedMotion();
  const active = CARE_VIEWS.find((view) => view.id === activeId) ?? CARE_VIEWS[0];

  return (
    <div className="w-full min-w-0 max-w-full rounded-[32px] bg-[hsl(var(--surface-container-low))] p-3 sm:p-4">
      <div className="min-w-0 max-w-full rounded-[24px_24px_24px_10px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-lowest))] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="sajni-logo size-6!" aria-hidden="true" />
            <span className="text-sm font-semibold">A day with Sajni</span>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">Illustrative preview</span>
        </div>

        <div
          className="mt-5 flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-full bg-[hsl(var(--surface-container))] p-1"
          role="group"
          aria-label="Ways Sajni tends your life"
        >
          {CARE_VIEWS.map((view) => (
            <Button
              key={view.id}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={view.id === activeId}
              onClick={() => setActiveId(view.id)}
              className={cn(
                'h-9 min-w-[68px] flex-1 px-2 text-xs sm:min-w-20 sm:px-3',
                view.id === activeId
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] hover:bg-[hsl(var(--secondary-container))]'
                  : 'text-muted-foreground',
              )}
            >
              {view.label}
            </Button>
          ))}
        </div>

        <div className="min-h-[390px] sm:min-h-[370px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
            >
              <div className="pt-7">
                <h2 className="serif text-3xl font-semibold leading-tight tracking-[-0.025em]">
                  {active.title}
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {active.body}
                </p>
              </div>

              <div className="relative mt-6">
                <div
                  className="absolute bottom-6 left-[21px] top-6 w-px bg-[hsl(var(--outline-variant))]"
                  aria-hidden="true"
                />
                <div className="relative flex flex-col gap-2">
                  {active.items.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="flex min-h-17 items-center gap-3 rounded-2xl bg-[hsl(var(--surface-container-low))] px-3 py-2.5"
                      >
                        <span
                          className={cn(
                            'relative z-10 grid size-11 shrink-0 place-items-center rounded-[16px]',
                            index === 0
                              ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                              : 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
                          )}
                        >
                          <Icon className="size-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{item.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                        <span className="hidden rounded-full bg-[hsl(var(--surface-container-highest))] px-2.5 py-1 text-xs font-medium text-muted-foreground sm:block">
                          {item.state}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch({
  id,
  label,
  colors,
  selected,
  onSelect,
}: {
  id: PresetId;
  label: string;
  colors: string[];
  selected: boolean;
  onSelect: (id: PresetId) => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'tonal' : 'outline'}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className="h-12 min-w-0 justify-start gap-3 px-3.5"
    >
      <span className="flex -space-x-1" aria-hidden="true">
        {colors.map((color) => (
          <span
            key={color}
            className="size-5 rounded-full border-2 border-[hsl(var(--surface-container-low))]"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
      {selected && <Check className="ml-auto size-4" />}
    </Button>
  );
}

export default function LandingPage() {
  const { preset, setPreset } = useTheme();
  const reduceMotion = useReducedMotion();

  const selectTheme = (id: PresetId) => {
    void setPreset(id);
  };

  const scrollToSection = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--outline-variant))] bg-background">
        <div className="mx-auto flex h-17 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8 lg:px-10">
          <Link
            to="/"
            aria-label="Sajni home"
            className="rounded-lg transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Brand />
          </Link>

          <nav aria-label="Landing page" className="hidden items-center gap-1 md:flex">
            <a
              href="#care"
              onClick={(event) => scrollToSection(event, 'care')}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
            >
              What it tends
            </a>
            <a
              href="#personal"
              onClick={(event) => scrollToSection(event, 'personal')}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
            >
              Personal by design
            </a>
            <a
              href="#quiet"
              onClick={(event) => scrollToSection(event, 'quiet')}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
            >
              Quiet intelligence
            </a>
          </nav>

          <Link to="/signin" className={buttonVariants({ variant: 'default', size: 'default' })}>
            Enter Sajni
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative">
          <div
            className="pointer-events-none absolute -right-32 top-10 size-[440px] rounded-full bg-[hsl(var(--primary-container)/0.38)] blur-3xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid min-w-0 max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-22 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:px-10 lg:py-28">
            <div className="min-w-0 max-w-xl">
              <h1 className="serif text-[clamp(2.75rem,4.5vw,4rem)] font-semibold leading-[1] tracking-[-0.045em]">
                A quieter place for everything that matters.
              </h1>
              <p className="mt-7 max-w-lg text-lg leading-8 text-muted-foreground sm:text-xl">
                Sajni brings your notes, days, plans, habits, projects, media, and money into one
                personal codex—then tends each thread with care.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/signin" className={buttonVariants({ variant: 'default', size: 'lg' })}>
                  Make it yours
                  <ArrowRight className="size-4" />
                </Link>
                <Link to="/docs" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                  Read the field guide
                </Link>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                No feed. No gamification. No audience. Your pace, your data.
              </p>
            </div>

            <CarePreview />
          </div>
        </section>

        <section id="care" className="scroll-mt-20 border-y border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-26 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <h2 className="serif max-w-md text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                  Each part is looked after in context.
                </h2>
                <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                  Sajni keeps the spaces distinct enough to stay clear, and connected enough to
                  feel like one continuous place.
                </p>
              </div>

              <div className="divide-y divide-[hsl(var(--outline-variant))] border-y border-[hsl(var(--outline-variant))]">
                {TENDING_ROWS.map((row, index) => {
                  const Icon = row.icon;
                  return (
                    <article key={row.number} className="grid gap-4 py-7 sm:grid-cols-[56px_1fr_auto] sm:items-start sm:gap-5">
                      <span
                        className={cn(
                          'grid size-14 place-items-center bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
                          index % 2 === 0
                            ? 'rounded-[20px_20px_20px_8px]'
                            : 'rounded-[20px_8px_20px_20px]',
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-xs font-semibold text-[hsl(var(--primary))]">{row.number}</span>
                          <h3 className="serif text-2xl font-semibold tracking-[-0.02em]">{row.title}</h3>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                          {row.body}
                        </p>
                      </div>
                      <div className="self-center text-xs font-medium text-muted-foreground sm:max-w-28 sm:text-right">
                        {row.detail}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="personal" className="scroll-mt-20">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-26 lg:px-10">
            <div className="grid overflow-hidden rounded-[32px] bg-[hsl(var(--primary-container))] lg:grid-cols-[0.92fr_1.08fr]">
              <div className="p-7 sm:p-10 lg:p-14">
                <h2 className="serif max-w-lg text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-[hsl(var(--on-primary-container))] sm:text-5xl">
                  The system should feel personal before you put anything in it.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-7 text-[hsl(var(--on-primary-container)/0.78)]">
                  Every Sajni theme is a complete Material 3 tonal system—not a coat of paint.
                  Surfaces, focus states, charts, light mode, and dark mode all follow together.
                </p>
              </div>

              <div className="m-3 rounded-[26px] bg-[hsl(var(--surface-container-low))] p-5 sm:m-4 sm:p-7 lg:p-9">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">Choose the tone</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      This changes the real page. Your choice stays with you.
                    </p>
                  </div>
                  <span className="rounded-full bg-[hsl(var(--tertiary-container))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--on-tertiary-container))]">
                    M3 palette
                  </span>
                </div>

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {PRESETS.map((theme) => (
                    <ThemeSwatch
                      key={theme.id}
                      id={theme.id}
                      label={theme.label}
                      colors={[
                        theme.seeds.primary,
                        theme.seeds.secondary,
                        theme.seeds.tertiary,
                      ]}
                      selected={preset === theme.id}
                      onSelect={selectTheme}
                    />
                  ))}
                </div>

                <div className="mt-6 grid gap-3 border-t border-[hsl(var(--outline-variant))] pt-6 sm:grid-cols-3">
                  {[
                    ['Light or dark', 'Follows your system'],
                    ['Comfort', 'Compact to cozy'],
                    ['Made for you', 'AI-mixed themes too'],
                  ].map(([title, detail]) => (
                    <div key={title}>
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="quiet" className="scroll-mt-20 bg-[hsl(var(--surface-container-low))]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-26 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-18 lg:px-10">
            <div>
              <h2 className="serif max-w-lg text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                It stays out of sight until language is easier.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Sajni has no floating assistant and no prompt parade. Ask from the command palette
                when you want help; it acts inside the same system you already understand.
              </p>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-lowest))]">
              <div className="flex items-center justify-between border-b border-[hsl(var(--outline-variant))] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="sajni-logo size-6!" aria-hidden="true" />
                  <span className="text-sm font-semibold">Ask Sajni</span>
                </div>
                <span className="text-xs text-muted-foreground">Acts, then answers</span>
              </div>
              <div className="divide-y divide-[hsl(var(--outline-variant))]">
                {QUIET_ACTIONS.map((action) => (
                  <div key={action.ask} className="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <p className="text-sm font-medium leading-6">{action.ask}</p>
                    <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
                    <p className="text-sm leading-6 text-muted-foreground">{action.result}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-26 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-end">
            <div>
                <h2 className="serif max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl">
                  A beloved place to return to—not another system to perform for.
                </h2>
              </div>
              <div>
                <div className="divide-y divide-[hsl(var(--outline-variant))] border-y border-[hsl(var(--outline-variant))]">
                  {[
                    [Check, 'No public feed or audience'],
                    [Check, 'No streak shame or productivity score'],
                    [Download, 'Full takeout and finance exports'],
                  ].map(([Icon, label]) => {
                    const ItemIcon = Icon as LucideIcon;
                    return (
                      <div key={label as string} className="flex min-h-14 items-center gap-3 py-2 text-sm font-medium">
                        <span className="grid size-9 place-items-center rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]">
                          <ItemIcon className="size-4" />
                        </span>
                        {label as string}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link to="/signin" className={buttonVariants({ variant: 'default', size: 'lg' })}>
                    Step inside
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link to="/docs" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
                    Explore every detail
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[hsl(var(--outline-variant))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <Brand />
          <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-right">
            A personal codex for notes, days, plans, habits, projects, media, and money.
          </p>
        </div>
      </footer>
    </div>
  );
}
