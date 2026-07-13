import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ─── Sajni field guide ──────────────────────────────────────────────────────
// Public documentation for everything Sajni does and why it looks the way it
// does. One long, calm page — a printed manual, not a marketing site. Chapter
// numbers in mono, serif headings, sticky table of contents. Content here is
// hand-written and must stay truthful to the shipped product: when a feature
// changes, change its chapter.

const CHAPTERS = [
  { id: 'sajni', n: '01', title: 'What Sajni is' },
  { id: 'brand', n: '02', title: 'The look & the name' },
  { id: 'getting-around', n: '03', title: 'Getting around' },
  { id: 'today', n: '04', title: 'Today' },
  { id: 'notes', n: '05', title: 'Notes & Memos' },
  { id: 'journal', n: '06', title: 'Journal' },
  { id: 'tasks', n: '07', title: 'Tasks' },
  { id: 'habits', n: '08', title: 'Habits' },
  { id: 'projects', n: '09', title: 'Projects' },
  { id: 'media', n: '10', title: 'Media' },
  { id: 'finance', n: '11', title: 'Finance' },
  { id: 'analytics', n: '12', title: 'Analytics' },
  { id: 'ask-sajni', n: '13', title: 'Ask Sajni' },
  { id: 'notifications', n: '14', title: 'Notifications' },
  { id: 'your-data', n: '15', title: 'Your data' },
  { id: 'apps', n: '16', title: 'Web & Android' },
] as const;

