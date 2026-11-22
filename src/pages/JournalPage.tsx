import { inkOn } from '@/lib/ink';
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  subMonths,
  addMonths,
  subDays,
  addDays,
  isSameMonth,
  isToday as isTodayFn,
  parseISO,
  startOfISOWeek,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  addWeeks,
  subWeeks,
} from 'date-fns';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clientMsg } from '@/lib/errors';
import {
  journal as journalApi,
  habits as habitsApi,
  tasks as tasksApi,
  type JournalLocation,
  type MissedTask,
} from '@/api';
import { useJournalEntry, useJournalList } from '@/queries/journal';
import { useHabitPeriodStatus } from '@/queries/habits';
import { useMissedTasksForDate, useTasks, useToggleTaskStatus } from '@/queries/tasks';
import { useEventDayEntries } from '@/queries/events';
import { useDayPlans } from '@/queries/plans';
import { PlansManager } from '@/components/plans/PlansManager';
import { PlansPanel } from '@/components/plans/PlansPanel';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { habitPeriodForDate } from '@/lib/habit-periods';
import MarkdownEditor from '@/components/editor/MarkdownEditor';
import { useVimKeys } from '@/lib/vimPref';
import VimStatusBar, { StatusSeg } from '@/components/editor/VimStatusBar';
import { countText } from '@/pages/notes/model';
import LocationPill from '@/components/editor/LocationPill';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { M3CookieLoader } from '@/components/ui/shapes';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { useTaskDetail } from '@/components/tasks/TaskDetailProvider';
import type { BacklinkRef, HabitStatus, Task } from '@/types';
import TaskScopeBadge from '@/components/tasks/TaskScopeBadge';
import { DateBadge } from '@/components/ui/state-chip';
import { Money } from '@/pages/Finance/Money';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Target,
  CheckSquare,
  Trash2,
  AlertCircle,
  ArrowRight,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Calendar as CalendarIcon,
  ChevronDown,
  Check as LucideCheck,
  Plus,
  CalendarRange,
  Clock,
} from '@/components/ui/icons';

interface TaskItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date?: string | null;
}
interface JournalEntry {
  id: number;
  date: string;
  tags: string[];
  updated_at: string;
}
type RingStyle = React.CSSProperties & { '--tw-ring-color': string };

function ringStyle(color: string): RingStyle {
  return { background: color, '--tw-ring-color': `${color}55` };
}

const SIDEBAR_KEY = 'sajni:journal-sidebar';
const DAILY_KEY = 'sajni:journal-daily';
const MARGIN_KEY = 'sajni:journal-margin';
const EXPANDED_MONTHS_KEY = 'sajni:journal-months';

