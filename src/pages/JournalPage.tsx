import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  subMonths, addMonths, subDays, addDays, isSameMonth, isToday as isTodayFn,
  parseISO,
} from 'date-fns';

import { journal as journalApi, habits as habitsApi, tasks as tasksApi } from '@/api';
import RichEditor from '@/components/editor/RichEditor';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import type { MissedTask } from '@/api';
import {
  ChevronLeft, ChevronRight, Save, Loader2, Target, CheckSquare,
  Link as LinkIcon, Trash2, AlertCircle, ArrowRight,
  PanelLeftClose, PanelLeft, FilePlus, Calendar as CalendarIcon,
  ChevronDown,
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
const EXPANDED_MONTHS_KEY = 'sajni:journal-months';

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const initialDate = params.get('date') || format(new Date(), 'yyyy-MM-dd');

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMonth, setViewMonth] = useState(parseISO(initialDate));
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
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
  const [dailyOpen, setDailyOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(DAILY_KEY) !== '0'; } catch { return true; }
  });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_MONTHS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set([format(new Date(), 'yyyy-MM')]);
    } catch { return new Set([format(new Date(), 'yyyy-MM')]); }
  });

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch {}
  }, [sidebarOpen]);
  useEffect(() => {
    try { localStorage.setItem(DAILY_KEY, dailyOpen ? '1' : '0'); } catch {}
  }, [dailyOpen]);
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_MONTHS_KEY, JSON.stringify(Array.from(expandedMonths))); } catch {}
  }, [expandedMonths]);

  // Sync URL when date changes
  useEffect(() => {
    if (params.get('date') !== selectedDate) {
      const next = new URLSearchParams(params);
      next.set('date', selectedDate);
      setParams(next, { replace: true });
    }
    setExpandedMonths((prev) => new Set([...prev, selectedDate.slice(0, 7)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadEntries = useCallback(async () => {
    const list = await journalApi.list();
    setEntries(list as JournalEntry[]);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadEntry = useCallback(async () => {
    setLoading(true);
    dirtyRef.current = false;
    try {
      const entry = await journalApi.get(selectedDate);
      setContent(entry.content || '');
      setMood(entry.mood || null);
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
    setLoadingTasks(true);
    try {
      const [due, done, missed] = await Promise.all([
        tasksApi.list({ due_date: selectedDate }),
        tasksApi.list({ completed_date: selectedDate }),
        tasksApi.missed(selectedDate),
      ]);
      setDueTasks(due.filter((t: TaskItem) => t.status !== 'done'));
      setCompletedTasks(done);
      setMissedTasks(missed);
    } finally { setLoadingTasks(false); }
  }, [selectedDate]);

  useEffect(() => { loadEntry(); }, [loadEntry]);
  useEffect(() => { loadHabits(); }, [loadHabits]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const performSave = useCallback(async (silent = false) => {
    if (!silent) setSavingState('saving');
    try {
      await journalApi.save(selectedDate, content, mood);
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
  }, [selectedDate, content, mood, loadEntries]);

  // Debounced auto-save when dirty
  useEffect(() => {
    if (loading) return;
    if (!dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => performSave(true), 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content, mood, performSave, loading]);

  const handleContentChange = (v: string) => { dirtyRef.current = true; setContent(v); };
  const handleMoodChange = (v: string | null) => { dirtyRef.current = true; setMood(v); };

  const toggleHabit = async (habitId: number) => {
    setHabitStatuses((prev) => prev.map((h) => h.id === habitId ? { ...h, logged: !h.logged } : h));
    await habitsApi.toggleLogForDate(habitId, selectedDate);
  };

  const completeTask = async (taskId: number) => {
    setDueTasks((prev) => prev.filter((t) => t.id !== taskId));
    await tasksApi.update(taskId, { status: 'done' });
    loadTasks();
  };

  const deleteEntry = async () => {
    if (!confirm(`Delete journal entry for ${selectedDate}?`)) return;
    await journalApi.delete(selectedDate);
    setContent(''); setMood(null); setTags([]); setBacklinks([]);
    loadEntries();
  };

  const goToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setSelectedDate(today); setViewMonth(new Date());
  };
  const goPrev = () => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
  const goNext = () => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));

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

  return (
    <div className="flex h-screen overflow-hidden page-fade-in">
      {/* Editor pane (CENTER — left sidebar carries entries, right margin carries context). */}
      <div className="flex-1 flex flex-col min-w-0 order-2">
        {/* Top navbar — kept minimal */}
        <header className="flex items-center justify-between gap-2 pl-14 md:pl-4 pr-2 md:pr-3 py-2 border-b border-border bg-background/85 backdrop-blur sticky top-0 z-10 h-12">
          <div className="flex items-center gap-1 min-w-0 flex-1">
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
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden md:flex shrink-0"
              title={sidebarOpen ? 'Hide journal' : 'Show journal'}
            >
              {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
            </Button>
          </div>
        </header>

        {/* Date nav row — separate from navbar, no clutter on mobile */}
        <div className="flex items-center gap-1 px-3 md:px-6 py-1.5 border-b border-border/60 bg-background/60">
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

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-12 pt-10 pb-32 flex flex-col gap-5">
            {/* Date title — Obsidian-style serif hero per the design. */}
            <div>
              {entryDates.has(format(subDays(dateObj, 1), 'yyyy-MM-dd')) && (
                <div className="mono text-[10.5px] tracking-[0.22em] uppercase text-primary/80 mb-3">
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
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  </button>
                );
              })}
              {mood && (
                <button
                  onClick={() => handleMoodChange(null)}
                  className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Daily — habits + tasks (collapsible) */}
            <DailySection
              open={dailyOpen}
              onToggle={() => setDailyOpen((v) => !v)}
              habitStatuses={habitStatuses}
              loadingHabits={loadingHabits}
              dueTasks={dueTasks}
              completedTasks={completedTasks}
              missedTasks={missedTasks}
              loadingTasks={loadingTasks}
              onToggleHabit={toggleHabit}
              onCompleteTask={completeTask}
              onJumpDate={(d) => setSelectedDate(d)}
            />

            {/* Editor */}
            <div className="flex flex-col">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <RichEditor
                  value={content}
                  onChange={handleContentChange}
                  placeholder="Write about your day. Use / for commands, [[ to link, # for tags…"
                  minHeight="320px"
                />
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-3 border-t border-border/50">
                {tags.map((tag) => <TagPill key={tag} tag={tag} />)}
              </div>
            )}

            {/* Backlinks */}
            {backlinks.length > 0 && (
              <div className="rounded-lg border border-border bg-card mt-2">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/30">
                  <LinkIcon className="size-3.5 text-primary" />
                  <span className="text-xs font-medium">{backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}</span>
                </div>
                <div className="p-2">
                  {backlinks.map((bl: any, i: number) => (
                    <div key={i} className="text-sm py-1 px-1 flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[9px] capitalize shrink-0">{bl.source_type}</Badge>
                      <span className="truncate">{bl.title || 'Untitled'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
              <div className="mono text-[9.5px] tracking-[0.18em] uppercase text-muted-foreground mb-1">journal</div>
              <div className="flex items-baseline gap-2">
                <span className="serif text-2xl font-medium tracking-tight tabular-nums">{entries.length}</span>
                <span className="text-[11px] text-muted-foreground">entr{entries.length === 1 ? 'y' : 'ies'} · {Array.from({ length: 14 }).filter((_, i) => entryDates.has(format(subDays(new Date(), 13 - i), 'yyyy-MM-dd'))).length}/14 days</span>
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
                  <span className="font-mono text-[10px] font-medium tracking-widest uppercase">
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
                  onPick={(d) => setSelectedDate(d)}
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
                        <span className="text-[9px] opacity-60">{list.length}</span>
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
  );
}

/* ---------- Components ---------- */

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
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-7 shrink-0">
        {format(date, 'd')}
      </span>
      <span className="flex-1 truncate text-[13px]">{format(date, 'EEEE')}</span>
      {entry.mood && <span className="text-sm leading-none">{entry.mood}</span>}
    </button>
  );
}

function CalendarGrid({ viewMonth, selectedDate, entryDates, onPick }: {
  viewMonth: Date;
  selectedDate: string;
  entryDates: Set<string>;
  onPick: (d: string) => void;
}) {
  const start = startOfMonth(viewMonth);
  const end = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start, end });
  const startDow = getDay(start);
  const blanks = Array.from({ length: startDow }, (_, i) => i);

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
        <div key={`${d}${i}`} className="text-center font-mono text-[8px] text-muted-foreground/70 uppercase py-1">{d}</div>
      ))}
      {blanks.map((i) => <div key={`b${i}`} />)}
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const isSelected = dateStr === selectedDate;
        const hasEntry = entryDates.has(dateStr);
        const isCurrent = isTodayFn(day);
        return (
          <button
            key={dateStr}
            onClick={() => onPick(dateStr)}
            className={`aspect-square flex items-center justify-center text-[11px] rounded transition-colors relative
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
    </div>
  );
}

function SaveStatus({ state, onSave }: { state: 'idle' | 'saving' | 'saved'; onSave: () => void }) {
  if (state === 'saving') {
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2"><Loader2 className="size-3.5 animate-spin" />Saving</span>;
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
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Daily</span>
        {summary && (
          <span className="font-mono text-[10px] text-muted-foreground/80 ml-auto truncate">{summary}</span>
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
                        <div className="flex items-center gap-1.5 px-1.5 mb-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-600 dark:text-amber-400">
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
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground py-1.5 px-1.5">{children}</p>;
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
            className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5 transition-colors"
          >
            <ArrowRight className="size-2.5" />
            moved to {format(parseISO(targetDate), 'MMM d')}
          </button>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
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