export default function DocsPage() {
  const [active, setActive] = useState<string>(CHAPTERS[0].id);
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Scrollspy: highlight the chapter whose heading most recently crossed the
  // top quarter of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-15% 0px -75% 0px' },
    );
    for (const el of sectionsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionsRef.current.set(id, el);
    else sectionsRef.current.delete(id);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Masthead */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            ohmysajni.com · field guide
          </p>
          <h1 className="mt-3 font-serif text-4xl md:text-5xl font-semibold tracking-tight">
            Sajni, explained.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Everything the app does, how each piece is meant to be used, and why
            it looks the way it does. Read it start to finish once, then come
            back by chapter.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-full bg-[hsl(var(--primary))] px-5 text-sm font-medium text-[hsl(var(--on-primary))] transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 outline-none"
            >
              Open Sajni
            </Link>
            <span className="font-mono text-xs text-muted-foreground">
              {CHAPTERS.length} chapters · ~10 min
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-10 px-5 py-8">
        {/* Table of contents — sticky rail on desktop */}
        <nav aria-label="Chapters" className="hidden md:block w-56 shrink-0">
          <ol className="sticky top-8 flex flex-col gap-0.5">
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <a
                  href={'#' + c.id}
                  className={cn(
                    'flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors outline-none',
                    'hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                    active === c.id
                      ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="font-mono text-[10px] tabular-nums opacity-70">{c.n}</span>
                  {c.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Chapters */}
        <main className="min-w-0 flex-1 pb-24">
          <Chapter id="sajni" register={register}>
            <p>
              Sajni is a personal knowledge & life system — one quiet codex for
              notes, journal, tasks, habits, projects, media, and money. It is
              built for one person at a time: your data, your pace, no feed, no
              gamification, no one watching.
            </p>
            <p>
              The design bet is <em>calm density</em>. Every space shows a lot
              without shouting: figures in tabular mono, headings in serif,
              interactions that respond instantly and then get out of the way.
              An AI (also called Sajni) lives ambiently inside — it can do
              anything the buttons can do, but it never advertises itself.
            </p>
            <Callout>
              Sajni thinks in IST. Days, months, streaks and budgets all roll
              on Asia/Kolkata wall-clock time, whatever device you're on.
            </Callout>
          </Chapter>

          <Chapter id="brand" register={register}>
            <p>
              <strong>The name.</strong> “Sajni” is a Hindi/Urdu term of
              endearment — <em>beloved</em>. The app is meant to feel like
              that: something personal you return to daily, not a productivity
              dashboard.
            </p>
            <p>
              <strong>The mark.</strong> The app icon is a mehendi
              (henna) motif — dark paisleys on cream. Ornament with intent:
              hand-drawn, Indian, unhurried.
            </p>
            <p>
              <strong>Type.</strong> Three voices, used strictly: a serif for
              titles and figures that matter, a monospace for labels, dates and
              amounts (always <span className="font-mono tabular-nums">tabular</span>,
              so columns never wobble), and a plain sans for body text.
            </p>
            <p>
              <strong>Color.</strong> Sajni follows Material 3 Expressive
              tonal palettes. Every color on screen comes from a theme token —
              nothing is hard-coded — which is why entire themes swap cleanly.
              In <Ref>Settings → Theme</Ref> you can pick a built-in theme,
              flip light/dark/system, choose density (compact · comfortable ·
              cozy) — or ask the AI to <em>generate a theme</em> from a
              description and keep the ones you like.
            </p>
            <p>
              <strong>Motion.</strong> Springs, not fades — quick, emphatic,
              done. Nothing animates for decoration.
            </p>
          </Chapter>

          <Chapter id="getting-around" register={register}>
            <p>
              Nine spaces sit in the navigation pill: <em>Today, Notes,
              Journal, Tasks, Habits, Projects, Media, Finance, Analytics</em>.
              Everything else is reachable from the command palette.
            </p>
            <h3>The command palette</h3>
            <p>
              Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> (or <Kbd>⌘K</Kbd>, or tap the
              search pill) anywhere. It fuzzy-searches every type of thing you
              own — memos, tasks, notes, journal entries, habits, media, tags,
              accounts, transactions, bookmarks.
            </p>
            <ul>
              <li>
                <strong>Type-prefix a search</strong> to narrow it:{' '}
                <Code>task call bank</Code>, <Code>note design</Code>,{' '}
                <Code>txn swiggy</Code>, <Code>movie dune</Code>. Plurals and
                short forms work (<Code>todos</Code>, <Code>txn</Code>,{' '}
                <Code>books</Code>).
              </li>
              <li>
                <strong>Quick actions</strong> live in the same box: switch
                theme (system/light/dark), change density, open Settings, sign
                out.
              </li>
              <li>
                <strong>Ask the AI</strong>: type <Code>@sajni</Code> (or{' '}
                <Code>@s</Code> / <Code>@ai</Code>) followed by a space, then
                your question. See <Ref>chapter 13</Ref>.
              </li>
            </ul>
            <p>
              First sign-in shows a short guided tour; you can replay it from
              Settings any time.
            </p>
          </Chapter>

          <Chapter id="today" register={register}>
            <p>
              Today is the morning page — open it, scan it, start. It pulls
              from every other space so you don't have to tour the app:
            </p>
            <ul>
              <li><strong>On deck</strong> — the tasks that deserve today.</li>
              <li><strong>Today's habits</strong> — tick them off inline.</li>
              <li><strong>Recent thinking</strong> — project cards you touched last.</li>
              <li><strong>Echo from earlier</strong> — something you wrote a few days ago, resurfaced so it compounds instead of rotting.</li>
              <li><strong>At a glance</strong> — the numbers of the day.</li>
              <li><strong>Today's prompt</strong> — one line to push the journal along.</li>
            </ul>
            <p>
              Intended use: it's a read-and-go page. Do the ticking and the
              deep work elsewhere; Today just orients you.
            </p>
          </Chapter>

          <Chapter id="notes" register={register}>
            <p>
              Notes is long-form writing: folders, backlinks, and a rich
              editor. The <strong>Memos</strong> tab on the same page is the
              opposite — frictionless quick capture for half-formed thoughts.
              Rule of thumb: if it has a title, it's a note; if it's a flash,
              it's a memo.
            </p>
            <h3>Slash commands</h3>
            <p>
              In the editor, type <Kbd>/</Kbd> on an empty line to open the
              block menu:
            </p>
            <CommandTable
              rows={[
                ['/heading 1 · 2 · 3', 'Section headings, three sizes'],
                ['/bullet list', 'Unordered list'],
                ['/numbered list', 'Ordered list'],
                ['/to-do list', 'Checkboxes inside the note'],
                ['/quote', 'Blockquote'],
                ['/code block', 'Multi-line code'],
                ['/divider', 'Horizontal rule'],
                ['/link', 'Insert a titled link via a small dialog'],
                ['/task', 'Create a real Task and reference it inline as a live chip'],
              ]}
            />
            <p>
              <Code>/task</Code> is the special one: the chip in your note is
              the actual task — check it in Tasks and the note reflects it.
            </p>
            <h3>Tags</h3>
            <p>
              Write <Code>#tag</Code> anywhere — notes, memos, task notes,
              transaction notes, bookmarks. Tags are collected globally and
              browsable under <Ref>Analytics → Tags</Ref>; tapping a tag pill
              anywhere jumps to everything carrying it.
            </p>
          </Chapter>

          <Chapter id="journal" register={register}>
            <p>
              One entry per day, on purpose. Each entry takes a mood, a
              location, attachments, and prose. The constraint is the feature:
              you can't binge-journal, you can only show up daily.
            </p>
            <ul>
              <li><strong>Weeks view</strong> — entries roll up into weeks; Sajni writes a weekly summary you can revisit.</li>
              <li><strong>Prompt</strong> — Today's page offers one line when the blank page stares back.</li>
              <li><strong>Places</strong> — the location pill keeps a quiet map of where your days happened.</li>
            </ul>
          </Chapter>

          <Chapter id="tasks" register={register}>
            <p>
              Lists, priorities, due dates, sub-steps, reminders. Two layouts —{' '}
              <strong>List</strong> and <strong>Board</strong> — over the same
              data.
            </p>
            <h3>Smart views</h3>
            <CommandTable
              rows={[
                ['My Day', 'What deserves attention today — the default'],
                ['This week / Month', 'Horizon views by due date'],
                ['Important', 'Priority-flagged tasks'],
                ['Blocked', 'Tasks waiting on another task — unblock the chain first'],
                ['Missed', 'Things that slipped; reschedule or scratch honestly'],
              ]}
            />
            <p>
              Your own lists sit next to the smart views. Tasks can carry
              subtasks and step checklists, repeat on a schedule, and hold
              multiple reminders — each reminder lands as a push notification{' '}
              <em>and</em> an email. “Scratched” is a first-class outcome:
              deciding not to do something is progress, so it's tracked, not
              deleted.
            </p>
          </Chapter>

          <Chapter id="habits" register={register}>
            <p>
              Tick once a day. Sajni does the streak math, draws the weekly
              strip and the heatmap, and stays quiet otherwise — nudges, never
              guilt. Missed a few days while offline? Backfill recent days from
              the habit's log instead of lying to the streak.
            </p>
            <p>
              Intended use: few habits, kept honestly. Daily habits appear on
              Today for one-tap ticking.
            </p>
          </Chapter>

          <Chapter id="projects" register={register}>
            <p>
              Projects (née “Thinking”) is where scattered thoughts become
              structure. A project is a board of cards — ideas, questions,
              references. The same page has a <strong>Chat</strong> tab for
              longer conversations with Sajni in context.
            </p>
            <ul>
              <li><strong>Synthesize</strong> — Sajni reads the cards and drafts the through-line.</li>
              <li><strong>Enrich</strong> — expands a thin card with questions and angles.</li>
              <li><strong>Connections</strong> — surfaces cards that belong together and the gaps between them.</li>
            </ul>
            <p>
              Intended use: dump cards fast during the week; run synthesize
              when the board feels full; promote what survives into notes or
              tasks.
            </p>
          </Chapter>

          <Chapter id="media" register={register}>
            <p>
              Movies, shows and books you're tracking — plus saved links.
              Search pulls posters and metadata from TMDB; shows track per-
              episode progress. Every item moves through honest states:{' '}
              <em>in progress, upcoming, pending, waiting, complete, archived,
              dropped, scratched</em> — dropping a bad book is a valid ending.
            </p>
            <p>
              <strong>Saved links:</strong> share any page or video to Sajni
              (PWA share sheet on Android, or paste) and it lands under
              Sites / Videos to read later — title fetched for you,{' '}
              <Code>#tags</Code> welcome.
            </p>
          </Chapter>

          <Chapter id="finance" register={register}>
            <p>
              A calm personal ledger — not a bank app. Seven tabs: Overview,
              Accounts, Transactions, Budgets, Billers, Investments, Cards.
              Everything below composes around one idea: record the money
              honestly, let Sajni do the arithmetic.
            </p>

            <h3>Privacy first</h3>
            <p>
              Figures are <strong>hidden by default</strong>. Every amount
              renders as stable decoy digits — same shape, wrong numbers — so
              you can use Finance on a train. Tap <em>Privacy</em> to reveal;
              the reveal lasts <strong>30 minutes</strong> and then re-hides
              itself, even across reloads and laptop sleeps. Re-hide manually
              any time.
            </p>

            <h3>Accounts & transactions</h3>
            <p>
              Accounts (savings, checking, salary, credit card, investment,
              cash) hold running balances computed from the ledger. Add
              expenses, incomes and transfers by hand — or share a bank/UPI
              SMS to Sajni and it parses the amount, direction, date and even
              matches the account from the message; you confirm, it files.
              Categories are auto-suggested by AI as you type a title (you can
              always override). <Code>#tags</Code> in a transaction note work
              like everywhere else.
            </p>

            <h3>Pockets</h3>
            <p>
              A pocket is a <strong>spend context</strong> — “Goa Trip”,
              “Wedding”, “New flat”. Every transaction lives in exactly one
              pocket; anything unfiled sits in the implicit{' '}
              <strong>General</strong> pocket. The chip bar atop Finance shows
              each pocket's spend this month; tap a chip to filter the ledger
              to it.
            </p>
            <ul>
              <li>
                <strong>Active pocket:</strong> mark one pocket active (chip
                menu → Set active) and every new transaction — manual, shared
                SMS, or created by the AI — files into it by default. Land in
                Goa, set “Goa Trip” active, forget about it; clear it when you
                fly home.
              </li>
              <li>
                Automatic transactions (biller auto-pay, investment
                auto-debit) deliberately ignore the active pocket and stay in
                General — a trip shouldn't absorb your Netflix renewal.
              </li>
              <li>
                Archive pockets you're done with; deleting one moves its
                transactions back to General.
              </li>
            </ul>

            <h3>Budgets</h3>
            <p>
              A budget is an overall amount plus optional soft{' '}
              <strong>category caps</strong> that warn but never block. Two
              kinds:
            </p>
            <ul>
              <li>
                <strong>Monthly</strong> — rolls with the calendar
                automatically; no dates to manage. Flip back through past
                months with the ‹ › month nav.
              </li>
              <li>
                <strong>Custom range</strong> — a trip or a season. Optionally
                count <em>only selected pockets</em>, so the “Goa Trip” budget
                counts exactly the Goa spending — while your monthly budget
                still counts the same rupees. One transaction, every matching
                budget; you never assign budgets by hand.
              </li>
            </ul>

            <h3>Billers</h3>
            <p>Recurring charges come in two honest kinds:</p>
            <ul>
              <li>
                <strong>Subscription</strong> — fixed amount (Netflix, rent,
                EMI). Can <em>auto-pay</em>: Sajni posts the expense each
                cycle from the linked account and tells you.
              </li>
              <li>
                <strong>Bill</strong> — the amount varies (electricity,
                water). The stored amount is just an estimate; when you mark
                it paid, Sajni asks for the actual. Bills never auto-pay.
              </li>
            </ul>
            <p>
              Marking paid opens a small popover with two paths:{' '}
              <strong>Record payment</strong> (posts a transaction) or{' '}
              <strong>Attach existing</strong> (link expenses you already
              logged — nothing new is posted). Either way the due date rolls
              forward and the cycle can't be double-recorded. Tap a biller row
              for its full payment history. “Remind me” spawns a{' '}
              <em>Pay …</em> task near each due date.
            </p>

            <h3>Investments</h3>
            <p>
              SIPs, RDs, FDs, mutual funds and anything else you value by
              hand — you update the current value when you check in. Recurring
              instruments can <strong>auto-debit</strong>: each cycle Sajni
              posts the contribution from the linked account, grows the
              invested amount, and notifies you. If the app was asleep past a
              date, it catches up exactly once per missed cycle.
            </p>

            <h3>Cards & exports</h3>
            <p>
              Credit-card statements are generated per cycle with cashback
              math and a payable total; mark paid from any account. Every tab
              exports CSV (transactions, budgets, net-worth history) — open in
              Sheets, no lock-in.
            </p>
          </Chapter>

          <Chapter id="analytics" register={register}>
            <p>Three tabs under one roof:</p>
            <ul>
              <li><strong>Activity</strong> — heatmaps, task velocity, habit streaks, mood trends. Your year at a glance.</li>
              <li><strong>Insights</strong> — each week Sajni reads your data and writes short observations worth acting on. They accrue; skim them Sunday evening.</li>
              <li><strong>Tags</strong> — every <Code>#tag</Code> across the app, with everything filed under it.</li>
            </ul>
          </Chapter>

          <Chapter id="ask-sajni" register={register}>
            <p>
              The AI is deliberately ambient — no chat bubble begging for
              attention. Two entrances:
            </p>
            <ul>
              <li>
                <strong>Palette</strong> — <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>, type{' '}
                <Code>@sajni</Code> + space, ask. Best for quick things:
                “add lunch 240 to cash”, “what's due this week?”, “set my
                active pocket to Goa Trip”.
              </li>
              <li>
                <strong>Chat</strong> — the Chat tab in Projects, for longer
                back-and-forth with history kept per session.
              </li>
            </ul>
            <p>
              The standing rule of the codebase is <em>AI parity</em>:
              anything a button can do, Sajni can do — create tasks and
              transactions, pay billers, file pockets, log habits, search your
              notes, build themes. When it changes something, the screen
              refreshes itself. It acts and answers; it doesn't narrate a
              feature tour.
            </p>
          </Chapter>

          <Chapter id="notifications" register={register}>
            <p>
              One delivery rule everywhere: <strong>both channels, always</strong>.
              Every reminder and alert goes to push (each device you've
              registered) <em>and</em> email — task reminders, biller
              due/auto-paid alerts, investment auto-debits, weekly digests.
              Miss the ping, catch the mail.
            </p>
          </Chapter>

          <Chapter id="your-data" register={register}>
            <p>
              It's yours, in the most literal way available:
            </p>
            <ul>
              <li><strong>Takeout</strong> — Settings → Your data downloads a .zip of everything; the same screen imports one back.</li>
              <li><strong>CSV exports</strong> — finance data exports straight to spreadsheet-friendly CSV.</li>
              <li><strong>Delete account</strong> — type-to-confirm, and it's gone server-side.</li>
            </ul>
            <p>
              Sign-in supports Google OAuth alongside email; sessions refresh
              silently and can be revoked by signing out.
            </p>
          </Chapter>

          <Chapter id="apps" register={register}>
            <p>
              <strong>Web / PWA</strong> — ohmysajni.com installs as an app on
              anything. On Android the PWA registers as a{' '}
              <em>share target</em>: share a bank SMS to add a transaction,
              share a link to save a bookmark.
            </p>
            <p>
              <strong>Android (native)</strong> — a Kotlin/Compose app with
              the full feature set plus what only native can do: reading
              incoming bank SMS and adding the transaction silently, and
              first-class push. It follows the same design system (Material 3
              Expressive) and talks to the same account.
            </p>
            <footer className="mt-10 border-t border-border pt-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                sajni · ohmysajni.com
              </p>
            </footer>
          </Chapter>
        </main>
      </div>
    </div>
  );
}

// ─── Chapter & inline primitives ────────────────────────────────────────────

function Chapter({ id, register, children }: {
  id: (typeof CHAPTERS)[number]['id'];
  register: (id: string) => (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  const meta = CHAPTERS.find((c) => c.id === id)!;
  return (
    <section id={id} ref={register(id)} className="scroll-mt-8 pt-2 pb-10 border-b border-border/60 last:border-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs tabular-nums text-[hsl(var(--primary))]">{meta.n}</span>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{meta.title}</h2>
      </div>
      <div className="docs-prose mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90 [&_h3]:mt-3 [&_h3]:font-serif [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5 [&_li]:list-disc [&_em]:text-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-[hsl(var(--surface-container-low))] px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-[hsl(var(--surface-container-high))] px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}

function Ref({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-[hsl(var(--primary))]">{children}</span>;
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] px-4 py-3 text-sm text-foreground/85">
      {children}
    </div>
  );
}

function CommandTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([cmd, what]) => (
            <tr key={cmd} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[13px] text-foreground">{cmd}</td>
              <td className="px-3 py-2 text-muted-foreground">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