export default function JournalPage() {
  const vimKeys = useVimKeys();
  const [vimHost, setVimHost] = useState<HTMLDivElement | null>(null);
  // The week / month text and save state, reported up for the status line.
  const [periodText, setPeriodText] = useState('');
  const [periodSaving, setPeriodSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date') || format(new Date(), 'yyyy-MM-dd');
  const todayKey = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMonth, setViewMonth] = useState(parseISO(initialDate));
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [location, setLocation] = useState<JournalLocation | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRef[]>([]);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [habitStatuses, setHabitStatuses] = useState<HabitStatus[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [dailyOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DAILY_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [marginOpen, setMarginOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MARGIN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [mobileMarginOpen, setMobileMarginOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { openTask } = useTaskDetail();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_MONTHS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set([format(new Date(), 'yyyy-MM')]);
    } catch {
      return new Set([format(new Date(), 'yyyy-MM')]);
    }
  });

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0');
    } catch {}
  }, [sidebarOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(DAILY_KEY, dailyOpen ? '1' : '0');
    } catch {}
  }, [dailyOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(MARGIN_KEY, marginOpen ? '1' : '0');
    } catch {}
  }, [marginOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_MONTHS_KEY, JSON.stringify(Array.from(expandedMonths)));
    } catch {}
  }, [expandedMonths]);

  // View mode is derived from URL: `?view=week&week=YYYY-Www` triggers the
  // weekly entry surface, `?view=month&month=YYYY-MM` the monthly one;
  // otherwise we render the daily editor. Day clicks strip the view params
  // back out (see the date-sync effect below).
  const viewParam = params.get('view');
  const weekParam = params.get('week');
  const weekMatch = weekParam ? weekParam.match(/^(\d{4})-W(\d{1,2})$/) : null;
  const monthParam = params.get('month');
  const monthMatch = monthParam ? monthParam.match(/^(\d{4})-(\d{1,2})$/) : null;
  const viewMode: 'day' | 'week' | 'month' =
    viewParam === 'week' && weekMatch ? 'week' : viewParam === 'month' && monthMatch ? 'month' : 'day';
  const weekYear = weekMatch ? parseInt(weekMatch[1], 10) : getISOWeekYear(parseISO(selectedDate));
  const weekNumber = weekMatch ? parseInt(weekMatch[2], 10) : getISOWeek(parseISO(selectedDate));
  const activeWeekKey = viewMode === 'week' ? `${weekYear}-W${String(weekNumber).padStart(2, '0')}` : null;
  const monthYear = monthMatch ? parseInt(monthMatch[1], 10) : parseISO(selectedDate).getFullYear();
  const monthNumber = monthMatch ? parseInt(monthMatch[2], 10) : parseISO(selectedDate).getMonth() + 1;

  // Sync URL when date changes. Also clear week/month-view params so picking a
  // day in either aggregate view reverts to the daily editor.
  useEffect(() => {
    const next = new URLSearchParams(params);
    let touched = false;
    if (params.get('date') !== selectedDate) {
      next.set('date', selectedDate);
      touched = true;
    }
    if (params.get('view') === 'week' || params.get('view') === 'month') {
      next.delete('view');
      next.delete('week');
      next.delete('month');
      touched = true;
    }
    if (touched) setParams(next, { replace: true });
    setExpandedMonths((prev) => new Set([...prev, selectedDate.slice(0, 7)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const goWeek = useCallback(
    (year: number, week: number) => {
      const next = new URLSearchParams(params);
      next.set('view', 'week');
      next.set('week', `${year}-W${String(week).padStart(2, '0')}`);
      next.delete('month');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const goMonth = useCallback(
    (year: number, month: number) => {
      const next = new URLSearchParams(params);
      next.set('view', 'month');
      next.set('month', `${year}-${String(month).padStart(2, '0')}`);
      next.delete('week');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const { data: entriesData } = useJournalList();
  const entries = useMemo(() => (entriesData ?? []) as JournalEntry[], [entriesData]);
  const { data: eventDayEntries = [], isLoading: loadingEvents } = useEventDayEntries(selectedDate);
  const { data: entryData, isLoading: loadingEntry } = useJournalEntry(selectedDate);
  const loading = loadingEntry;
  // No `= []` default: a fresh array each render would re-run the effect below
  // forever while the query loads or fails, freezing the page.
  const { data: habitStatusData, isLoading: loadingHabits } = useHabitPeriodStatus(selectedDate);
  const { data: dueTaskData = [], isLoading: loadingDueTasks } = useTasks({ due_date: selectedDate });
  const { data: doneTaskData = [], isLoading: loadingDoneTasks } = useTasks({ done_date: selectedDate });
  const { data: missedTasks = [], isLoading: loadingMissedTasks } = useMissedTasksForDate(selectedDate);
  const { data: dayPlans = [], isLoading: loadingPlans } = useDayPlans(selectedDate);
  const [plansEditor, setPlansEditor] = useState<{ open: boolean; id: number | 'new' | null }>({
    open: false,
    id: null,
  });
  // A plan's tasks show under the plan, not again in Tasks.
  const planIds = useMemo(() => new Set(dayPlans.map((p) => p.id)), [dayPlans]);
  const inPlan = (t: Task) => t.plan_id != null && planIds.has(t.plan_id) && t.due_date === selectedDate;
  const dueTasks = dueTaskData.filter((t) => t.status !== 'done' && t.status !== 'scratched' && !inPlan(t));
  const doneTasks = doneTaskData.filter((t) => !inPlan(t));
  const loadingTasks = loadingDueTasks || loadingDoneTasks || loadingMissedTasks;
  const toggleTaskStatus = useToggleTaskStatus();
  // Editor writes go through journalApi (day-scoped); refresh the cached list
  // (and any other journal view) after a save/delete.
  const loadEntries = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.journal.list() });
  }, [qc]);

  useEffect(() => {
    if (!entryData) return;
    dirtyRef.current = false;
    setContent(entryData.content || '');
    setLocation(
      entryData.location_label
        ? { label: entryData.location_label, lat: entryData.location_lat ?? null, lon: entryData.location_lon ?? null }
        : null,
    );
    setTags(entryData.tags || []);
    setBacklinks(entryData.backlinks || []);
  }, [entryData, selectedDate]);

  useEffect(() => {
    setHabitStatuses(habitStatusData ?? []);
  }, [habitStatusData, selectedDate]);

  const performSave = useCallback(
    async (silent = false) => {
      if (!silent) setSavingState('saving');
      try {
        await journalApi.save(selectedDate, content, location);
        const entry = await journalApi.get(selectedDate);
        qc.setQueryData(qk.journal.entry(selectedDate), entry);
        setTags(entry.tags || []);
        setBacklinks(entry.backlinks || []);
        setSavingState('saved');
        setTimeout(() => setSavingState((s) => (s === 'saved' ? 'idle' : s)), 1400);
        dirtyRef.current = false;
        loadEntries();
      } catch (err) {
        console.error(err);
        setSavingState('idle');
      }
    },
    [selectedDate, content, location, loadEntries, qc],
  );

  // Debounced auto-save when dirty
  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => performSave(true), 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, location, performSave, loading]);

  const handleContentChange = (v: string) => {
    dirtyRef.current = true;
    setContent(v);
  };
  const handleLocationChange = (v: JournalLocation | null) => {
    dirtyRef.current = true;
    setLocation(v);
  };

  const toggleHabit = async (habitId: number) => {
    if (selectedDate > todayKey) return;
    const habit = habitStatuses.find((item) => item.id === habitId);
    if (!habit?.period_start) return;
    setHabitStatuses((prev) => prev.map((h) => (h.id === habitId ? { ...h, logged: !h.logged } : h)));
    await habitsApi.togglePeriod(habitId, habit.period_start);
    qc.invalidateQueries({ queryKey: qk.habits.all });
  };

  const markTaskDone = (taskId: number) => {
    toggleTaskStatus.mutate({ id: taskId, status: 'done' });
  };

  const reopenTask = (taskId: number) => {
    toggleTaskStatus.mutate({ id: taskId, status: 'todo' });
  };

  const deleteEntry = async () => {
    if (!(await confirmDialog(`Delete journal entry for ${selectedDate}?`))) return;
    await journalApi.delete(selectedDate);
    qc.setQueryData(qk.journal.entry(selectedDate), {
      id: 0,
      date: selectedDate,
      content: '',
      location_label: '',
      location_lat: null,
      location_lon: null,
      tags: [],
      backlinks: [],
      created_at: '',
      updated_at: '',
    });
    setContent('');
    setLocation(null);
    setTags([]);
    setBacklinks([]);
    loadEntries();
  };

  const goToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setSelectedDate(today);
    setViewMonth(new Date());
  };
  const goPrev = () => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
  const goNext = () => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));

  // Page-level keymap. Editor-local shortcuts (⌘B/I/U, ⌘⇧7/8, ⌘⇧C
  // checklist, slash menu) are already wired in MarkdownEditor. These extras
  // give the journal page parity with the iOS Journal experience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Alt+[ / Alt+] change the day (by key position, so any layout works).
      if (e.altKey && !mod && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault();
        if (e.code === 'BracketLeft') goPrev();
        else goNext();
        return;
      }
      if (!mod) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        performSave();
      } else if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]:has(.lucide-map-pin)');
        btn?.click();
      } else if (!e.shiftKey && e.key === '[') {
        e.preventDefault();
        goPrev();
      } else if (!e.shiftKey && e.key === ']') {
        e.preventDefault();
        goNext();
      } else if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        goToday();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // performSave / handlers are stable enough; intentionally narrow deps to
    // avoid re-binding on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, performSave]);

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');
  const dateObj = parseISO(selectedDate);
  const entryDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const key = e.date.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const contextPanel = (
    <div className="flex flex-col gap-6 p-4">
      <PlansPanel
        date={selectedDate}
        today={todayKey}
        plans={dayPlans}
        loading={loadingPlans}
        onEdit={(id) => setPlansEditor({ open: true, id })}
      />

      {/* Tasks today */}
      <section>
        <PanelHeading title="Tasks" onOpen={() => navigate('/tasks')} />
        {loadingTasks ? (
          <Skeleton className="h-16 w-full" />
        ) : dueTasks.length === 0 && doneTasks.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            {dueTasks.map((t) => (
              <div key={t.id} className="group flex items-start gap-2.5">
                <button onClick={() => markTaskDone(t.id)} title="Mark done" className="mt-0.5 shrink-0">
                  <Checkbox checked={false} className="pointer-events-none" tabIndex={-1} />
                </button>
                <button
                  onClick={() => openTask(t.id)}
                  className="flex-1 text-left text-[12.5px] leading-snug text-foreground/85 transition-colors hover:text-foreground"
                  title="Open task"
                >
                  {t.title}
                </button>
              </div>
            ))}
            {doneTasks.map((t) => (
              <div key={t.id} className="group flex items-start gap-2.5">
                <button onClick={() => reopenTask(t.id)} title="Mark not done" className="mt-0.5 shrink-0">
                  <Checkbox checked={true} className="pointer-events-none" tabIndex={-1} />
                </button>
                <button
                  onClick={() => openTask(t.id)}
                  className="flex-1 text-left text-[12.5px] leading-snug text-muted-foreground line-through transition-colors hover:text-foreground/70"
                  title="Open task"
                >
                  {t.title}
                </button>
              </div>
            ))}
          </div>
        )}
        <QuickAddTask dueDate={selectedDate} />
        {missedTasks.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertCircle className="size-3" /> Missed
            </div>
            <div className="flex flex-col gap-1.5">
              {missedTasks.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t.id)}
                  className="truncate text-left text-[12px] text-foreground/70 transition-colors hover:text-foreground"
                  title="Open task"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Habit periods containing the selected date */}
      <section>
        <PanelHeading title="Habits" onOpen={() => navigate('/habits')} />
        {loadingHabits ? (
          <Skeleton className="h-16 w-full" />
        ) : habitStatuses.length === 0 ? (
          <div className="text-xs text-muted-foreground">None</div>
        ) : (
          <div className="flex flex-col">
            {habitStatuses.map((h) => (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                disabled={selectedDate > todayKey}
                className="group -mx-1.5 flex min-h-9 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors outline-none hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-45"
              >
                <span
                  className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
                  style={{
                    background: h.logged ? h.color : 'transparent',
                    borderColor: h.logged ? h.color : 'hsl(var(--on-surface-variant))',
                    color: '#fff',
                  }}
                >
                  {h.logged && <LucideCheck className="size-3 stroke-[3px]" />}
                </span>
                {/* One line per habit: cadence rides as a badge, not a
                    second line, so the list reads as a column of names. */}
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/85">{h.name}</span>
                {h.frequency !== 'daily' && (
                  <DateBadge>
                    {h.frequency === 'fortnightly' ? '2 wk' : h.frequency === 'weekly' ? 'Week' : 'Month'}
                  </DateBadge>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Events are historical context: read-only here, editable on the event timeline. */}
      <section>
        <PanelHeading title="Events" onOpen={() => navigate('/habits?tab=events')} />
        {loadingEvents ? (
          <Skeleton className="h-14 w-full" />
        ) : eventDayEntries.length === 0 ? (
          <div className="text-xs text-muted-foreground">None</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {eventDayEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => navigate(`/habits?tab=events&id=${entry.event_id}`)}
                className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 text-left transition-colors outline-none hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-[12px]"
                  style={{ color: entry.color, backgroundColor: `${entry.color}20` }}
                >
                  <Clock className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-foreground/85">{entry.event_name}</span>
                  {entry.note && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{entry.note}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {format(new Date(entry.occurred_at), 'h:mm a')}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Backlinks: only when something links here. */}
      {backlinks.length > 0 && (
        <section>
          <PanelHeading title="Backlinks" />
          {
            <div className="flex flex-col gap-2">
              {backlinks.map((bl, i) => (
                <div key={i} className="text-[12.5px] text-primary">
                  <div className="truncate underline decoration-primary/30 underline-offset-2">
                    [[{bl.title || 'Untitled'}]]
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground capitalize">{bl.source_type}</div>
                </div>
              ))}
            </div>
          }
        </section>
      )}
    </div>
  );

  // Vault rail body (streak + mini-calendar + entries list). Shared between the
  // desktop left aside and the mobile left Sheet so mobile regains the calendar
  // grid + week/month entry nav (previously md:flex-only). On mobile, a pick
  // that navigates closes the drawer; in-place toggles (month nav, expand) don't.
  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const sidebarContent = (
    <>
      {/* Streak header — small but visible cue at the top of the rail. */}
      <div className="px-4 py-3.5" title="Entries in the last 14 days">
        <div className="flex items-baseline gap-2">
          <span className="serif text-2xl font-medium tracking-tight tabular-nums">{entries.length}</span>
          <span className="text-xs text-muted-foreground">entr{entries.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className="mt-2 flex gap-[3px]">
          {Array.from({ length: 14 }).map((_, i) => {
            const d = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd');
            const has = entryDates.has(d);
            return (
              <div
                key={i}
                className="h-1 flex-1 rounded-sm"
                style={{ background: has ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.18)' }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 p-2.5">
        <div className="flex gap-1">
          <Button
            onClick={() => {
              goToday();
              closeMobileSidebar();
            }}
            size="xs"
            variant="ghost"
            className="flex-1 justify-center gap-1.5 text-xs font-normal"
          >
            <CalendarIcon className="size-3.5" /> Today
          </Button>
        </div>

        {/* Calendar */}
        <div className="px-1 pt-1.5">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            {/* Clicking the month name opens the monthly journal view
                (parallel to clicking a week number for the weekly view). */}
            <button
              type="button"
              onClick={() => {
                goMonth(viewMonth.getFullYear(), viewMonth.getMonth() + 1);
                closeMobileSidebar();
              }}
              title="Open monthly entry"
              className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground ${
                viewMode === 'month' &&
                monthYear === viewMonth.getFullYear() &&
                monthNumber === viewMonth.getMonth() + 1
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                  : ''
              }`}
            >
              {format(viewMonth, 'MMMM yyyy')}
            </button>
            <button
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <CalendarGrid
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            entryDates={entryDates}
            activeWeekKey={activeWeekKey}
            onPick={(d) => {
              setSelectedDate(d);
              closeMobileSidebar();
            }}
            onPickWeek={(y, w) => {
              goWeek(y, w);
              closeMobileSidebar();
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1.5">
        {groupedByMonth.length === 0 ? (
          <div className="px-3 py-12 text-center text-xs text-muted-foreground">No entries yet</div>
        ) : (
          groupedByMonth.map(([monthKey, list]) => {
            const isExpanded = expandedMonths.has(monthKey);
            const monthLabel = format(parseISO(monthKey + '-01'), 'MMMM yyyy');
            return (
              <div key={monthKey}>
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className="group flex w-full items-center gap-1 rounded-md px-1 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-sidebar-accent/40"
                >
                  <ChevronRight className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <span className="flex-1 truncate text-left">{monthLabel}</span>
                  <span className="text-xs tabular-nums opacity-60">{list.length}</span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {list.map((e) => (
                        <EntryRow
                          key={e.date}
                          entry={e}
                          selected={selectedDate === e.date}
                          onClick={() => {
                            setSelectedDate(e.date);
                            closeMobileSidebar();
                          }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  // No chrome row at all — the serif date hero IS the page header, and
  // every control rides its trailing cluster (see day view below).
  const heroControls = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={goPrev}
        title="Previous day"
        aria-label="Previous day"
      >
        <ChevronLeft className="size-4" />
      </Button>
      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={goToday}
          className="h-8 rounded-full px-2.5 text-xs text-[hsl(var(--primary))]"
        >
          Today
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        onClick={goNext}
        title="Next day"
        aria-label="Next day"
      >
        <ChevronRight className="size-4" />
      </Button>
      <span className="mx-1 h-4 w-px bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
      <SaveStatus state={savingState} onSave={() => performSave()} />
      {entryDates.has(selectedDate) && (
        <Button variant="destructive-ghost" size="icon-sm" onClick={deleteEntry} title="Delete entry">
          <Trash2 className="size-4" />
        </Button>
      )}
      <span className="mx-1 h-4 w-px bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => (isMobile ? setMobileSidebarOpen(true) : setSidebarOpen((v) => !v))}
        className="shrink-0 rounded-full"
        title={isMobile ? 'Journal & calendar' : sidebarOpen ? 'Hide journal' : 'Show journal'}
      >
        {isMobile ? (
          <PanelLeft className="size-4" />
        ) : sidebarOpen ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <PanelLeft className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => (isMobile ? setMobileMarginOpen(true) : setMarginOpen((v) => !v))}
        className="shrink-0 rounded-full"
        title={isMobile ? 'Show context' : marginOpen ? 'Hide context' : 'Show context'}
      >
        {marginOpen && !isMobile ? <PanelRightClose className="size-4" /> : <PanelRight className="size-4" />}
      </Button>
    </div>
  );

  return (
    <div className="page-fade-in flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Editor pane (CENTER) — pads below the floating primary pill
            (desktop); mobile has no top chrome, just the safe area. */}
        <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isMobile ? 8 : 72}px)` }}
          >
            {viewMode === 'week' ? (
              <WeekView
                vimStatus={vimHost}
                onText={setPeriodText}
                onSaving={setPeriodSaving}
                year={weekYear}
                week={weekNumber}
                onPickDay={(d) => setSelectedDate(d)}
                onShiftWeek={(delta) => {
                  const ref = isoWeekDateFromKey(weekYear, weekNumber);
                  const shifted = delta > 0 ? addWeeks(ref, delta) : subWeeks(ref, -delta);
                  goWeek(getISOWeekYear(shifted), getISOWeek(shifted));
                }}
              />
            ) : viewMode === 'month' ? (
              <MonthView
                vimStatus={vimHost}
                onText={setPeriodText}
                onSaving={setPeriodSaving}
                year={monthYear}
                month={monthNumber}
                onPickWeek={goWeek}
                onShiftMonth={(delta) => {
                  const ref = addMonths(new Date(monthYear, monthNumber - 1, 1), delta);
                  goMonth(ref.getFullYear(), ref.getMonth() + 1);
                }}
              />
            ) : (
              <div className="mx-auto flex min-h-full w-full max-w-[88rem] flex-col gap-5 px-4 pt-6 pb-32 md:px-8 md:pt-8 lg:px-10">
                {/* Date title — Obsidian-style serif hero; ALL page controls
                    ride its trailing edge (no chrome rows above). */}
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.02em] md:text-5xl">
                      {format(dateObj, 'EEEE')}
                    </h1>
                    <div className="serif mt-1 text-base text-muted-foreground italic md:text-lg">
                      {format(dateObj, 'MMMM d, yyyy')}
                    </div>
                  </div>
                  <div className="mt-1">{heroControls}</div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <LocationPill value={location} onChange={handleLocationChange} />
                </div>

                {/* Editor — fills the available height (≈80–90%) like Notes. */}
                <div className="flex min-h-0 flex-1 flex-col">
                  {loading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <MarkdownEditor
                      value={content}
                      onChange={handleContentChange}
                      placeholder="Write about your day. Use / for commands, [[ to link, # for tags…"
                      fill
                      contextDate={selectedDate}
                      vim={vimKeys}
                      vimStatus={vimHost}
                      onSave={() => {
                        void performSave();
                      }}
                    />
                  )}
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
                    {tags.map((tag) => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* With Vim keys: a fixed status line under the text (mode, prompts, messages). */}
          {vimKeys && !isMobile && (
            <VimStatusBar ref={setVimHost} status={<SaveSeg state={viewMode === 'day' ? savingState : periodSaving} />}>
              <WordCount text={viewMode === 'week' || viewMode === 'month' ? periodText : content} />
            </VimStatusBar>
          )}
        </div>

        {/* Right margin — context dock (desktop) */}
        <AnimatePresence initial={false} mode="popLayout">
          {marginOpen && (
            <motion.aside
              key="right-margin"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="order-3 hidden shrink-0 flex-col overflow-hidden bg-[hsl(var(--surface-container-low))] md:flex"
            >
              <div className="overflow-y-auto pt-5">{contextPanel}</div>
            </motion.aside>
          )}
        </AnimatePresence>

        <PlansManager
          open={plansEditor.open}
          initialId={plansEditor.id}
          onOpenChange={(open) => setPlansEditor((v) => ({ ...v, open }))}
        />

        {/* Mobile right margin — bottom sheet */}
        <Sheet open={mobileMarginOpen} onOpenChange={setMobileMarginOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] overflow-y-auto border-t border-border bg-popover px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:hidden"
          >
            <div className="mx-auto mb-3 h-[3px] w-9 bg-muted-foreground/35" aria-hidden="true" />
            <SheetHeader className="p-0 px-2">
              <SheetTitle className="serif text-base tracking-tight normal-case">This day</SheetTitle>
            </SheetHeader>
            {contextPanel}
          </SheetContent>
        </Sheet>

        {/* Sidebar — LEFT (entries + mini calendar, design-aligned) */}
        <AnimatePresence initial={false} mode="popLayout">
          {sidebarOpen && (
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="order-1 hidden shrink-0 flex-col overflow-hidden bg-[hsl(var(--surface-container-low))] md:flex"
            >
              {sidebarContent}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile vault — left drawer. Same rail as desktop so phones regain the
          calendar grid + week/month entry nav (the desktop aside is md:flex). */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="flex w-[86vw] max-w-[20rem] flex-col bg-sidebar p-0 pt-[env(safe-area-inset-top)] md:hidden"
          >
            <SheetHeader className="sr-only p-0">
              <SheetTitle>Journal & Calendar</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/* ---------- Components ---------- */

// isoWeekDateFromKey returns the Monday of a given ISO year+week.
// Anchors on Jan 4 (always in W1) and shifts forward week-1 weeks.
/** Words ⟩ characters, the Vim status line's right chain; counted off the typing path. */
function WordCount({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  const { words, characters } = useMemo(() => countText(deferred), [deferred]);
  return (
    <>
      <StatusSeg tone={1}>
        {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
      </StatusSeg>
      <StatusSeg tone={3}>
        {characters.toLocaleString()} {characters === 1 ? 'character' : 'characters'}
      </StatusSeg>
    </>
  );
}

/** Tucked under the mode chip while an entry saves, and briefly after. */
function SaveSeg({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  if (state === 'idle') return null;
  return (
    <StatusSeg tone={2} className="min-w-[5.75rem]">
      {state === 'saving' ? (
        <>
          <M3CookieLoader size="xs" tone="primary" /> Saving
        </>
      ) : (
        'Saved'
      )}
    </StatusSeg>
  );
}

function isoWeekDateFromKey(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const start = startOfISOWeek(jan4);
  return addWeeks(start, week - 1);
}

function WeekView({
  year,
  week,
  onPickDay,
  onShiftWeek,
  vimStatus,
  onText,
  onSaving,
}: {
  vimStatus: HTMLElement | null;
  /** The text as it changes (status line counts). */
  onText?: (text: string) => void;
  /** The save state as it changes (status line). */
  onSaving?: (state: 'idle' | 'saving' | 'saved') => void;
  year: number;
  week: number;
  onPickDay: (date: string) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const vimKeys = useVimKeys();
  const onTextRef = useRef(onText);
  const onSavingRef = useRef(onSaving);
  useLayoutEffect(() => {
    onTextRef.current = onText;
    onSavingRef.current = onSaving;
  });
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => {
    onSavingRef.current?.(saving);
  }, [saving]);
  const [summary, setSummary] = useState<import('@/api').WeeklySummary | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monday = useMemo(() => isoWeekDateFromKey(year, week), [year, week]);
  const sunday = useMemo(() => endOfISOWeek(monday), [monday]);
  const mondayKey = useMemo(() => format(monday, 'yyyy-MM-dd'), [monday]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  // Week-scoped tasks (week_of = this Monday) — the "This week" section. Kept
  // separate from the per-day breakdown since they have no specific day.
  const qc = useQueryClient();
  const [weekTasks, setWeekTasks] = useState<Task[]>([]);
  const loadWeekTasks = useCallback(() => {
    tasksApi
      .list({ week_of: mondayKey })
      .then(setWeekTasks)
      .catch(() => setWeekTasks([]));
  }, [mondayKey]);
  useEffect(() => {
    loadWeekTasks();
  }, [loadWeekTasks]);

  const toggleWeekTask = async (t: Task) => {
    const next = t.status === 'done' ? 'todo' : 'done';
    setWeekTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await tasksApi.update(t.id, { status: next });
    } catch (e) {
      setWeekTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      toast.error(clientMsg(e, 'Could not update task'));
      return;
    }
    qc.invalidateQueries({ queryKey: qk.tasks.all });
  };
  const addWeekTask = async (title: string) => {
    await tasksApi.create({ title, week_of: mondayKey });
    loadWeekTasks();
    qc.invalidateQueries({ queryKey: qk.tasks.all });
    qc.invalidateQueries({ queryKey: qk.tags.all });
  };

  // Load entry + summary whenever the week changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    dirtyRef.current = false;
    (async () => {
      try {
        const [entry, summ] = await Promise.all([journalApi.week.get(year, week), journalApi.week.summary(year, week)]);
        if (!alive) return;
        setContent(entry.content || '');
        onTextRef.current?.(entry.content || '');
        setSummary(summ);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [year, week]);

  // Debounced auto-save.
  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving('saving');
      try {
        await journalApi.week.save(year, week, content);
        setSaving('saved');
        setTimeout(() => setSaving((s) => (s === 'saved' ? 'idle' : s)), 1400);
        dirtyRef.current = false;
      } catch {
        setSaving('idle');
      }
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, loading, year, week]);

  const handleContent = (v: string) => {
    dirtyRef.current = true;
    setContent(v);
    onTextRef.current?.(v);
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const totalDone = summary?.days.reduce((acc, d) => acc + d.tasks_done, 0) ?? 0;
  const totalDue = summary?.days.reduce((acc, d) => acc + d.tasks_due + d.tasks_done, 0) ?? 0;
  const totalMissed = summary?.days.reduce((acc, d) => acc + d.tasks_missed, 0) ?? 0;
  const entriesWritten = summary?.days.filter((d) => d.has_entry).length ?? 0;
  const habitProgress = summary?.habits.reduce(
    (acc, habit) => {
      const target = habit.frequency === 'daily' ? 7 : 1;
      const done = habit.frequency === 'daily' ? habit.logged_days.length : Number(habit.period_logged);
      return { done: acc.done + done, target: acc.target + target };
    },
    { done: 0, target: 0 },
  ) ?? { done: 0, target: 0 };

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-8 px-4 pt-10 pb-32 md:px-8 lg:px-10">
      {/* Title + week shift controls. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono label-kicker mb-1.5 text-xs text-muted-foreground">weekly entry</div>
          <h1 className="serif text-5xl leading-[1.02] font-normal tracking-[-0.02em] md:text-6xl">
            Week {week}, {year}
          </h1>
          <div className="serif mt-1.5 text-lg text-muted-foreground italic md:text-xl">
            {format(monday, 'MMM d')} – {format(sunday, 'MMM d, yyyy')}
          </div>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(-1)} title="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="mono min-w-[52px] px-1 text-center text-xs text-muted-foreground tabular-nums">
            {saving === 'saving' ? 'Saving' : saving === 'saved' ? 'Saved' : ''}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(1)} title="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* At-a-glance stats — M3 expressive: surface-container-low + serif numerals. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Tasks done" value={`${totalDone}/${totalDue}`} tone="primary" />
        <StatTile label="Missed" value={String(totalMissed)} tone={totalMissed > 0 ? 'destructive' : 'muted'} />
        <StatTile label="Entries" value={`${entriesWritten}/7`} tone="tertiary" />
        <StatTile
          label="Expenses"
          value={
            summary ? (
              <Money value={summary.expense_total} currency={summary.expense_currency || 'INR'} privacy={false} />
            ) : (
              '–'
            )
          }
          tone="secondary"
        />
      </div>

      {/* Editor — full-width, no card chrome. Matches the daily entry
          layout so the weekly entry reads as a longer-form journal rather
          than a panel inside the page. */}
      <div className="flex flex-col">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <MarkdownEditor
            value={content}
            onChange={handleContent}
            placeholder="What do you want this week to be about? Use / for commands, [[ to link, /task to reference…"
            minHeight="280px"
            contextDate={mondayKey}
            vim={vimKeys}
            vimStatus={vimStatus}
          />
        )}
      </div>

      {/* This week — week-scoped tasks (no specific day), checkable inline. */}
      <WeekTasksSection
        tasks={weekTasks}
        onToggle={toggleWeekTask}
        onAdd={addWeekTask}
        onOpen={(id) => window.dispatchEvent(new CustomEvent('task:open', { detail: { id } }))}
      />

      {/* 7-day task breakdown */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <CheckSquare className="size-3.5 text-secondary" />
          <span className="label-kicker font-mono text-xs text-muted-foreground">Tasks by day</span>
        </div>
        <div className="divide-y divide-border/40">
          {weekDays.map((day, i) => {
            const ds = format(day, 'yyyy-MM-dd');
            const stat = summary?.days[i];
            const isCurrent = ds === today;
            const totalForDay = (stat?.tasks_due ?? 0) + (stat?.tasks_done ?? 0);
            const ratio = totalForDay > 0 ? stat!.tasks_done / totalForDay : 0;
            return (
              <button
                key={ds}
                onClick={() => onPickDay(ds)}
                className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
                  isCurrent ? 'bg-primary/[0.04]' : ''
                }`}
              >
                <div
                  className={`flex w-14 shrink-0 flex-col items-center ${
                    isCurrent ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <span className="mono label-kicker text-xs">{format(day, 'EEE')}</span>
                  <span
                    className={`serif text-2xl leading-none font-medium tabular-nums ${
                      isCurrent ? 'text-primary' : 'text-foreground/90'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[13px] ${isCurrent ? 'font-medium text-primary' : 'text-foreground/85'}`}>
                      {format(day, 'MMMM')}
                    </span>
                    {stat?.has_entry && <span className="mono label-kicker text-xs text-primary/70">entry</span>}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted-foreground/15">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="mono text-xs text-foreground/80 tabular-nums">
                    {stat ? `${stat.tasks_done}/${totalForDay}` : '–'}
                  </span>
                  {stat && stat.tasks_missed > 0 ? (
                    <span className="mono text-xs text-destructive/80 tabular-nums">{stat.tasks_missed} missed</span>
                  ) : (
                    <span className="mono text-xs text-muted-foreground/60">on track</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Habits — full-width tracker. Bigger affordances, M3 expressive
          tonal cards per row, weekly streak summary on the right. */}
      <section className="overflow-hidden rounded-3xl bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-5 py-3">
          <Target className="size-4 text-primary" />
          <span className="label-kicker font-mono text-xs tracking-[0.18em] text-foreground/80">Habits this week</span>
          {summary && summary.habits.length > 0 && (
            <span className="mono label-kicker ml-auto text-xs text-muted-foreground tabular-nums">
              {habitProgress.done}/{habitProgress.target} periods
            </span>
          )}
        </div>
        <div className="p-5">
          {!summary || summary.habits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-10 text-center">
              <p className="serif text-base text-muted-foreground italic">No habits tracked yet.</p>
              <p className="mono label-kicker mt-2 text-xs text-muted-foreground/70">
                Add habits from the Habits page to start the streak.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {summary.habits.map((h) => {
                const logged = new Set(h.logged_days);
                const target = h.frequency === 'daily' ? 7 : 1;
                const done = h.frequency === 'daily' ? h.logged_days.length : Number(h.period_logged);
                const ratio = done / target;
                const isPerfect = done === target;
                const cadencePeriod = habitPeriodForDate(parseISO(h.period_start), h.frequency);
                return (
                  <div
                    key={h.id}
                    className="flex flex-col gap-3 rounded-2xl bg-surface-container-low/40 px-4 py-3.5 transition-colors hover:bg-surface-container-low/70"
                  >
                    {/* Row header: color swatch · name · count badge. */}
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background"
                        style={ringStyle(h.color)}
                      />
                      <span className="flex-1 truncate text-[14px] font-medium text-foreground/90">{h.name}</span>
                      <span className="mono label-kicker text-xs tracking-[0.08em] text-muted-foreground">
                        {h.frequency === 'fortnightly' ? '2 weeks' : h.frequency}
                      </span>
                      <span
                        className={`mono label-kicker rounded-full px-2.5 py-0.5 text-xs tabular-nums ${
                          isPerfect
                            ? 'bg-primary text-primary-foreground'
                            : ratio >= 0.5
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done}/{target}
                      </span>
                    </div>

                    {h.frequency === 'daily' ? (
                      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                        {weekDays.map((day) => {
                          const ds = format(day, 'yyyy-MM-dd');
                          const on = logged.has(ds);
                          const isToday = ds === today;
                          return (
                            <div
                              key={ds}
                              title={`${format(day, 'EEE d')} · ${on ? 'logged' : 'not logged'}`}
                              className="flex flex-col items-center gap-1"
                            >
                              <span className="mono label-kicker text-xs text-muted-foreground/70">
                                {format(day, 'EEEEE')}
                              </span>
                              <span
                                className={`flex h-9 w-full items-center justify-center rounded-xl transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
                                  on ? 'shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]' : ''
                                } ${isToday && !on ? 'ring-1 ring-primary/40' : ''}`}
                                style={{
                                  background: on ? h.color : 'hsl(var(--muted-foreground) / 0.08)',
                                }}
                              >
                                {on ? (
                                  <svg className="size-4 text-white" viewBox="0 0 12 12">
                                    <path
                                      d="M10 3L4.5 8.5 2 6"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                ) : (
                                  <span
                                    className="size-1.5 rounded-full"
                                    style={{ background: 'hsl(var(--muted-foreground) / 0.35)' }}
                                  />
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl bg-[hsl(var(--surface-container))] p-2">
                        <span
                          className="mono grid size-11 place-items-center rounded-[18px] text-xs font-semibold"
                          style={{
                            background: h.period_logged ? h.color : 'hsl(var(--surface-container-highest))',
                            color: h.period_logged ? inkOn(h.color) : 'hsl(var(--on-surface-variant))',
                            boxShadow: h.period_logged ? 'none' : 'inset 0 0 0 1px hsl(var(--outline-variant))',
                          }}
                        >
                          {h.period_logged ? <LucideCheck className="size-4" /> : cadencePeriod.label}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{cadencePeriod.accessibleLabel}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {h.period_logged ? 'Completed' : 'Open'}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Streak meter — a thin progress bar in the habit color. */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/12">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${Math.round(ratio * 100)}%`,
                            background: h.color,
                          }}
                        />
                      </div>
                      <span className="mono label-kicker w-10 text-right text-xs text-muted-foreground tabular-nums">
                        {Math.round(ratio * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'muted';
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: 'bg-primary-container/40 text-on-primary-container',
    secondary: 'bg-secondary-container/45 text-on-secondary-container',
    tertiary: 'bg-tertiary-container/40 text-on-tertiary-container',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted/40 text-foreground/80',
  };
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 ${toneClasses[tone]}`}>
      <span className="mono label-kicker text-xs opacity-80">{label}</span>
      <span className="serif text-2xl leading-none font-medium tabular-nums">{value}</span>
    </div>
  );
}

function QuickAddTask({ dueDate }: { dueDate: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const submit = async () => {
    const title = value.trim();
    if (!title) {
      setEditing(false);
      setValue('');
      return;
    }
    setSubmitting(true);
    try {
      await tasksApi.create({ title, due_date: dueDate });
      setValue('');
      qc.invalidateQueries({ queryKey: qk.tasks.all });
      qc.invalidateQueries({ queryKey: qk.tags.all });
    } finally {
      setSubmitting(false);
      // Stay in edit mode for rapid entry; reset value cleared above.
      inputRef.current?.focus();
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="mono w-[18px] text-center text-[12px]">+</span>
        <span>Add task</span>
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="mono w-[18px] text-center text-[12px] text-muted-foreground">+</span>
      <Input
        name="journal-quick-task-title"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            setEditing(false);
            setValue('');
          }
        }}
        onBlur={() => {
          if (!value.trim()) setEditing(false);
        }}
        disabled={submitting}
        placeholder="Task title…"
        className="h-7 flex-1 px-2 text-[12.5px]"
      />
    </div>
  );
}

function EntryRow({ entry, selected, onClick }: { entry: JournalEntry; selected: boolean; onClick: () => void }) {
  const date = parseISO(entry.date);
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-foreground/85 hover:bg-sidebar-accent/40'
      }`}
      style={{ paddingLeft: '20px' }}
    >
      <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{format(date, 'd')}</span>
      <span className="flex-1 truncate text-[13px]">{format(date, 'EEEE')}</span>
    </button>
  );
}

function CalendarGrid({
  viewMonth,
  selectedDate,
  entryDates,
  activeWeekKey,
  onPick,
  onPickWeek,
}: {
  viewMonth: Date;
  selectedDate: string;
  entryDates: Set<string>;
  activeWeekKey: string | null;
  onPick: (d: string) => void;
  onPickWeek: (year: number, week: number) => void;
}) {
  // Mon-first grid: anchor on the Monday of the ISO week that contains
  // the 1st of the visible month, then walk forward in 7-day rows until
  // every day of the month is covered. The first column shows the
  // month-relative week number (1..6), reused as the click target for
  // the weekly entry view.
  const firstMon = startOfISOWeek(startOfMonth(viewMonth));
  const lastSun = endOfISOWeek(endOfMonth(viewMonth));
  const allDays = eachDayOfInterval({ start: firstMon, end: lastSun });
  const rows: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) rows.push(allDays.slice(i, i + 7));

  const todayISOYear = getISOWeekYear(new Date());
  const todayISOWeek = getISOWeek(new Date());

  return (
    <div className="grid grid-cols-8 gap-0.5">
      {['W', 'M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <div
          key={`${d}${i}`}
          className={`py-1 text-center font-mono text-xs uppercase ${
            i === 0 ? 'text-muted-foreground/50' : 'text-muted-foreground/70'
          }`}
        >
          {d}
        </div>
      ))}
      {rows.map((row, ri) => {
        const monday = row[0];
        const isoYear = getISOWeekYear(monday);
        const isoWeek = getISOWeek(monday);
        const weekKey = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
        const isCurrentWeek = isoYear === todayISOYear && isoWeek === todayISOWeek;
        const isActiveWeek = activeWeekKey === weekKey;
        const weekOfMonth = ri + 1;
        return (
          <React.Fragment key={weekKey}>
            <button
              onClick={() => onPickWeek(isoYear, isoWeek)}
              title={`Week ${isoWeek}, ${isoYear}`}
              className={`flex aspect-square items-center justify-center rounded font-mono text-xs transition-colors ${isActiveWeek ? 'bg-primary font-semibold text-primary-foreground' : ''} ${!isActiveWeek && isCurrentWeek ? 'text-foreground/80 ring-1 ring-primary/40' : ''} ${!isActiveWeek && !isCurrentWeek ? 'text-muted-foreground/60 hover:bg-sidebar-accent hover:text-foreground' : ''} `}
            >
              W{weekOfMonth}
            </button>
            {row.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isSelected = dateStr === selectedDate;
              const hasEntry = entryDates.has(dateStr);
              const isCurrent = isTodayFn(day);
              return (
                <button
                  key={dateStr}
                  onClick={() => onPick(dateStr)}
                  className={`relative flex aspect-square items-center justify-center rounded text-xs transition-colors ${isSelected ? 'bg-primary font-semibold text-primary-foreground' : ''} ${!isSelected && hasEntry ? 'bg-primary/10 font-medium text-primary' : ''} ${!isSelected && !hasEntry && isCurrent ? 'text-foreground ring-1 ring-primary/40' : ''} ${!isSelected && !hasEntry && !isCurrent ? 'text-muted-foreground hover:bg-sidebar-accent' : ''} ${!isSameMonth(day, viewMonth) ? 'opacity-30' : ''} `}
                >
                  {format(day, 'd')}
                  {hasEntry && !isSelected && <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />}
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SaveStatus({ state, onSave }: { state: 'idle' | 'saving' | 'saved'; onSave: () => void }) {
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <M3CookieLoader size="xs" tone="primary" />
        Saving
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 px-2 text-xs text-primary">
        <Save className="size-3.5" />
        Saved
      </span>
    );
  }
  return (
    <Button onClick={onSave} size="sm" variant="ghost" className="gap-1.5 text-xs">
      <Save className="size-3.5" /> Save
    </Button>
  );
}

// Dead code: the inline "Daily" section was removed from the Journal page and
// this component is no longer rendered. Kept (disabled) for reference until a
// deliberate prune — safe to delete along with the dailyOpen / DAILY_KEY state.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DailySection({
  open,
  onToggle,
  habitStatuses,
  loadingHabits,
  dueTasks,
  doneTasks,
  missedTasks,
  loadingTasks,
  onToggleHabit,
  onMarkTaskDone,
  onJumpDate,
}: {
  open: boolean;
  onToggle: () => void;
  habitStatuses: HabitStatus[];
  loadingHabits: boolean;
  dueTasks: TaskItem[];
  doneTasks: TaskItem[];
  missedTasks: MissedTask[];
  loadingTasks: boolean;
  onToggleHabit: (id: number) => void;
  onMarkTaskDone: (id: number) => void;
  onJumpDate: (d: string) => void;
}) {
  const habitDone = habitStatuses.filter((h) => h.logged).length;
  const taskCount = dueTasks.length;
  const doneCount = doneTasks.length;
  const summary = [
    habitStatuses.length > 0 ? `${habitDone}/${habitStatuses.length} habits` : null,
    taskCount > 0 ? `${taskCount} due` : null,
    doneCount > 0 ? `${doneCount} done` : null,
    missedTasks.length > 0 ? `${missedTasks.length} missed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="label-kicker font-mono text-xs text-muted-foreground">Daily</span>
        {summary && <span className="ml-auto truncate font-mono text-xs text-muted-foreground/80">{summary}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="grid grid-cols-1 gap-3 border-t border-border/60 p-3 md:grid-cols-2">
              {/* Habits */}
              <DailyColumn icon={<Target className="size-3.5 text-primary" />} title="Habits">
                {loadingHabits ? (
                  <Skeleton className="h-12 w-full" />
                ) : habitStatuses.length === 0 ? (
                  <Empty>No habits yet</Empty>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {habitStatuses.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => onToggleHabit(h.id)}
                        className={`flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                          h.logged ? 'bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <span
                          className="flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                          style={{ borderColor: h.color, backgroundColor: h.logged ? h.color : 'transparent' }}
                        >
                          {h.logged && <CheckIcon />}
                        </span>
                        <span className={`truncate text-[13px] ${h.logged ? '' : 'text-muted-foreground'}`}>
                          {h.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </DailyColumn>

              {/* Tasks */}
              <DailyColumn icon={<CheckSquare className="size-3.5 text-secondary" />} title="Tasks">
                {loadingTasks ? (
                  <Skeleton className="h-12 w-full" />
                ) : dueTasks.length === 0 && doneTasks.length === 0 && missedTasks.length === 0 ? (
                  <Empty>Nothing scheduled</Empty>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {dueTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40">
                        <Checkbox onCheckedChange={() => onMarkTaskDone(t.id)} className="size-3.5" />
                        <TaskScopeBadge task={t} />
                        <span className="flex-1 truncate text-[13px]">{t.title}</span>
                        <PriorityDot priority={t.priority} />
                      </div>
                    ))}
                    {doneTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-1.5 py-1 text-muted-foreground">
                        <span className="size-3.5 shrink-0 rounded-full bg-primary/40" />
                        <TaskScopeBadge task={t} />
                        <span className="flex-1 truncate text-[13px] line-through">{t.title}</span>
                      </div>
                    ))}

                    {missedTasks.length > 0 && (
                      <div className="mt-1 border-t border-border/60 pt-1">
                        <div className="label-kicker mb-0.5 flex items-center gap-1.5 px-1.5 font-mono text-xs text-secondary">
                          <AlertCircle className="size-3" />
                          Missed
                        </div>
                        {missedTasks.map((m) => (
                          <MissedTaskRow key={`${m.id}-${m.missed_date}`} task={m} onJump={onJumpDate} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </DailyColumn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DailyColumn({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background/60">
      <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/20 px-2.5 py-1.5">
        {icon}
        <span className="label-kicker font-mono text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 py-1.5 text-xs text-muted-foreground">{children}</p>;
}

// WeekTasksSection — the journal's "This week" list: week-scoped tasks
// (week_of = this Monday) shown as checkable rows with an inline quick-add.
// Sits above the per-day breakdown; week tasks have no specific day.
function WeekTasksSection({
  tasks,
  onToggle,
  onAdd,
  onOpen,
}: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onAdd: (title: string) => void;
  onOpen: (id: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'scratched');
  const done = tasks.filter((t) => t.status === 'done');

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    onAdd(title);
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <CalendarRange className="size-3.5 text-secondary" />
        <span className="label-kicker font-mono text-xs text-muted-foreground">This week</span>
        {open.length > 0 && (
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{open.length} open</span>
        )}
      </div>

      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {[...open, ...done].map((t) => {
            const isDone = t.status === 'done';
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="group flex items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-[hsl(var(--outline))] hover:border-primary'
                  }`}
                  aria-pressed={isDone}
                  title={isDone ? 'Mark not done' : 'Mark done'}
                >
                  {isDone && <LucideCheck className="size-3" strokeWidth={3.5} />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className={`flex-1 truncate text-left text-sm transition-colors hover:text-primary ${isDone ? 'text-muted-foreground line-through' : ''}`}
                >
                  {t.title}
                </button>
                {t.priority === 'high' && !isDone && (
                  <span className="size-2 shrink-0 rounded-full bg-destructive" title="High priority" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Inline quick-add — creates a week task for this week. */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[hsl(var(--outline)/0.6)] text-muted-foreground/60">
            <Plus className="size-3" strokeWidth={2.5} />
          </span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={tasks.length === 0 ? 'Add a goal for this week…' : 'Add a week task'}
            className="h-7 flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none outline-none placeholder:text-muted-foreground/50 focus-visible:border-0 focus-visible:shadow-none"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] px-3 py-1 text-xs font-medium text-[hsl(var(--on-secondary-container))] transition-opacity hover:opacity-90"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// MonthView — the monthly journal surface, parallel to WeekView. A long-form
// month entry + stat tiles, the "This month" goals (tasks.month_of),
// and a per-week task breakdown that drills into the weekly view.
function MonthView({
  year,
  month,
  onPickWeek,
  onShiftMonth,
  vimStatus,
  onText,
  onSaving,
}: {
  vimStatus: HTMLElement | null;
  /** The text as it changes (status line counts). */
  onText?: (text: string) => void;
  /** The save state as it changes (status line). */
  onSaving?: (state: 'idle' | 'saving' | 'saved') => void;
  year: number;
  month: number;
  onPickWeek: (year: number, week: number) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const vimKeys = useVimKeys();
  const onTextRef = useRef(onText);
  const onSavingRef = useRef(onSaving);
  useLayoutEffect(() => {
    onTextRef.current = onText;
    onSavingRef.current = onSaving;
  });
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => {
    onSavingRef.current?.(saving);
  }, [saving]);
  const [summary, setSummary] = useState<import('@/api').MonthlySummary | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monthStart = useMemo(() => new Date(year, month - 1, 1), [year, month]);
  const monthKey = useMemo(() => format(monthStart, 'yyyy-MM-dd'), [monthStart]);

  // Month goals (month_of = 1st of this month) — the "This month" section.
  const qc = useQueryClient();
  const [monthTasks, setMonthTasks] = useState<Task[]>([]);
  const loadMonthTasks = useCallback(() => {
    tasksApi
      .list({ month_of: monthKey })
      .then(setMonthTasks)
      .catch(() => setMonthTasks([]));
  }, [monthKey]);
  useEffect(() => {
    loadMonthTasks();
  }, [loadMonthTasks]);

  const toggleMonthTask = async (t: Task) => {
    const next = t.status === 'done' ? 'todo' : 'done';
    setMonthTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await tasksApi.update(t.id, { status: next });
    } catch (e) {
      setMonthTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      toast.error(clientMsg(e, 'Could not update task'));
      return;
    }
    loadMonthTasks();
    qc.invalidateQueries({ queryKey: qk.tasks.all });
  };
  const addMonthTask = async (title: string) => {
    await tasksApi.create({ title, month_of: monthKey });
    loadMonthTasks();
    qc.invalidateQueries({ queryKey: qk.tasks.all });
    qc.invalidateQueries({ queryKey: qk.tags.all });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dirtyRef.current = false;
    (async () => {
      try {
        const [entry, summ] = await Promise.all([
          journalApi.month.get(year, month),
          journalApi.month.summary(year, month),
        ]);
        if (!alive) return;
        setContent(entry.content || '');
        onTextRef.current?.(entry.content || '');
        setSummary(summ);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [year, month]);

  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving('saving');
      try {
        await journalApi.month.save(year, month, content);
        setSaving('saved');
        setTimeout(() => setSaving((s) => (s === 'saved' ? 'idle' : s)), 1400);
        dirtyRef.current = false;
      } catch {
        setSaving('idle');
      }
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, loading, year, month]);

  const handleContent = (v: string) => {
    dirtyRef.current = true;
    setContent(v);
    onTextRef.current?.(v);
  };

  const totalDone = summary?.total_done ?? 0;
  const totalDue = summary?.total_due ?? 0;
  const totalMissed = summary?.total_missed ?? 0;
  const entriesWritten = summary?.entries_written ?? 0;
  const daysInMonth = summary?.days_in_month ?? 30;

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-8 px-4 pt-10 pb-32 md:px-8 lg:px-10">
      {/* Title + month shift controls. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono label-kicker mb-1.5 text-xs text-muted-foreground">monthly entry</div>
          <h1 className="serif text-5xl leading-[1.02] font-normal tracking-[-0.02em] md:text-6xl">
            {format(monthStart, 'MMMM')}
          </h1>
          <div className="serif mt-1.5 text-lg text-muted-foreground italic md:text-xl">
            {format(monthStart, 'yyyy')}
          </div>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftMonth(-1)} title="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="mono min-w-[52px] px-1 text-center text-xs text-muted-foreground tabular-nums">
            {saving === 'saving' ? 'Saving' : saving === 'saved' ? 'Saved' : ''}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftMonth(1)} title="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* At-a-glance stats — same tiles as the week view, month-scoped. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Tasks done" value={`${totalDone}/${totalDue}`} tone="primary" />
        <StatTile label="Missed" value={String(totalMissed)} tone={totalMissed > 0 ? 'destructive' : 'muted'} />
        <StatTile label="Entries" value={`${entriesWritten}/${daysInMonth}`} tone="tertiary" />
        <StatTile
          label="Expenses"
          value={
            summary ? (
              <Money value={summary.expense_total} currency={summary.expense_currency || 'INR'} privacy={false} />
            ) : (
              '–'
            )
          }
          tone="secondary"
        />
      </div>

      {/* Editor — full-width, matches the daily/weekly layout. */}
      <div className="flex flex-col">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <MarkdownEditor
            value={content}
            onChange={handleContent}
            placeholder="What's this month about? Use / for commands, [[ to link, /task to reference…"
            minHeight="280px"
            contextDate={monthKey}
            vim={vimKeys}
            vimStatus={vimStatus}
          />
        )}
      </div>

      {/* This month — month goals (no specific day), checkable inline. */}
      <MonthTasksSection
        tasks={monthTasks}
        onToggle={toggleMonthTask}
        onAdd={addMonthTask}
        onOpen={(id) => window.dispatchEvent(new CustomEvent('task:open', { detail: { id } }))}
      />

      {/* Per-week breakdown — drills into the weekly view on click. */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <CheckSquare className="size-3.5 text-secondary" />
          <span className="label-kicker font-mono text-xs text-muted-foreground">Tasks by week</span>
        </div>
        <div className="divide-y divide-border/40">
          {(summary?.weeks ?? []).map((wk) => {
            const total = wk.tasks_due + wk.tasks_done;
            const ratio = total > 0 ? wk.tasks_done / total : 0;
            return (
              <button
                key={`${wk.iso_year}-${wk.iso_week}`}
                onClick={() => onPickWeek(wk.iso_year, wk.iso_week)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex w-16 shrink-0 flex-col text-muted-foreground">
                  <span className="mono label-kicker text-xs">Week</span>
                  <span className="serif text-lg leading-none tabular-nums">{wk.iso_week}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground/80">
                    {format(parseISO(wk.start_date), 'MMM d')} – {format(parseISO(wk.end_date), 'MMM d')}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex w-20 shrink-0 flex-col items-end">
                  <span className="mono text-xs text-muted-foreground tabular-nums">
                    {wk.tasks_done}/{total} done
                  </span>
                  {wk.tasks_missed > 0 && (
                    <span className="mono text-xs text-destructive tabular-nums">{wk.tasks_missed} missed</span>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// MonthTasksSection — the journal's "This month" list: month goals
// (tasks.month_of) shown as checkable rows with a progress chip (done/total
// sessions) and an inline quick-add. Parallels WeekTasksSection.
function MonthTasksSection({
  tasks,
  onToggle,
  onAdd,
  onOpen,
}: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onAdd: (title: string) => void;
  onOpen: (id: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'scratched');
  const done = tasks.filter((t) => t.status === 'done');

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    onAdd(title);
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <Target className="size-3.5 text-secondary" />
        <span className="label-kicker font-mono text-xs text-muted-foreground">This month</span>
        {open.length > 0 && (
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{open.length} open</span>
        )}
      </div>

      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {[...open, ...done].map((t) => {
            const isDone = t.status === 'done';
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="group flex items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-[hsl(var(--outline))] hover:border-primary'
                  }`}
                  aria-pressed={isDone}
                  title={isDone ? 'Mark not done' : 'Mark done'}
                >
                  {isDone && <LucideCheck className="size-3" strokeWidth={3.5} />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className={`flex-1 truncate text-left text-sm transition-colors hover:text-primary ${isDone ? 'text-muted-foreground line-through' : ''}`}
                >
                  {t.title}
                </button>
                {/* Session progress — month goals are broken into dated child
                    sessions; show done/total so the rollup is visible here. */}
                {(t.subtask_count ?? 0) > 0 && (
                  <span className="mono shrink-0 text-xs text-muted-foreground tabular-nums" title="Sessions done">
                    {t.subtasks_done ?? 0}/{t.subtask_count}
                  </span>
                )}
                {t.priority === 'high' && !isDone && (
                  <span className="size-2 shrink-0 rounded-full bg-destructive" title="High priority" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Inline quick-add — creates a month goal for this month. */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[hsl(var(--outline)/0.6)] text-muted-foreground/60">
            <Plus className="size-3" strokeWidth={2.5} />
          </span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={tasks.length === 0 ? 'Add a goal for this month…' : 'Add a month goal'}
            className="h-7 flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none outline-none placeholder:text-muted-foreground/50 focus-visible:border-0 focus-visible:shadow-none"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] px-3 py-1 text-xs font-medium text-[hsl(var(--on-secondary-container))] transition-opacity hover:opacity-90"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function MissedTaskRow({ task, onJump }: { task: MissedTask; onJump: (date: string) => void }) {
  const isDone = task.status === 'done';
  const wasRescheduled =
    task.source === 'rescheduled' && task.current_due_date && task.current_due_date !== task.missed_date;
  const targetDate = task.current_due_date || '';

  return (
    <div className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40">
      <span
        className={`size-3.5 shrink-0 rounded-full border ${isDone ? 'border-primary/40 bg-primary/40' : 'border-amber-500/60 bg-amber-500/10'}`}
      />
      <TaskScopeBadge scope="day" />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${isDone ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}>
          {task.title}
        </div>
        {wasRescheduled && targetDate ? (
          <button
            onClick={() => onJump(targetDate)}
            className="label-kicker mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowRight className="size-2.5" />
            moved to {format(parseISO(targetDate), 'MMM d')}
          </button>
        ) : (
          <span className="label-kicker font-mono text-xs text-muted-foreground">
            {isDone ? 'done later' : 'still pending'}
          </span>
        )}
      </div>
      <PriorityDot priority={task.priority} />
    </div>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    high: 'bg-destructive',
    medium: 'bg-amber-500',
    low: 'bg-muted-foreground/40',
  };
  return <span className={`size-2 shrink-0 rounded-full ${colors[priority] || 'bg-muted'}`} />;
}

function CheckIcon() {
  return (
    <svg className="size-2 text-white" viewBox="0 0 12 12">
      <path
        d="M10 3L4.5 8.5 2 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Side-panel section title. The whole title is the jump to its page; the
// chevron is the only affordance, and it sits on the panel's trailing edge.
function PanelHeading({ title, onOpen }: { title: string; onOpen?: () => void }) {
  if (!onOpen) return <h3 className="mb-2 text-sm font-medium">{title}</h3>;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group mb-2 flex w-full items-center justify-between rounded text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {title}
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}
