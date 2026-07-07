import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';

import {
  useHabits, useHabitRecentLogs, useToggleHabitLog,
  useCreateHabit, useUpdateHabit, useDeleteHabit,
} from '@/queries/habits';
import { confirmDialog } from '@/lib/confirm';
import type { Habit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Flame, Loader2, Pencil, Check, ChevronLeft, ChevronRight } from '@/components/ui/icons';
import PageShell from '@/components/PageShell';

const SWATCHES = ['#2D5A4F', '#7C9A92', '#C49A6C', '#A14B4F', '#4F6FA1', '#8B6FA1', '#7A7A7A'];

interface HabitForm {
  name: string;
  frequency: Habit['frequency'];
  color: string;
}

// Day letter for a yyyy-MM-dd key. Derived from the actual date so the fixed
// Mon..Sun strip labels each column correctly.
function dayLetter(key: string): string {
  return format(parseISO(key), 'EEEEE');
}

// Habits — single-card week grid. Mon..Sun ending today. Each cell is
// clickable to toggle that day's log; the small streak column on the
// right shows the longest current streak. Clicking the row name (or its
// dot) opens the edit dialog.
export default function HabitsPage() {
  const { data: habitsList = [], isLoading: loading } = useHabits();
  // weekOffset ≤ 0: 0 = this week, -1 = last week… Backfilling the past is
  // allowed; the future is not, so the forward chevron pins at 0.
  const [weekOffset, setWeekOffset] = useState(0);
  // Widen the log window to cover the week being viewed (+ a week of slack
  // so streak dots at the window edge don't blink out).
  const { data: recentLogsMap = {} } = useHabitRecentLogs(14 - weekOffset * 7);
  const toggleLog = useToggleHabitLog(format(new Date(), 'yyyy-MM-dd'));
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [form, setForm] = useState<HabitForm>({ name: '', frequency: 'daily', color: SWATCHES[0] });
  const [saving, setSaving] = useState(false);

  // Per-habit logged-date sets, derived from the single recent-logs call.
  const habitLogs = useMemo(() => {
    const out: Record<number, Set<string>> = {};
    for (const h of habitsList) out[h.id] = new Set(recentLogsMap[String(h.id)] ?? []);
    return out;
  }, [habitsList, recentLogsMap]);

  const week = useMemo(() => {
    // Fixed calendar week, Monday..Sunday (matches the journal). Today lands in
    // its real weekday slot; days after today render as disabled placeholders.
    const mon = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [weekOffset]);
  const weekKeys = useMemo(() => week.map((d) => format(d, 'yyyy-MM-dd')), [week]);
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  // Deep-link: /habits?focus=<id> opens that habit's edit dialog once loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const focusHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusHandled.current === focusId) return;
    const h = habitsList.find((x) => String(x.id) === focusId);
    if (h) {
      focusHandled.current = focusId;
      openEdit(h);
      searchParams.delete('focus');
      setSearchParams(searchParams, { replace: true });
    }
  }, [focusId, habitsList, searchParams, setSearchParams]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', frequency: 'daily', color: SWATCHES[0] });
    setShowForm(true);
  };

  // Function declaration (not const arrow) so it hoists above the deep-link
  // effect that calls it — keeps the React Compiler's no-access-before-declare
  // rule happy without reordering.
  function openEdit(h: Habit) {
    setEditing(h);
    setForm({ name: h.name, frequency: h.frequency, color: h.color });
    setShowForm(true);
  }

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await updateHabit.mutateAsync({ id: editing.id, data: form });
      else await createHabit.mutateAsync(form);
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog('Delete this habit and all its logs?'))) return;
    await deleteHabit.mutateAsync(id);
  };

  const toggleDay = (habit: Habit, dateStr: string) => {
    // Future days in the current week aren't loggable yet.
    if (dateStr > todayKey) return;
    toggleLog.mutate({ id: habit.id, date: dateStr });
  };

  return (
    <PageShell
      title="Habits"
      actions={<Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="size-3.5" /> New habit</Button>}
    >
      {/* Week navigation — back to fill missed days, never into the future. */}
      <div className="flex items-center gap-1 -mb-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setWeekOffset((o) => o - 1)}
          title="Previous week"
          aria-label="Previous week"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="mono text-xs tracking-[0.08em] text-muted-foreground tabular-nums min-w-[9.5rem] text-center">
          {weekOffset === 0
            ? 'This week'
            : `${format(week[0], 'MMM d')} – ${format(week[6], 'MMM d')}`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
          disabled={weekOffset === 0}
          title="Next week"
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </Button>
        {weekOffset < 0 && (
          <Button variant="ghost" size="sm" className="ml-1 h-8 rounded-full text-xs" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 w-full rounded-[28px]" />)}
        </div>
      ) : habitsList.length === 0 ? (
        <div className="rounded-[28px] text-center py-20 text-muted-foreground bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))]">
          <div className="text-5xl mb-3 opacity-25">◉</div>
          <p className="text-sm">No habits yet. Build something small.</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={openCreate}>
            <Plus className="size-3.5" /> Add your first habit
          </Button>
        </div>
      ) : (
        <div className="sajni-stagger grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <AnimatePresence initial={false}>
            {habitsList.map((habit) => (
              <motion.div
                key={habit.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              >
                <HabitCard
                  habit={habit}
                  weekKeys={weekKeys}
                  loggedDays={habitLogs[habit.id] || new Set()}
                  todayKey={todayKey}
                  onToggleDay={(d) => toggleDay(habit, d)}
                  onEdit={() => openEdit(habit)}
                  onDelete={() => handleDelete(habit.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit habit' : 'New habit'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                placeholder="e.g. Morning walk"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: (v as Habit['frequency']) || 'daily' })}
                  items={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`size-7 rounded-md border-2 transition-transform ${form.color === c ? 'scale-110 ring-2 ring-ring' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="size-7 rounded-md border border-input cursor-pointer"
                    title="Custom color"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            {editing && (
              <Button variant="destructive" onClick={() => { handleDelete(editing.id); setShowForm(false); }} className="mr-auto">
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// HabitCard — one expressive MD3 card per habit. The week is a single row of
// circular day toggles (letter above each), so there's no separate date header
// to clutter the layout. "Today" is marked the Material way: a semantic primary
// outline + a primary dot beneath (never the habit's own color), so it reads as
// a UI state rather than a stray colored circle on the last day.
function HabitCard({
  habit, weekKeys, loggedDays, todayKey, onToggleDay, onEdit, onDelete,
}: {
  habit: Habit;
  weekKeys: string[];
  loggedDays: Set<string>;
  todayKey: string;
  onToggleDay: (d: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const weekDone = weekKeys.reduce((n, d) => n + (loggedDays.has(d) ? 1 : 0), 0);

  return (
    <div className="group relative h-full overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-5 transition-shadow hover:shadow-[0_10px_34px_-16px_hsl(var(--on-surface)/0.22)]">
      {/* Soft accent wash in the habit's color — atmosphere, not noise. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ background: `radial-gradient(130% 90% at 100% 0%, ${habit.color}, transparent 62%)` }}
      />

      {/* Header: identity + streak */}
      <div className="relative flex items-start gap-3">
        <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left tap-highlight-none" title="Edit habit">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl" style={{ background: `${habit.color}22` }}>
            <span className="size-3.5 rounded-full" style={{ background: habit.color }} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium text-foreground">{habit.name}</span>
            <span className="mt-0.5 block mono text-xs capitalize text-muted-foreground">{habit.frequency} · {habit.total_logs} total</span>
          </span>
        </button>

        <div
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1"
          style={{ background: `${habit.color}1f`, color: habit.color }}
          title={`${habit.current_streak} day streak`}
        >
          <Flame className="size-3.5" />
          <span className="mono text-[13px] font-semibold leading-none tabular-nums">{habit.current_streak}</span>
        </div>
      </div>

      {/* Week — circular day toggles, letter above, today dot below */}
      <div className="relative mt-5 grid grid-cols-7 gap-1.5">
        {weekKeys.map((d, i) => {
          const on = loggedDays.has(d);
          const isToday = d === todayKey;
          const isFuture = d > todayKey;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className={`mono text-xs leading-none ${
                isToday ? 'font-semibold text-[hsl(var(--primary))]' : isFuture ? 'text-muted-foreground/40' : 'text-muted-foreground'
              }`}>
                {dayLetter(d)}
              </span>
              <motion.button
                onClick={() => onToggleDay(d)}
                disabled={isFuture}
                whileTap={isFuture ? undefined : { scale: 0.82 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                aria-pressed={on}
                title={isFuture ? d : `${d}${on ? ' — done' : ''}${isToday ? ' · today' : ''}`}
                className={`relative grid aspect-square w-full place-items-center rounded-full tap-highlight-none ${isFuture ? 'cursor-default' : ''}`}
                style={{
                  background: on
                    ? habit.color
                    : isFuture
                      ? 'hsl(var(--surface-container-highest) / 0.4)'
                      : 'hsl(var(--surface-container-highest))',
                  color: 'hsl(var(--primary-foreground))',
                  boxShadow: isToday
                    ? (on
                        ? `0 0 0 2px hsl(var(--surface-container-low)), 0 0 0 4px hsl(var(--primary))`
                        : 'inset 0 0 0 2px hsl(var(--primary))')
                    : (on ? `0 6px 16px -8px ${habit.color}` : 'none'),
                }}
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </motion.button>
              <span className={`size-1 rounded-full ${isToday ? 'bg-[hsl(var(--primary))]' : 'bg-transparent'}`} />
            </div>
          );
        })}
      </div>

      {/* Footer: this-week progress + hover actions */}
      <div className="relative mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--surface-container-highest))]">
          <motion.span
            className="block h-full rounded-full"
            style={{ background: habit.color }}
            initial={false}
            animate={{ width: `${(weekDone / 7) * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>
        <span className="shrink-0 mono text-xs tabular-nums text-muted-foreground">{weekDone}/7 wk</span>
        <div className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit"><Pencil className="size-3" /></Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete">
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
