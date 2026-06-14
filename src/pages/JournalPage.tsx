import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  subMonths, addMonths, subDays, addDays, isSameMonth, isToday as isTodayFn,
  parseISO, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear,
  addWeeks, subWeeks,
} from 'date-fns';

import { useQueryClient } from '@tanstack/react-query';
import { journal as journalApi, habits as habitsApi, tasks as tasksApi, type JournalLocation } from '@/api';
import { useJournalList } from '@/queries/journal';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import RichEditor from '@/components/editor/RichEditor';
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
import type { MissedTask } from '@/api';
import type { Task } from '@/types';
import {
  ChevronLeft, ChevronRight, Save, Target, CheckSquare,
  Trash2, AlertCircle, ArrowRight,
  PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, FilePlus, Calendar as CalendarIcon,
  ChevronDown, Check as LucideCheck, Plus, CalendarRange,
} from 'lucide-react';

const MOODS = [
  { emoji: '😊', label: 'Happy' },
  { emoji: '😐', label: 'Meh' },
  { emoji: '😔', label: 'Down' },
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '🤔', label: 'Reflective' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '🚀', label: 'Energised' },
];

interface HabitStatus { id: number; name: string; color: string; logged: boolean; }
interface TaskItem { id: number; title: string; status: string; priority: string; due_date?: string | null; }
interface JournalEntry { id: number; date: string; mood: string | null; tags: string[]; updated_at: string; }

