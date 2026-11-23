import { DateBadge } from '@/components/ui/state-chip';
import { TaskRing } from '@/components/tasks/TaskRing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, isPast, isToday, parseISO } from 'date-fns';
import { inkOn } from '@/lib/ink';
import { CheckSquare, BookOpen, ArrowRight, Clock, Quote, Bell, CornerDownRight } from '@/components/ui/icons';
import { PixelIcon } from '@/components/ui/pixel-icon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { journal as journalApi } from '@/api';
import type { JournalEntry as JournalFull } from '@/types';
import { useTasks, useToggleTaskStatus, useCreateTask } from '@/queries/tasks';
import { useHabits, useHabitRecentLogs, useToggleHabitPeriod } from '@/queries/habits';
import { useDayPlans } from '@/queries/plans';
import { PlanCard } from '@/components/plans/PlansPanel';
import { formatClock } from '@/components/plans/PlansManager';
import { dateKey, habitPeriodForDate } from '@/lib/habit-periods';
import { useMemos, useCreateMemo } from '@/queries/memos';
import { useJournalList, useSaveJournal } from '@/queries/journal';
import { M3CookieLoader } from '@/components/ui/shapes';
import { Textarea } from '@/components/ui/textarea';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import MissedBanner from '@/components/tasks/MissedBanner';
import { PageChrome, chromeClearance, useOwnScrolled } from '@/components/PageShell';
import { useNavChrome } from '@/components/nav-chrome';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToday } from '@/hooks/use-today';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';

interface Memo {
  id: number;
  content: string;
  pinned: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}
interface JournalMeta {
  id: number;
  date: string;
  tags?: string[];
  updated_at: string;
}
interface HabitDayStatus {
  id: number;
  name: string;
  color: string;
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly';
  logged: boolean;
}

type CaptureKind = 'memo' | 'task' | 'journal';

// Today is the contextual home. It surfaces what's on deck, what you've
// been thinking, today's habits, and a journal prompt — instead of
// dropping into a search-driven feed.
export default function TodayPage() {
  const navigate = useNavigate();
  const { openTask } = useTaskDetail();

  // No secondary bar here (the hero is the header) — but the condensed
  // pill still appears on scroll, and the primary bar collapses with it
  // (reported through NavChromeContext).
  const scrollRef = useRef<HTMLDivElement>(null);
  const { setScrolled: reportScrolled } = useNavChrome();
  const scrolledPast = useOwnScrolled(scrollRef, true);
  useEffect(() => {
    reportScrolled(scrolledPast);
    return () => reportScrolled(false);
  }, [scrolledPast, reportScrolled]);

  const [hour, setHour] = useState(new Date().getHours());
  const [capture, setCapture] = useState('');
  const [captureKind, setCaptureKind] = useState<CaptureKind>('memo');
  const [saving, setSaving] = useState(false);

  // Turns over at midnight or on return to the tab. Lists that mean "today"
  // without a date in their key (My Day, habit periods) refetch with it.
  const today = useToday();
  const queryClient = useQueryClient();
  const shownDay = useRef(today);
  useEffect(() => {
    if (shownDay.current === today) return;
    shownDay.current = today;
    queryClient.invalidateQueries({ queryKey: qk.tasks.all });
    queryClient.invalidateQueries({ queryKey: qk.habits.all });
  }, [today, queryClient]);

  // Tick the hour so the greeting stays fresh.
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Cached reads — refetch automatically when their roots are invalidated
  // (post-mutation here, or via the AI InvalidateBridge).
  const { data: dueToday = [] } = useTasks({ smart: 'my_day' });
  const { data: todayPlans = [] } = useDayPlans(today);
  const { data: habitsList = [] } = useHabits();
  const { data: recentLogsMap = {} } = useHabitRecentLogs(14);
  const { data: memosData = [] } = useMemos();
  const { data: journalData = [] } = useJournalList();

  const recentMemos = (memosData as Memo[]).slice(0, 3);
  const recentJournal = (journalData as JournalMeta[]).slice(0, 4);

  // /habits carries completion for each habit's current cadence period.
  const habitStatus: HabitDayStatus[] = habitsList.map((h) => ({
    id: h.id,
    name: h.name,
    color: h.color,
    frequency: h.frequency,
    logged: h.logged_current_period ?? h.logged_today,
  }));

  const toggleTask = useToggleTaskStatus();
  const toggleHabit = useToggleHabitPeriod();
  const createMemo = useCreateMemo();
  const createTask = useCreateTask();
  const saveJournal = useSaveJournal();

  // Derive the per-habit completion for the current calendar week (Mon..Sun),
  // so today sits in its real weekday slot rather than always at the end.
  const habitWeek = useMemo(() => {
    const week: Record<number, boolean[]> = {};
    if (habitsList.length === 0) return week;
    const todayDate = new Date();
    const monday = new Date(todayDate);
    monday.setDate(monday.getDate() - ((todayDate.getDay() + 6) % 7));
    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dayKeys.push(format(d, 'yyyy-MM-dd'));
    }
    for (const h of habitsList) {
      const set = new Set(recentLogsMap[String(h.id)] ?? []);
      week[h.id] = dayKeys.map((k) => set.has(k));
    }
    return week;
  }, [habitsList, recentLogsMap]);

  const greeting =
    hour < 5
      ? 'Still Up'
      : hour < 12
        ? 'Good Morning'
        : hour < 17
          ? 'Good Afternoon'
          : hour < 21
            ? 'Good Evening'
            : 'Winding Down';

  const habitsLeft = habitStatus.filter((h) => !h.logged).length;
  const habitsDone = habitStatus.filter((h) => h.logged).length;
  const totalHabitsToday = habitStatus.length;
  // A plan's tasks show under the plan, not again in On deck.
  const planIds = new Set(todayPlans.map((p) => p.id));
  const dueOpen = dueToday.filter(
    (t) => t.status !== 'done' && t.status !== 'scratched' && !(t.plan_id != null && planIds.has(t.plan_id)),
  );

  // Server order (last updated first) — the same order as every task view.
  const dueOpenSorted = dueOpen;

  const openTasksCount = dueOpen.length;

  // The "echo" — a memo from 3+ days ago we surface.
  const echo = useMemo(() => {
    if (recentMemos.length === 0) return null;
    const cutoff = new Date().getTime() - 3 * 24 * 60 * 60 * 1000;
    return [...recentMemos].reverse().find((m) => new Date(m.created_at).getTime() < cutoff) || null;
  }, [recentMemos]);

  // Journal prompt — we don't have an AI prompt service yet, so we
  // either show a continuation hint based on yesterday's entry or a
  // gentle default.
  const journalPrompt = useMemo(() => {
    const yesterday = recentJournal.find((j) => j.date < today);
    if (yesterday) {
      return `Yesterday you wrote on ${format(parseISO(yesterday.date), 'MMMM d')}. What's one paragraph you can put down now to keep the thread going?`;
    }
    return "What's one thing you noticed today that you want to remember in a year?";
  }, [recentJournal, today]);

  const handleCapture = async () => {
    const text = capture.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      if (captureKind === 'memo') {
        await createMemo.mutateAsync({ content: text });
      } else if (captureKind === 'task') {
        await createTask.mutateAsync({ title: text, due_date: today });
      } else if (captureKind === 'journal') {
        // Append onto today's entry if present, else create.
        const existing = await journalApi.get(today).catch((): JournalFull | null => null);
        const next = existing?.content ? `${existing.content}\n\n${text}` : text;
        await saveJournal.mutateAsync({ date: today, content: next });
      }
      setCapture('');
    } finally {
      setSaving(false);
    }
  };

  const onCaptureKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleCapture();
    }
  };

  const isMobile = useIsMobile();
  const dateLabel = format(new Date(), 'EEEE, MMMM d');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageChrome title="Today" columnClassName="max-w-6xl px-6 md:px-14" />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingTop: chromeClearance(isMobile) }}
      >
        <div className="page-fade-in mx-auto w-full max-w-6xl px-6 pt-6 pb-24 md:px-14 md:pt-8">
          {/* Hero */}
          <div>
            <div className="mb-3 text-base font-medium tracking-normal text-muted-foreground">{dateLabel}</div>
            <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.025em] text-foreground md:text-[56px]">
              {greeting}.
            </h1>
            <p className="serif mt-2 max-w-[720px] text-lg leading-[1.25] font-light tracking-[-0.01em] text-muted-foreground italic md:text-[28px]">
              You have{' '}
              <span className="text-foreground not-italic">
                {openTasksCount} {openTasksCount === 1 ? 'thing' : 'things'}
              </span>{' '}
              on deck and{' '}
              <span className="text-foreground not-italic">
                {habitsLeft} {habitsLeft === 1 ? 'habit' : 'habits'}
              </span>{' '}
              left to log.
            </p>
          </div>

          {/* Capture bar */}
          {/* One tonal surface; the field is the surface (no box inside a box). */}
          {/* Focus shows once, as a hairline on the card — the textarea's own
					    inset ring doubled it and cut into the placeholder. */}
          <div className="mt-9 rounded-xl bg-card px-5 pt-3 pb-4 transition-shadow fade-in focus-within:shadow-[inset_0_0_0_1px_hsl(var(--outline))]">
            <Textarea
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={onCaptureKey}
              placeholder="A thought, a task, a #tag…"
              rows={2}
              className="min-h-[72px] border-0 bg-transparent px-0 text-base leading-[1.55] shadow-none focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0"
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <CaptureChip
                  kind="memo"
                  current={captureKind}
                  onPick={setCaptureKind}
                  icon={<PixelIcon name="notebook" solid={captureKind === 'memo'} className="size-3" />}
                  label="Memo"
                />
                <CaptureChip
                  kind="task"
                  current={captureKind}
                  onPick={setCaptureKind}
                  icon={<CheckSquare className="size-3" />}
                  label="Task"
                />
                <CaptureChip
                  kind="journal"
                  current={captureKind}
                  onPick={setCaptureKind}
                  icon={<BookOpen className="size-3" />}
                  label="Journal"
                />
              </div>
              <button
                onClick={handleCapture}
                disabled={!capture.trim() || saving}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {saving ? <M3CookieLoader size="sm" tone="primary" className="!text-primary-foreground" /> : null}
                Save
                <kbd className="mono rounded border border-primary-foreground/20 bg-primary-foreground/15 px-1 py-px text-xs text-primary-foreground/85">
                  ⌘↵
                </kbd>
              </button>
            </div>
          </div>

          {/* Missed tasks — surfaced up top so yesterday's slips don't vanish.
			    Self-hides when nothing is overdue. */}
          <div className="mt-6">
            <MissedBanner />
          </div>

          {/* Two-column grid */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-6">
              {/* Today's plans ("Office start · 9:00 AM"), each with what's
							    planned and the ways to add to it. Hidden with none today. */}
              {todayPlans.length > 0 && (
                <Section
                  title={todayPlans.length === 1 ? todayPlans[0].name : 'Plans'}
                  hint={todayPlans.length === 1 ? formatClock(todayPlans[0].start_time) : `${todayPlans.length} today`}
                  action={
                    <Link
                      to={`/journal?date=${today}`}
                      className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Journal <ArrowRight className="size-3" />
                    </Link>
                  }
                >
                  <div className="flex flex-col gap-3">
                    {todayPlans.map((p) => (
                      <PlanCard key={p.id} plan={p} showName={todayPlans.length > 1} />
                    ))}
                  </div>
                </Section>
              )}

              {/* On deck */}
              <Section
                title="On deck"
                hint={`${dueOpen.length} due today`}
                action={
                  <Link
                    to="/tasks"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Open Tasks <ArrowRight className="size-3" />
                  </Link>
                }
              >
                <div className="overflow-hidden rounded-xl bg-[hsl(var(--surface-container))]">
                  {dueOpen.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Nothing scheduled for today.
                    </div>
                  ) : (
                    dueOpenSorted.map((t, i) => (
                      <div
                        key={t.id}
                        onClick={() => openTask(t.id)}
                        role="button"
                        tabIndex={0}
                        className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--surface-container-high))] md:px-5 ${i === 0 ? '' : 'border-t border-border/50'}`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask.mutate({ id: t.id, status: 'done' });
                          }}
                          aria-label="Mark done"
                          className="-m-1 shrink-0 p-1"
                        >
                          {/* The ring, as on the task row: status by shape, priority by colour. */}
                          <TaskRing status={t.status} priority={t.priority} color={t.color} size={20} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium text-foreground">{t.title}</div>
                          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                            {t.parent_task_id != null && (
                              <span
                                className="inline-flex max-w-[12rem] min-w-0 items-center gap-1"
                                title={`Subtask of ${t.parent_task_title || 'another task'}`}
                              >
                                <CornerDownRight className="size-3 shrink-0" aria-hidden />
                                <span className="truncate">{t.parent_task_title || 'Subtask'}</span>
                              </span>
                            )}
                            {t.scheduled_at ? (
                              <span
                                className={`mono inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 leading-none ${
                                  t.remind
                                    ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]'
                                    : 'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]'
                                }`}
                                title={t.remind ? 'Reminder set' : 'Scheduled'}
                              >
                                {t.remind ? <Bell className="size-2.5 fill-current" /> : <Clock className="size-2.5" />}
                                {format(parseISO(t.scheduled_at), 'h:mm a')}
                              </span>
                            ) : t.due_date ? (
                              <DateBadge
                                tone={
                                  isToday(parseISO(t.due_date))
                                    ? 'accent'
                                    : isPast(parseISO(t.due_date))
                                      ? 'alert'
                                      : 'neutral'
                                }
                              >
                                {isToday(parseISO(t.due_date)) ? 'Today' : format(parseISO(t.due_date), 'MMM d')}
                              </DateBadge>
                            ) : null}
                            {t.tags?.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-primary/80">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Section>

              {/* Recent thinking */}
              <Section
                title="Recent thinking"
                hint="last few captures"
                action={
                  <Link
                    to="/memos"
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    All memos <ArrowRight className="size-3" />
                  </Link>
                }
              >
                <div className="flex flex-col gap-2.5">
                  {recentMemos.length === 0 ? (
                    <div className="rounded-xl bg-[hsl(var(--surface-container))] px-5 py-6 text-center text-sm text-muted-foreground">
                      Nothing captured yet. Try the bar above.
                    </div>
                  ) : (
                    recentMemos.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl bg-[hsl(var(--surface-container))] p-4 transition-colors hover:border-border"
                      >
                        <div className="prose-sajni line-clamp-3 text-[14.5px] leading-[1.55]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2 border-t border-border/50 pt-2.5 text-xs">
                          <span className="mono text-muted-foreground">
                            {formatDistanceToNow(parseISO(m.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {m.tags?.map((t) => (
                            <span key={t} className="chip chip-sage">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Section>

              {/* Echo from earlier */}
              {echo && (
                <Section title="Echo from Earlier" hint="surfaced from a few days ago">
                  <div className="sajni-spot rounded-xl bg-[hsl(var(--surface-container))] p-5">
                    <Quote className="mb-2.5 size-4 text-secondary" />
                    <p className="serif mb-3 text-[17px] leading-[1.55] text-foreground/85 italic">
                      {echo.content
                        .replace(/\*\*/g, '')
                        .replace(/\[\[|\]\]/g, '')
                        .slice(0, 220)}
                    </p>
                    <div className="mono label-kicker text-xs text-muted-foreground">
                      YOU · {formatDistanceToNow(parseISO(echo.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </Section>
              )}

              {/* At a glance — kept on the left so the two columns end at
					    roughly the same height. */}
              <Section title="At a Glance">
                <div className="grid grid-cols-2 gap-5 rounded-xl bg-[hsl(var(--surface-container))] p-5">
                  <Stat label="Memos this week" value={String(recentMemos.length === 0 ? 0 : '14')} />
                  <Stat label="Tasks closed" value={String(dueToday.filter((t) => t.status === 'done').length)} />
                  <Stat label="Journal streak" value={`${recentJournal.length}d`} />
                  <Stat label="Habit periods" value={`${habitsDone}/${totalHabitsToday}`} />
                </div>
              </Section>
            </div>

            <div className="flex flex-col gap-6">
              {/* Current habit periods */}
              <Section
                title="Habits"
                hint={totalHabitsToday > 0 ? `${habitsDone}/${totalHabitsToday} current periods` : undefined}
              >
                <div className="rounded-xl bg-[hsl(var(--surface-container))] p-4">
                  {habitStatus.length === 0 ? (
                    <div className="py-2 text-center text-sm text-muted-foreground">No habits yet.</div>
                  ) : (
                    habitStatus.map((h, i) => {
                      const week = habitWeek[h.id] || [];
                      const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
                      const habit = habitsList.find((x) => x.id === h.id);
                      return (
                        <div
                          key={h.id}
                          className={`-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors ${i === 0 ? '' : 'border-t border-border/40'}`}
                        >
                          <button
                            onClick={() => {
                              if (!habit) return;
                              const period = habitPeriodForDate(new Date(), habit.frequency);
                              toggleHabit.mutate({
                                id: h.id,
                                periodStart: period.key,
                                periodEnd: dateKey(period.end),
                                isCurrent: true,
                              });
                            }}
                            className="flex size-11 shrink-0 items-center justify-center rounded-[16px] transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            style={{
                              background: h.logged ? h.color : 'transparent',
                              border: `1.5px solid ${h.logged ? h.color : 'hsl(var(--muted-foreground))'}`,
                              // Same contrast-chosen ink as the habit's name pill.
                              color: inkOn(h.color),
                            }}
                            title={h.logged ? 'Unmark' : 'Mark done'}
                          >
                            {h.logged && (
                              <svg
                                viewBox="0 0 12 12"
                                className="size-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M2 6.5L5 9L10 3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/habits?focus=${h.id}`)}
                            className="min-w-0 flex-1 rounded-md text-left transition-colors outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="truncate text-[13.5px] font-medium text-foreground">{h.name}</div>
                            {habit?.frequency === 'daily' ? (
                              <div className="mt-1.5 flex items-center gap-2">
                                {Array.from({ length: 7 }).map((_, idx) => {
                                  const filled = week[idx];
                                  const isToday = idx === todayIdx;
                                  const isFuture = idx > todayIdx;
                                  return (
                                    <div
                                      key={idx}
                                      // The week fills the row's width.
                                      className="min-w-3.5 flex-1 rounded-full"
                                      style={{
                                        height: isToday ? 8 : 6,
                                        background: filled
                                          ? h.color
                                          : isFuture
                                            ? 'hsl(var(--muted-foreground) / 0.08)'
                                            : 'hsl(var(--muted-foreground) / 0.18)',
                                        boxShadow: isToday ? '0 0 0 1.5px hsl(var(--primary))' : 'none',
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            ) : habit ? (
                              <div className="mono mt-1 text-xs text-muted-foreground">
                                {habitPeriodForDate(new Date(), habit.frequency).label}
                                <span className="ml-1.5 tracking-normal normal-case">
                                  {habit.frequency === 'fortnightly' ? 'two-week period' : habit.frequency}
                                </span>
                              </div>
                            ) : null}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </Section>

              {/* Journal prompt */}
              <Section title="Today's Prompt">
                <div
                  className="rounded-xl bg-[hsl(var(--surface-container))] p-5"
                  style={{ background: 'hsl(var(--surface-container))' }}
                >
                  <div className="mono label-kicker mb-2.5 text-xs text-primary">continued from yesterday</div>
                  <p className="serif mb-3.5 text-[18px] leading-[1.45] text-foreground italic">{journalPrompt}</p>
                  <button
                    onClick={() => navigate('/journal')}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-background/50 text-[13px] text-foreground/85 transition-colors hover:bg-background"
                  >
                    Write today's entry
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="serif text-[20px] leading-tight font-semibold tracking-[-0.01em]">{title}</h2>
          {hint && <div className="mono mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono label-kicker mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="serif text-2xl font-medium tracking-[-0.01em] tabular-nums">{value}</div>
    </div>
  );
}

function CaptureChip({
  kind,
  current,
  onPick,
  label,
}: {
  kind: CaptureKind;
  current: CaptureKind;
  onPick: (k: CaptureKind) => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === kind;
  return (
    // Selection = secondary-container; label only (the icon repeated it).
    <button
      onClick={() => onPick(kind)}
      aria-pressed={active}
      className={`chip transition-colors ${active ? 'chip-selected' : ''}`}
    >
      {label}
    </button>
  );
}