const SIDEBAR_KEY = 'sajni:journal-sidebar';
const DAILY_KEY = 'sajni:journal-daily';
const MARGIN_KEY = 'sajni:journal-margin';
const EXPANDED_MONTHS_KEY = 'sajni:journal-months';

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date') || format(new Date(), 'yyyy-MM-dd');

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMonth, setViewMonth] = useState(parseISO(initialDate));
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [location, setLocation] = useState<JournalLocation | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loading, setLoading] = useState(true);

  const [habitStatuses, setHabitStatuses] = useState<HabitStatus[]>([]);
  const [dueTasks, setDueTasks] = useState<TaskItem[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskItem[]>([]);
  const [missedTasks, setMissedTasks] = useState<MissedTask[]>([]);
  const [loadingHabits, setLoadingHabits] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const [dailyOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(DAILY_KEY) !== '0'; } catch { return true; }
  });
  const [marginOpen, setMarginOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(MARGIN_KEY) !== '0'; } catch { return true; }
  });
  const [mobileMarginOpen, setMobileMarginOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { openTask } = useTaskDetail();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_MONTHS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set([format(new Date(), 'yyyy-MM')]);
    } catch { return new Set([format(new Date(), 'yyyy-MM')]); }
  });

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksLoadedDateRef = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch {}
  }, [sidebarOpen]);
  useEffect(() => {
    try { localStorage.setItem(DAILY_KEY, dailyOpen ? '1' : '0'); } catch {}
  }, [dailyOpen]);
  useEffect(() => {
    try { localStorage.setItem(MARGIN_KEY, marginOpen ? '1' : '0'); } catch {}
  }, [marginOpen]);
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_MONTHS_KEY, JSON.stringify(Array.from(expandedMonths))); } catch {}
  }, [expandedMonths]);

  // View mode is derived from URL: `?view=week&week=YYYY-Www` triggers the
  // weekly entry surface; otherwise we render the daily editor. Day clicks
  // strip the `view`/`week` params back out (see setSelectedDate wrapper).
  const viewParam = params.get('view');
  const weekParam = params.get('week');
  const weekMatch = weekParam ? weekParam.match(/^(\d{4})-W(\d{1,2})$/) : null;
  const viewMode: 'day' | 'week' = viewParam === 'week' && weekMatch ? 'week' : 'day';
  const weekYear = weekMatch ? parseInt(weekMatch[1], 10) : getISOWeekYear(parseISO(selectedDate));
  const weekNumber = weekMatch ? parseInt(weekMatch[2], 10) : getISOWeek(parseISO(selectedDate));
  const activeWeekKey = viewMode === 'week'
    ? `${weekYear}-W${String(weekNumber).padStart(2, '0')}`
    : null;

  // Sync URL when date changes. Also clear week-view params so picking a
  // day in week mode reverts to the daily editor.
  useEffect(() => {
    const next = new URLSearchParams(params);
    let touched = false;
    if (params.get('date') !== selectedDate) {
      next.set('date', selectedDate);
      touched = true;
    }
    if (params.get('view') === 'week') {
      next.delete('view');
      next.delete('week');
      touched = true;
    }
    if (touched) setParams(next, { replace: true });
    setExpandedMonths((prev) => new Set([...prev, selectedDate.slice(0, 7)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const goWeek = useCallback((year: number, week: number) => {
    const next = new URLSearchParams(params);
    next.set('view', 'week');
    next.set('week', `${year}-W${String(week).padStart(2, '0')}`);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const goWeekFromDate = useCallback((d: Date) => {
    goWeek(getISOWeekYear(d), getISOWeek(d));
  }, [goWeek]);
  void goWeekFromDate;

  const { data: entriesData } = useJournalList();
  const entries = (entriesData ?? []) as JournalEntry[];
  // Editor writes go through journalApi (day-scoped); refresh the cached list
  // (and any other journal view) after a save/delete.
  const loadEntries = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.journal.all });
  }, [qc]);

  const loadEntry = useCallback(async () => {
    setLoading(true);
    dirtyRef.current = false;
    try {
      const entry = await journalApi.get(selectedDate);
      setContent(entry.content || '');
      setMood(entry.mood || null);
      setLocation(entry.location_label
        ? { label: entry.location_label, lat: entry.location_lat ?? null, lon: entry.location_lon ?? null }
        : null);
      setTags(entry.tags || []);
      setBacklinks(entry.backlinks || []);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const loadHabits = useCallback(async () => {
    setLoadingHabits(true);
    try { setHabitStatuses(await habitsApi.statusForDate(selectedDate)); }
    finally { setLoadingHabits(false); }
  }, [selectedDate]);

  const loadTasks = useCallback(async () => {
    if (tasksLoadedDateRef.current !== selectedDate) {
      setLoadingTasks(true);
    }
    try {
      const [due, done, missed] = await Promise.all([
        tasksApi.list({ due_date: selectedDate }),
        tasksApi.list({ completed_date: selectedDate }),
        tasksApi.missed(selectedDate),
      ]);
      setDueTasks(due.filter((t: TaskItem) => t.status !== 'done' && t.status !== 'scratched'));
      setCompletedTasks(done);
      setMissedTasks(missed);
      tasksLoadedDateRef.current = selectedDate;
    } finally { setLoadingTasks(false); }
  }, [selectedDate]);

  useEffect(() => { loadEntry(); }, [loadEntry]);
  useEffect(() => { loadHabits(); }, [loadHabits]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const performSave = useCallback(async (silent = false) => {
    if (!silent) setSavingState('saving');
    try {
      await journalApi.save(selectedDate, content, mood, location);
      const entry = await journalApi.get(selectedDate);
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
  }, [selectedDate, content, mood, location, loadEntries]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => performSave(true), 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content, mood, location, performSave, loading]);

  const handleContentChange = (v: string) => { dirtyRef.current = true; setContent(v); };
  const handleMoodChange = (v: string | null) => { dirtyRef.current = true; setMood(v); };
  const handleLocationChange = (v: JournalLocation | null) => { dirtyRef.current = true; setLocation(v); };

  const toggleHabit = async (habitId: number) => {
    setHabitStatuses((prev) => prev.map((h) => h.id === habitId ? { ...h, logged: !h.logged } : h));
    await habitsApi.toggleLogForDate(habitId, selectedDate);
    qc.invalidateQueries({ queryKey: qk.habits.all });
  };

  const completeTask = async (taskId: number) => {
    setDueTasks((prev) => prev.filter((t) => t.id !== taskId));
    await tasksApi.update(taskId, { status: 'done' });
    loadTasks();
    qc.invalidateQueries({ queryKey: qk.tasks.all });
  };

  const deleteEntry = async () => {
    if (!(await confirmDialog(`Delete journal entry for ${selectedDate}?`))) return;
    await journalApi.delete(selectedDate);
    setContent(''); setMood(null); setLocation(null); setTags([]); setBacklinks([]);
    loadEntries();
  };

  const goToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setSelectedDate(today); setViewMonth(new Date());
  };
  const goPrev = () => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
  const goNext = () => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));

  // Page-level keymap. Editor-local shortcuts (⌘B/I/U, ⌘⇧7/8, ⌘⇧C
  // checklist, slash menu) are already wired in RichEditor. These extras
  // give the journal page parity with the iOS Journal experience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        performSave();
      } else if (e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        const order = MOODS.map((m) => m.emoji);
        const idx = mood ? order.indexOf(mood) : -1;
        handleMoodChange(order[(idx + 1) % order.length]);
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
  }, [mood, selectedDate, performSave]);

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
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const contextPanel = (
    <div className="flex flex-col gap-6 p-4">
      {/* Tasks today */}
      <section>
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground">tasks today</div>
          <button onClick={() => navigate('/tasks')} className="mono text-xs tracking-[0.1em] text-muted-foreground hover:text-foreground">OPEN →</button>
        </div>
        {loadingTasks ? (
          <Skeleton className="h-16 w-full" />
        ) : dueTasks.length === 0 && completedTasks.length === 0 ? (
          <div className="text-xs italic text-muted-foreground mb-2">Clear day. A small mercy.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {dueTasks.map((t) => (
              <div key={t.id} className="group flex items-start gap-2.5">
                <button
                  onClick={() => completeTask(t.id)}
                  title="Mark done"
                  className="shrink-0 mt-0.5"
                >
                  <Checkbox checked={false} className="pointer-events-none" tabIndex={-1} />
                </button>
                <button
                  onClick={() => openTask(t.id)}
                  className="flex-1 text-left text-[12.5px] text-foreground/85 leading-snug hover:text-foreground transition-colors"
                  title="Open task"
                >
                  {t.title}
                </button>
              </div>
            ))}
            {completedTasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2.5">
                <Checkbox checked={true} className="mt-0.5 shrink-0 pointer-events-none" tabIndex={-1} />
                <button
                  onClick={() => openTask(t.id)}
                  className="flex-1 text-left text-[12.5px] line-through text-muted-foreground leading-snug hover:text-foreground/70 transition-colors"
                  title="Open task"
                >
                  {t.title}
                </button>
              </div>
            ))}
          </div>
        )}
        <QuickAddTask dueDate={selectedDate} onCreated={loadTasks} />
        {missedTasks.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border/60">
            <div className="mono text-xs tracking-[0.18em] uppercase text-destructive/80 mb-1.5 flex items-center gap-1.5">
              <AlertCircle className="size-3" /> missed
            </div>
            <div className="flex flex-col gap-1.5">
              {missedTasks.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t.id)}
                  className="text-[12px] text-foreground/70 truncate text-left hover:text-foreground transition-colors"
                  title="Open task"
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Habits today */}
      <section>
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground">habits</div>
          <button onClick={() => navigate('/habits')} className="mono text-xs tracking-[0.1em] text-muted-foreground hover:text-foreground">OPEN →</button>
        </div>
        {loadingHabits ? (
          <Skeleton className="h-16 w-full" />
        ) : habitStatuses.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">No habits yet.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {habitStatuses.map((h) => (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className="group flex items-center gap-2.5 text-left"
              >
                <span
                  className="size-[18px] rounded-[3px] border-2 inline-flex items-center justify-center shrink-0 transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]"
                  style={{
                    background: h.logged ? h.color : 'transparent',
                    borderColor: h.logged ? h.color : 'hsl(var(--on-surface-variant))',
                    color: '#fff',
                  }}
                >
                  {h.logged && <LucideCheck className="size-3 stroke-[3px]" />}
                </span>
                <span className="flex-1 text-[12.5px] text-foreground/85">{h.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Backlinks */}
      <section>
        <div className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground mb-2.5">backlinks</div>
        {backlinks.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">Nothing points here yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {backlinks.map((bl: any, i: number) => (
              <div key={i} className="text-[12.5px] text-primary">
                <div className="underline underline-offset-2 decoration-primary/30 truncate">[[{bl.title || 'Untitled'}]]</div>
                <div className="mono text-xs text-muted-foreground mt-0.5 capitalize">{bl.source_type}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh overflow-hidden page-fade-in">
      {/* App-consistent full-width header. Vault (left) + context (right)
          panels live BELOW this header so chrome is continuous. */}
      <header className="flex items-center justify-between gap-2 pl-3 md:pl-4 pr-2 md:pr-3 py-2 border-b border-border bg-background sticky top-0 z-20 h-14 md:h-16 shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Button
            variant="ghost" size="icon-sm"
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden md:flex shrink-0"
            title={sidebarOpen ? 'Hide journal' : 'Show journal'}
          >
            {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
          </Button>
          <SaveStatus state={savingState} onSave={() => performSave()} />
        </div>
        <div className="flex gap-0.5 items-center shrink-0">
          {entryDates.has(selectedDate) && (
            <Button variant="ghost" size="icon-sm" onClick={deleteEntry} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete entry">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon-sm"
            onClick={() => isMobile ? setMobileMarginOpen(true) : setMarginOpen((v) => !v)}
            className="shrink-0"
            title={isMobile ? 'Show context' : (marginOpen ? 'Hide context' : 'Show context')}
          >
            {marginOpen && !isMobile ? <PanelRightClose className="size-4" /> : <PanelRight className="size-4" />}
          </Button>
        </div>
      </header>

      {/* Date nav — also full-width, beneath the header. */}
      <div className="flex items-center gap-1 px-3 md:px-6 py-1.5 border-b border-border/60 bg-background/60 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={goPrev} title="Previous day" className="shrink-0">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <Breadcrumb dateObj={dateObj} />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={goNext} title="Next day" className="shrink-0">
          <ChevronRight className="size-4" />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={goToday} className="text-xs ml-1 shrink-0">
            Today
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor pane (CENTER) */}
        <div className="flex-1 flex flex-col min-w-0 order-2 overflow-y-auto">
          {viewMode === 'week' ? (
            <WeekView
              year={weekYear}
              week={weekNumber}
              onPickDay={(d) => setSelectedDate(d)}
              onShiftWeek={(delta) => {
                const ref = isoWeekDateFromKey(weekYear, weekNumber);
                const shifted = delta > 0 ? addWeeks(ref, delta) : subWeeks(ref, -delta);
                goWeek(getISOWeekYear(shifted), getISOWeek(shifted));
              }}
            />
          ) : (
            <div className="w-full max-w-[88rem] mx-auto px-4 md:px-8 lg:px-10 pt-10 pb-32 flex flex-col gap-5 min-h-full">
              {/* Date title — Obsidian-style serif hero per the design. */}
              <div>
                {entryDates.has(format(subDays(dateObj, 1), 'yyyy-MM-dd')) && (
                  <div className="mono text-xs tracking-[0.22em] uppercase text-primary/80 mb-3">
                    ── continued from yesterday
                  </div>
                )}
                <h1 className="serif text-4xl md:text-5xl font-normal tracking-[-0.02em] leading-[1.05]">
                  {format(dateObj, 'EEEE')}
                </h1>
                <div className="serif italic text-base md:text-lg text-muted-foreground mt-1">
                  {format(dateObj, 'MMMM d, yyyy')}
                </div>
              </div>

              {/* Mood pill row */}
              <div className="flex gap-1.5 flex-wrap items-center">
                {MOODS.map((m) => {
                  const active = mood === m.emoji;
                  return (
                    <button
                      key={m.emoji}
                      onClick={() => handleMoodChange(active ? null : m.emoji)}
                      title={m.label}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-all ${
                        active
                          ? 'bg-primary/15 ring-1 ring-primary/40 scale-[1.04]'
                          : 'bg-muted/40 hover:bg-muted hover:scale-[1.02] opacity-70 hover:opacity-100'
                      }`}
                    >
                      <span className="text-base leading-none">{m.emoji}</span>
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{m.label}</span>
                    </button>
                  );
                })}
                {mood && (
                  <button
                    onClick={() => handleMoodChange(null)}
                    className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors ml-1"
                  >
                    Clear
                  </button>
                )}
                <span className="w-px h-4 bg-border/60 mx-1 self-center" />
                <LocationPill value={location} onChange={handleLocationChange} />
              </div>

              {/* Editor — fills the available height (≈80–90%) like Notes. */}
              <div className="flex flex-1 flex-col min-h-0">
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <RichEditor
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Write about your day. Use / for commands, [[ to link, # for tags…"
                    fill
                    contextDate={selectedDate}
                  />
                )}
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap pt-3 border-t border-border/50">
                  {tags.map((tag) => <TagPill key={tag} tag={tag} />)}
                </div>
              )}

            </div>
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
            className="hidden md:flex border-l border-border bg-sidebar/40 flex-col shrink-0 overflow-hidden order-3"
          >
            <div className="overflow-y-auto">
              {contextPanel}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile right margin — bottom sheet */}
      <Sheet open={mobileMarginOpen} onOpenChange={setMobileMarginOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden max-h-[80dvh] overflow-y-auto bg-popover border-t border-border px-2 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <div className="mx-auto mb-3 h-[3px] w-9 bg-muted-foreground/35" aria-hidden="true" />
          <SheetHeader className="p-0 px-2">
            <SheetTitle className="serif text-base normal-case tracking-tight">Today's context</SheetTitle>
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
            className="hidden md:flex border-r border-border bg-sidebar/40 flex-col shrink-0 overflow-hidden order-1"
          >
            {/* Streak header — small but visible cue at the top of the rail. */}
            <div className="px-4 py-3.5 border-b border-sidebar-border/60">
              <div className="mono text-xs tracking-[0.18em] uppercase text-muted-foreground mb-1">journal</div>
              <div className="flex items-baseline gap-2">
                <span className="serif text-2xl font-medium tracking-tight tabular-nums">{entries.length}</span>
                <span className="text-xs text-muted-foreground">entr{entries.length === 1 ? 'y' : 'ies'} · {Array.from({ length: 14 }).filter((_, i) => entryDates.has(format(subDays(new Date(), 13 - i), 'yyyy-MM-dd'))).length}/14 days</span>
              </div>
              <div className="flex gap-[3px] mt-2">
                {Array.from({ length: 14 }).map((_, i) => {
                  const d = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd');
                  const has = entryDates.has(d);
                  return (
                    <div
                      key={i}
                      className="flex-1 h-1 rounded-sm"
                      style={{ background: has ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.18)' }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="p-2.5 border-b border-sidebar-border/60 flex flex-col gap-2 shrink-0">
              <div className="flex gap-1">
                <Button onClick={goToday} size="xs" variant="ghost" className="flex-1 justify-start gap-1.5 font-normal text-xs">
                  <CalendarIcon className="size-3.5" /> Today
                </Button>
                {!entryDates.has(selectedDate) && (
                  <Button onClick={() => performSave()} size="xs" variant="ghost" className="flex-1 justify-start gap-1.5 font-normal text-xs">
                    <FilePlus className="size-3.5" /> New entry
                  </Button>
                )}
              </div>

              {/* Calendar */}
              <div className="px-1 pt-1.5">
                <div className="flex items-center justify-between mb-1.5">
                  <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} className="size-5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground flex items-center justify-center">
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="font-mono text-xs font-medium tracking-widest uppercase">
                    {format(viewMonth, 'MMM yyyy')}
                  </span>
                  <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="size-5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground flex items-center justify-center">
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
                <CalendarGrid
                  viewMonth={viewMonth}
                  selectedDate={selectedDate}
                  entryDates={entryDates}
                  activeWeekKey={activeWeekKey}
                  onPick={(d) => setSelectedDate(d)}
                  onPickWeek={goWeek}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5 px-1">
              {groupedByMonth.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-12 px-3">
                  No entries yet
                </div>
              ) : (
                groupedByMonth.map(([monthKey, list]) => {
                  const isExpanded = expandedMonths.has(monthKey);
                  const monthLabel = format(parseISO(monthKey + '-01'), 'MMMM yyyy');
                  return (
                    <div key={monthKey}>
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full group flex items-center gap-1 hover:bg-sidebar-accent/40 rounded-md px-1 py-1 text-[12px] font-mono uppercase tracking-wider text-muted-foreground transition-colors"
                      >
                        <ChevronRight className={`size-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="flex-1 text-left truncate">{monthLabel}</span>
                        <span className="text-xs opacity-60">{list.length}</span>
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
                                onClick={() => setSelectedDate(e.date)}
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
          </motion.aside>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}

/* ---------- Components ---------- */

// isoWeekDateFromKey returns the Monday of a given ISO year+week.
// Anchors on Jan 4 (always in W1) and shifts forward week-1 weeks.
function isoWeekDateFromKey(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const start = startOfISOWeek(jan4);
  return addWeeks(start, week - 1);
}

function WeekView({
  year, week, onPickDay, onShiftWeek,
}: {
  year: number;
  week: number;
  onPickDay: (date: string) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [summary, setSummary] = useState<import('@/api').WeeklySummary | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monday = useMemo(() => isoWeekDateFromKey(year, week), [year, week]);
  const sunday = useMemo(() => endOfISOWeek(monday), [monday]);
  const mondayKey = useMemo(() => format(monday, 'yyyy-MM-dd'), [monday]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );

  // Week-scoped tasks (week_of = this Monday) — the "This week" section. Kept
  // separate from the per-day breakdown since they have no specific day.
  const qc = useQueryClient();
  const [weekTasks, setWeekTasks] = useState<Task[]>([]);
  const loadWeekTasks = useCallback(() => {
    tasksApi.list({ week_of: mondayKey }).then(setWeekTasks).catch(() => setWeekTasks([]));
  }, [mondayKey]);
  useEffect(() => { loadWeekTasks(); }, [loadWeekTasks]);

  const toggleWeekTask = async (t: Task) => {
    const next = t.status === 'done' ? 'todo' : 'done';
    setWeekTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    await tasksApi.update(t.id, { status: next });
    qc.invalidateQueries({ queryKey: qk.tasks.all });
  };
  const addWeekTask = async (title: string) => {
    await tasksApi.create({ title, week_of: mondayKey });
    loadWeekTasks();
    qc.invalidateQueries({ queryKey: qk.tasks.all });
  };

  // Load entry + summary whenever the week changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    dirtyRef.current = false;
    (async () => {
      try {
        const [entry, summ] = await Promise.all([
          journalApi.week.get(year, week),
          journalApi.week.summary(year, week),
        ]);
        if (!alive) return;
        setContent(entry.content || '');
        setMood(entry.mood || null);
        setSummary(summ);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [year, week]);

  // Debounced auto-save.
  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving('saving');
      try {
        await journalApi.week.save(year, week, content, mood);
        setSaving('saved');
        setTimeout(() => setSaving((s) => (s === 'saved' ? 'idle' : s)), 1400);
        dirtyRef.current = false;
      } catch {
        setSaving('idle');
      }
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content, mood, loading, year, week]);

  const handleContent = (v: string) => { dirtyRef.current = true; setContent(v); };
  const handleMood = (v: string | null) => { dirtyRef.current = true; setMood(v); };

  const today = format(new Date(), 'yyyy-MM-dd');
  const formatMoney = (n: number) => {
    const code = summary?.expense_currency || 'INR';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n); }
    catch { return `${code} ${n.toFixed(0)}`; }
  };

  const totalDone = summary?.days.reduce((acc, d) => acc + d.tasks_done, 0) ?? 0;
  const totalDue = summary?.days.reduce((acc, d) => acc + d.tasks_due + d.tasks_done, 0) ?? 0;
  const totalMissed = summary?.days.reduce((acc, d) => acc + d.tasks_missed, 0) ?? 0;
  const entriesWritten = summary?.days.filter((d) => d.has_entry).length ?? 0;

  return (
    <div className="w-full max-w-[88rem] mx-auto px-4 md:px-8 lg:px-10 pt-10 pb-32 flex flex-col gap-8">
      {/* Title + week shift controls. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono text-xs tracking-[0.22em] uppercase text-muted-foreground mb-1.5">
            weekly entry
          </div>
          <h1 className="serif text-5xl md:text-6xl font-normal tracking-[-0.02em] leading-[1.02]">
            Week {week}, {year}
          </h1>
          <div className="serif italic text-lg md:text-xl text-muted-foreground mt-1.5">
            {format(monday, 'MMM d')} – {format(sunday, 'MMM d, yyyy')}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(-1)} title="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="mono text-xs text-muted-foreground tabular-nums px-1 min-w-[52px] text-center">
            {saving === 'saving' ? 'Saving' : saving === 'saved' ? 'Saved' : ''}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => onShiftWeek(1)} title="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* At-a-glance stats — M3 expressive: surface-container-low + serif numerals. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Tasks done" value={`${totalDone}/${totalDue}`} tone="primary" />
        <StatTile label="Missed" value={String(totalMissed)} tone={totalMissed > 0 ? 'destructive' : 'muted'} />
        <StatTile label="Entries" value={`${entriesWritten}/7`} tone="tertiary" />
        <StatTile
          label="Expenses"
          value={summary ? formatMoney(summary.expense_total) : '—'}
          tone="secondary"
        />
      </div>

      {/* Mood pills (same set as daily). */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {MOODS.map((m) => {
          const active = mood === m.emoji;
          return (
            <button
              key={m.emoji}
              onClick={() => handleMood(active ? null : m.emoji)}
              title={m.label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all ${
                active
                  ? 'bg-primary/15 ring-1 ring-primary/40 scale-[1.04]'
                  : 'bg-muted/40 hover:bg-muted hover:scale-[1.02] opacity-70 hover:opacity-100'
              }`}
            >
              <span className="text-base leading-none">{m.emoji}</span>
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{m.label}</span>
            </button>
          );
        })}
        {mood && (
          <button
            onClick={() => handleMood(null)}
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors ml-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Editor — full-width, no card chrome. Matches the daily entry
          layout so the weekly entry reads as a longer-form journal rather
          than a panel inside the page. */}
      <div className="flex flex-col">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <RichEditor
            value={content}
            onChange={handleContent}
            placeholder="What do you want this week to be about? Use / for commands, [[ to link, /task to reference…"
            minHeight="280px"
            contextDate={mondayKey}
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
      <section className="rounded-2xl border border-border bg-card/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center gap-2">
          <CheckSquare className="size-3.5 text-secondary" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tasks by day</span>
        </div>
        <div className="divide-y divide-border/40">
          {weekDays.map((day, i) => {
            const ds = format(day, 'yyyy-MM-dd');
            const stat = summary?.days[i];
            const isCurrent = ds === today;
            const totalForDay = (stat?.tasks_due ?? 0) + (stat?.tasks_done ?? 0);
            const ratio = totalForDay > 0 ? (stat!.tasks_done / totalForDay) : 0;
            return (
              <button
                key={ds}
                onClick={() => onPickDay(ds)}
                className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${
                  isCurrent ? 'bg-primary/[0.04]' : ''
                }`}
              >
                <div className={`flex flex-col items-center w-14 shrink-0 ${
                  isCurrent ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  <span className="mono text-xs uppercase tracking-wider">{format(day, 'EEE')}</span>
                  <span className={`serif text-2xl font-medium leading-none tabular-nums ${
                    isCurrent ? 'text-primary' : 'text-foreground/90'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[13px] ${isCurrent ? 'text-primary font-medium' : 'text-foreground/85'}`}>
                      {format(day, 'MMMM')}
                    </span>
                    {stat?.has_entry && (
                      <span className="mono text-xs tracking-wider uppercase text-primary/70">entry</span>
                    )}
                    {stat?.mood && <span className="text-sm leading-none">{stat.mood}</span>}
                  </div>
                  <div className="h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="mono text-xs text-foreground/80 tabular-nums">
                    {stat ? `${stat.tasks_done}/${totalForDay}` : '—'}
                  </span>
                  {stat && stat.tasks_missed > 0 ? (
                    <span className="mono text-xs text-destructive/80 tabular-nums">
                      {stat.tasks_missed} missed
                    </span>
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
      <section className="rounded-3xl border border-border bg-card/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/30 flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/80">
            Habits this week
          </span>
          {summary && summary.habits.length > 0 && (
            <span className="ml-auto mono text-xs uppercase tracking-wider text-muted-foreground tabular-nums">
              {summary.habits.reduce((acc, h) => acc + h.logged_days.length, 0)}/
              {summary.habits.length * 7} checked
            </span>
          )}
        </div>
        <div className="p-5">
          {!summary || summary.habits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-10 text-center">
              <p className="serif italic text-base text-muted-foreground">No habits tracked yet.</p>
              <p className="mono text-xs uppercase tracking-wider text-muted-foreground/70 mt-2">
                Add habits from the Habits page to start the streak.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {summary.habits.map((h) => {
                const logged = new Set(h.logged_days);
                const ratio = h.logged_days.length / 7;
                const isPerfect = h.logged_days.length === 7;
                return (
                  <div
                    key={h.id}
                    className="rounded-2xl border border-border/60 bg-surface-container-low/40 px-4 py-3.5 flex flex-col gap-3 transition-colors hover:bg-surface-container-low/70"
                  >
                    {/* Row header: color swatch · name · count badge. */}
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
                        style={{
                          background: h.color,
                          ['--tw-ring-color' as any]: `${h.color}55`,
                        }}
                      />
                      <span className="text-[14px] font-medium text-foreground/90 flex-1 truncate">
                        {h.name}
                      </span>
                      <span
                        className={`mono text-xs uppercase tracking-wider tabular-nums rounded-full px-2.5 py-0.5 ${
                          isPerfect
                            ? 'bg-primary text-primary-foreground'
                            : ratio >= 0.5
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {h.logged_days.length}/7
                      </span>
                    </div>

                    {/* 7-day track. Filled tiles use the habit color; empty
                        tiles show a soft outlined dot. Hover reveals the
                        weekday + state, tap toggles via the parent state
                        once we wire mutation. */}
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
                            <span className="mono text-xs uppercase tracking-wider text-muted-foreground/70">
                              {format(day, 'EEEEE')}
                            </span>
                            <span
                              className={`flex items-center justify-center w-full h-9 rounded-xl transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${
                                on ? 'shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]' : ''
                              } ${isToday && !on ? 'ring-1 ring-primary/40' : ''}`}
                              style={{
                                background: on
                                  ? h.color
                                  : 'hsl(var(--muted-foreground) / 0.08)',
                              }}
                            >
                              {on ? (
                                <svg className="size-4 text-white" viewBox="0 0 12 12">
                                  <path d="M10 3L4.5 8.5 2 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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

                    {/* Streak meter — a thin progress bar in the habit color. */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted-foreground/12 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${Math.round(ratio * 100)}%`,
                            background: h.color,
                          }}
                        />
                      </div>
                      <span className="mono text-xs uppercase tracking-wider text-muted-foreground tabular-nums w-10 text-right">
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

function StatTile({ label, value, tone }: {
  label: string;
  value: string;
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
    <div className={`rounded-2xl px-4 py-3.5 flex flex-col gap-1.5 ${toneClasses[tone]}`}>
      <span className="mono text-xs uppercase tracking-[0.18em] opacity-80">{label}</span>
      <span className="serif text-2xl font-medium tabular-nums leading-none">{value}</span>
    </div>
  );
}

function QuickAddTask({ dueDate, onCreated }: { dueDate: string; onCreated: () => void }) {
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
    if (!title) { setEditing(false); setValue(''); return; }
    setSubmitting(true);
    try {
      await tasksApi.create({ title, due_date: dueDate });
      setValue('');
      onCreated();
      qc.invalidateQueries({ queryKey: qk.tasks.all });
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
        className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="mono text-[12px] w-[18px] text-center">+</span>
        <span>Add task</span>
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="mono text-[12px] w-[18px] text-center text-muted-foreground">+</span>
      <Input
        name="journal-quick-task-title"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { setEditing(false); setValue(''); }
        }}
        onBlur={() => { if (!value.trim()) setEditing(false); }}
        disabled={submitting}
        placeholder="Task title…"
        className="flex-1 h-7 text-[12.5px] px-2"
      />
    </div>
  );
}

function Breadcrumb({ dateObj }: { dateObj: Date }) {
  return (
    <div className="flex items-center gap-1 min-w-0 text-sm">
      <span className="font-mono text-xs text-muted-foreground">{format(dateObj, 'yyyy')}</span>
      <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
      <span className="font-mono text-xs text-muted-foreground">{format(dateObj, 'MMM')}</span>
      <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
      <span className="text-foreground/90 truncate">{format(dateObj, 'd, EEEE')}</span>
    </div>
  );
}

function EntryRow({ entry, selected, onClick }: { entry: JournalEntry; selected: boolean; onClick: () => void }) {
  const date = parseISO(entry.date);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 flex items-center gap-2 transition-colors ${
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/40 text-foreground/85'
      }`}
      style={{ paddingLeft: '20px' }}
    >
      <span className="font-mono text-xs tabular-nums text-muted-foreground w-7 shrink-0">
        {format(date, 'd')}
      </span>
      <span className="flex-1 truncate text-[13px]">{format(date, 'EEEE')}</span>
      {entry.mood && <span className="text-sm leading-none">{entry.mood}</span>}
    </button>
  );
}

function CalendarGrid({
  viewMonth, selectedDate, entryDates, activeWeekKey, onPick, onPickWeek,
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
          className={`text-center font-mono text-xs uppercase py-1 ${
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
              className={`aspect-square flex items-center justify-center text-xs font-mono rounded transition-colors
                ${isActiveWeek ? 'bg-primary text-primary-foreground font-semibold' : ''}
                ${!isActiveWeek && isCurrentWeek ? 'ring-1 ring-primary/40 text-foreground/80' : ''}
                ${!isActiveWeek && !isCurrentWeek ? 'text-muted-foreground/60 hover:bg-sidebar-accent hover:text-foreground' : ''}
              `}
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
                  className={`aspect-square flex items-center justify-center text-xs rounded transition-colors relative
                    ${isSelected ? 'bg-primary text-primary-foreground font-semibold' : ''}
                    ${!isSelected && hasEntry ? 'bg-primary/10 text-primary font-medium' : ''}
                    ${!isSelected && !hasEntry && isCurrent ? 'ring-1 ring-primary/40 text-foreground' : ''}
                    ${!isSelected && !hasEntry && !isCurrent ? 'text-muted-foreground hover:bg-sidebar-accent' : ''}
                    ${!isSameMonth(day, viewMonth) ? 'opacity-30' : ''}
                  `}
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
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2"><M3CookieLoader size="xs" tone="primary" />Saving</span>;
  }
  if (state === 'saved') {
    return <span className="flex items-center gap-1.5 text-xs text-primary px-2"><Save className="size-3.5" />Saved</span>;
  }
  return (
    <Button onClick={onSave} size="sm" variant="ghost" className="text-xs gap-1.5">
      <Save className="size-3.5" /> Save
    </Button>
  );
}

// Dead code: the inline "Daily" section was removed from the Journal page and
// this component is no longer rendered. Kept (disabled) for reference until a
// deliberate prune — safe to delete along with the dailyOpen / DAILY_KEY state.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DailySection({
  open, onToggle, habitStatuses, loadingHabits, dueTasks, completedTasks, missedTasks, loadingTasks,
  onToggleHabit, onCompleteTask, onJumpDate,
}: {
  open: boolean;
  onToggle: () => void;
  habitStatuses: HabitStatus[];
  loadingHabits: boolean;
  dueTasks: TaskItem[];
  completedTasks: TaskItem[];
  missedTasks: MissedTask[];
  loadingTasks: boolean;
  onToggleHabit: (id: number) => void;
  onCompleteTask: (id: number) => void;
  onJumpDate: (d: string) => void;
}) {
  const habitDone = habitStatuses.filter((h) => h.logged).length;
  const taskCount = dueTasks.length;
  const completedCount = completedTasks.length;
  const summary = [
    habitStatuses.length > 0 ? `${habitDone}/${habitStatuses.length} habits` : null,
    taskCount > 0 ? `${taskCount} due` : null,
    completedCount > 0 ? `${completedCount} done` : null,
    missedTasks.length > 0 ? `${missedTasks.length} missed` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Daily</span>
        {summary && (
          <span className="font-mono text-xs text-muted-foreground/80 ml-auto truncate">{summary}</span>
        )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-border/60">
              {/* Habits */}
              <DailyColumn icon={<Target className="size-3.5 text-primary" />} title="Habits">
                {loadingHabits ? <Skeleton className="h-12 w-full" /> :
                 habitStatuses.length === 0 ? <Empty>No habits yet</Empty> :
                 <div className="flex flex-col gap-0.5">
                   {habitStatuses.map((h) => (
                     <button
                       key={h.id}
                       onClick={() => onToggleHabit(h.id)}
                       className={`flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-left ${
                         h.logged ? 'bg-primary/5' : 'hover:bg-muted/40'
                       }`}
                     >
                       <span
                         className="size-3.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
                         style={{ borderColor: h.color, backgroundColor: h.logged ? h.color : 'transparent' }}
                       >
                         {h.logged && <CheckIcon />}
                       </span>
                       <span className={`text-[13px] truncate ${h.logged ? '' : 'text-muted-foreground'}`}>{h.name}</span>
                     </button>
                   ))}
                 </div>}
              </DailyColumn>

              {/* Tasks */}
              <DailyColumn icon={<CheckSquare className="size-3.5 text-secondary" />} title="Tasks">
                {loadingTasks ? <Skeleton className="h-12 w-full" /> :
                 dueTasks.length === 0 && completedTasks.length === 0 && missedTasks.length === 0 ? (
                  <Empty>Nothing scheduled</Empty>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {dueTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40">
                        <Checkbox onCheckedChange={() => onCompleteTask(t.id)} className="size-3.5" />
                        <span className="text-[13px] flex-1 truncate">{t.title}</span>
                        <PriorityDot priority={t.priority} />
                      </div>
                    ))}
                    {completedTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-1.5 py-1 text-muted-foreground">
                        <span className="size-3.5 rounded-full bg-primary/40 shrink-0" />
                        <span className="text-[13px] flex-1 truncate line-through">{t.title}</span>
                      </div>
                    ))}

                    {missedTasks.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-border/60">
                        <div className="flex items-center gap-1.5 px-1.5 mb-0.5 font-mono text-xs uppercase tracking-widest text-secondary">
                          <AlertCircle className="size-3" />
                          Missed
                        </div>
                        {missedTasks.map((m) => (
                          <MissedTaskRow
                            key={`${m.id}-${m.missed_date}`}
                            task={m}
                            onJump={onJumpDate}
                          />
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
    <div className="rounded-md border border-border/60 bg-background/60 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
        {icon}
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground py-1.5 px-1.5">{children}</p>;
}

// WeekTasksSection — the journal's "This week" list: week-scoped tasks
// (week_of = this Monday) shown as checkable rows with an inline quick-add.
// Sits above the per-day breakdown; week tasks have no specific day.
function WeekTasksSection({
  tasks, onToggle, onAdd, onOpen,
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
    <section className="rounded-2xl border border-border bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-center gap-2">
        <CalendarRange className="size-3.5 text-secondary" />
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">This week</span>
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
                className="group flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  className={`size-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isDone ? 'border-primary bg-primary text-primary-foreground' : 'border-[hsl(var(--outline))] hover:border-primary'
                  }`}
                  aria-pressed={isDone}
                  title={isDone ? 'Mark not done' : 'Mark done'}
                >
                  {isDone && <LucideCheck className="size-3" strokeWidth={3.5} />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className={`flex-1 text-left text-sm truncate transition-colors hover:text-primary ${isDone ? 'line-through text-muted-foreground' : ''}`}
                >
                  {t.title}
                </button>
                {t.priority === 'high' && !isDone && (
                  <span className="size-2 rounded-full bg-destructive shrink-0" title="High priority" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Inline quick-add — creates a week task for this week. */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <span className="size-[18px] rounded-full border-2 border-dashed border-[hsl(var(--outline)/0.6)] inline-flex items-center justify-center shrink-0 text-muted-foreground/60">
            <Plus className="size-3" strokeWidth={2.5} />
          </span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            placeholder={tasks.length === 0 ? 'Add a goal for this week…' : 'Add a week task'}
            className="flex-1 h-7 border-0 bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-0 focus-visible:shadow-none text-sm placeholder:text-muted-foreground/50"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={submit}
              className="shrink-0 rounded-full bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] text-xs font-medium px-3 py-1 hover:opacity-90 transition-opacity"
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
  const wasRescheduled = task.source === 'rescheduled' && task.current_due_date && task.current_due_date !== task.missed_date;
  const targetDate = task.current_due_date || '';

  return (
    <div className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 group">
      <span className={`size-3.5 rounded-full border shrink-0 ${isDone ? 'bg-primary/40 border-primary/40' : 'border-amber-500/60 bg-amber-500/10'}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] truncate ${isDone ? 'text-muted-foreground line-through' : 'text-foreground/80'}`}>
          {task.title}
        </div>
        {wasRescheduled && targetDate ? (
          <button
            onClick={() => onJump(targetDate)}
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5 transition-colors"
          >
            <ArrowRight className="size-2.5" />
            moved to {format(parseISO(targetDate), 'MMM d')}
          </button>
        ) : (
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {isDone ? 'completed later' : 'still pending'}
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
  return <span className={`size-2 rounded-full shrink-0 ${colors[priority] || 'bg-muted'}`} />;
}

function CheckIcon() {
  return <svg className="size-2 text-white" viewBox="0 0 12 12"><path d="M10 3L4.5 8.5 2 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
