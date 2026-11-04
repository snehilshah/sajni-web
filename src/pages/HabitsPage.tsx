import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inkOn } from '@/lib/ink';
import { cn } from '@/lib/utils';

/** Habit names stay short enough to sit in one pill (API enforces too). */
const HABIT_NAME_MAX = 20;
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import {
  useCreateHabit,
  useDeleteHabit,
  useHabitLogRange,
  useHabits,
  useToggleHabitPeriod,
  useSaveHabit,
} from '@/queries/habits';
import {
  dailyPeriods,
  dateKey,
  fortnightlyPeriods,
  habitPeriodForDate,
  monthlyPeriods,
  periodIsComplete,
  periodWindowEnd,
  periodWindowTitle,
  streakHeadKey,
  visiblePeriodRange,
  weeklyPeriods,
  type HabitPeriod,
} from '@/lib/habit-periods';
import { confirmDialog } from '@/lib/confirm';
import type { Habit, HabitFrequency } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from '@/components/ui/icons';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { EditActions } from '@/components/editor-actions';

const SWATCHES = ['#2D5A4F', '#7C9A92', '#C49A6C', '#A14B4F', '#4F6FA1', '#8B6FA1', '#7A7A7A'];
const FREQUENCIES: HabitFrequency[] = ['daily', 'weekly', 'fortnightly', 'monthly'];
const FREQUENCY_LABEL: Record<HabitFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
};

interface HabitForm {
  name: string;
  frequency: HabitFrequency;
  color: string;
}

type Offsets = Record<HabitFrequency, number>;

const INITIAL_OFFSETS: Offsets = {
  daily: 0,
  weekly: 0,
  fortnightly: 0,
  monthly: 0,
};

export default function HabitsPage() {
  const navigate = useNavigate();
  const { data: habitsList = [], isLoading } = useHabits();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [offsets, setOffsets] = useState<Offsets>(INITIAL_OFFSETS);

  const periods = useMemo<Record<HabitFrequency, HabitPeriod[]>>(() => ({
    daily: dailyPeriods(today, offsets.daily),
    weekly: weeklyPeriods(today, offsets.weekly),
    fortnightly: fortnightlyPeriods(today, offsets.fortnightly),
    monthly: monthlyPeriods(today, offsets.monthly),
  }), [offsets, today]);

  const visibleRange = useMemo(
    () => visiblePeriodRange(Object.values(periods)),
    [periods],
  );
  const { data: logsMap = {}, isLoading: logsLoading } = useHabitLogRange(
    visibleRange.from,
    visibleRange.to,
  );

  const togglePeriod = useToggleHabitPeriod();
  const createHabit = useCreateHabit();
  const writeHabit = useSaveHabit();
  const deleteHabit = useDeleteHabit();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [form, setForm] = useState<HabitForm>({
    name: '',
    frequency: 'daily',
    color: SWATCHES[0],
  });
  const [saving, setSaving] = useState(false);
  // Nothing saves until Save; a new habit is created explicitly.
  const editor = useEditorDraft({
    open: showForm,
    editing: !!(showForm && editing),
    value: form,
    invalid: form.name.trim() ? null : 'a habit needs a name.',
    save: async (v) => {
      if (editing) await writeHabit(editing.id, { ...v, name: v.name.trim() });
    },
  });
  const closeForm = () => editor.close(() => setShowForm(false));
  const loadDraft = editor.load;
  const openEdit = useCallback((habit: Habit) => {
    const v: HabitForm = { name: habit.name, frequency: habit.frequency, color: habit.color };
    setEditing(habit);
    setForm(v);
    loadDraft(v);
    setShowForm(true);
  }, [loadDraft]);

  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const focusHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!focusId || focusHandled.current === focusId) return;
    const habit = habitsList.find((item) => String(item.id) === focusId);
    if (!habit) return;
    focusHandled.current = focusId;
    openEdit(habit);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [focusId, habitsList, openEdit, searchParams, setSearchParams]);


  const openCreate = () => {
    const v: HabitForm = { name: '', frequency: 'daily', color: SWATCHES[0] };
    setEditing(null);
    setForm(v);
    loadDraft(v);
    setShowForm(true);
  };

  const saveHabit = async () => {
    if (editing) { await editor.save(() => setShowForm(false)); return; }
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createHabit.mutateAsync({ ...form, name: form.name.trim() });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const removeHabit = async (habit: Habit) => {
    if (!(await confirmDialog(`Delete "${habit.name}" and all its logs?`))) return;
    editor.cancel();
    await deleteHabit.mutateAsync(habit.id);
    setShowForm(false);
  };

  const changeWindow = (frequency: HabitFrequency, direction: -1 | 1 | 0) => {
    setOffsets((current) => ({
      ...current,
      [frequency]: direction === 0
        ? 0
        : Math.min(0, current[frequency] + direction),
    }));
  };

  const groupedHabits = useMemo(() => {
    const grouped: Record<HabitFrequency, Habit[]> = {
      daily: [], weekly: [], fortnightly: [], monthly: [],
    };
    for (const habit of habitsList) grouped[habit.frequency].push(habit);
    return grouped;
  }, [habitsList]);

  return (
    <PageShell
      title="Habits"
      navigation={(
        <PageShellTabs
          bare
          ariaLabel="Habits sections"
          value="habits"
          options={[
            { value: 'habits', label: 'Habits' },
            { value: 'events', label: 'Events' },
          ]}
          onChange={(value) => { if (value === 'events') navigate('/habits?tab=events'); }}
        />
      )}
      actions={(
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="size-3.5" />
          New habit
        </Button>
      )}
    >
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <Skeleton key={item} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : habitsList.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No habits yet</p>
      ) : (
        <div className="space-y-5">
          {FREQUENCIES.map((frequency) => {
            const habits = groupedHabits[frequency];
            if (habits.length === 0) return null;
            const current = habitPeriodForDate(today, frequency);
            return (
              <RhythmLedger
                key={frequency}
                frequency={frequency}
                habits={habits}
                periods={periods[frequency]}
                logsMap={logsMap}
                logsLoading={logsLoading}
                currentPeriodKey={current.key}
                todayKey={todayKey}
                windowTitle={periodWindowTitle(frequency, today, offsets[frequency])}
                canMoveForward={periodWindowEnd(frequency, today, offsets[frequency]).getTime() < today.getTime()}
                isCurrentWindow={offsets[frequency] === 0}
                onPrevious={() => changeWindow(frequency, -1)}
                onNext={() => changeWindow(frequency, 1)}
                onCurrent={() => changeWindow(frequency, 0)}
                onEdit={openEdit}
                onToggle={(habit, period) => togglePeriod.mutate({
                  id: habit.id,
                  periodStart: period.key,
                  periodEnd: dateKey(period.end),
                  isCurrent: period.key === current.key,
                })}
              />
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : closeForm())}>
        <DialogContent showCloseButton={false}>
          <DialogHeader className="flex-row items-baseline justify-between gap-3">
            <DialogTitle>{editing ? 'Edit habit' : 'New habit'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="habit-name">Name</Label>
              <Input
                id="habit-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value.slice(0, HABIT_NAME_MAX) })}
                maxLength={HABIT_NAME_MAX}
                autoFocus
                placeholder="e.g. Morning walk"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(value) => setForm({
                    ...form,
                    frequency: (value as HabitFrequency) || 'daily',
                  })}
                  items={FREQUENCIES.map((frequency) => ({
                    value: frequency,
                    label: FREQUENCY_LABEL[frequency],
                  }))}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {FREQUENCY_LABEL[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  One check per {{
                    daily: 'day',
                    weekly: 'week',
                    fortnightly: 'two-week period',
                    monthly: 'month',
                  }[form.frequency]}.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex min-h-10 flex-wrap items-center gap-1.5">
                  {SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      aria-label={`Use color ${color}`}
                      aria-pressed={form.color === color}
                      className={`size-8 rounded-md border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        form.color === color ? 'scale-110 border-background ring-2 ring-ring' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={form.color}
                    onChange={(event) => setForm({ ...form, color: event.target.value })}
                    className="size-8 cursor-pointer rounded-md border border-input p-0.5"
                    title="Custom color"
                    aria-label="Choose a custom habit color"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className={cn(editing && 'flex-row items-center')}>
            {editing && (
              <Button
                variant="destructive-quiet"
                onClick={() => removeHabit(editing)}
                className="mr-auto"
              >
                <Trash2 className="size-4 mr-1" /> Delete
              </Button>
            )}
            <EditActions draft={editor} onCancel={() => setShowForm(false)} onSave={() => void saveHabit()}
              saveLabel={editing ? 'Save' : saving ? 'Creating…' : 'Create'} disabled={saving || !form.name.trim()} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function RhythmLedger({
  frequency,
  habits,
  periods,
  logsMap,
  logsLoading,
  currentPeriodKey,
  todayKey,
  windowTitle,
  canMoveForward,
  isCurrentWindow,
  onPrevious,
  onNext,
  onCurrent,
  onEdit,
  onToggle,
}: {
  frequency: HabitFrequency;
  habits: Habit[];
  periods: HabitPeriod[];
  logsMap: Record<string, string[]>;
  logsLoading: boolean;
  currentPeriodKey: string;
  todayKey: string;
  windowTitle: string;
  canMoveForward: boolean;
  isCurrentWindow: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onCurrent: () => void;
  onEdit: (habit: Habit) => void;
  onToggle: (habit: Habit, period: HabitPeriod) => void;
}) {
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Trailing 8px keeps the last cell off the rounded edge; there is no edit
  // column any more (the habit name opens the editor).
  const minWidth = 188 + periods.length * 52 + 8;
  // Every name pill in a section is as wide as its longest name (ch ≈ one
  // character), so pills and the figures after them align.
  const pillWidth = `calc(${Math.max(...habits.map((h) => h.name.length), 4)}ch + 1.5rem)`;
  const gridStyle = {
    gridTemplateColumns: `minmax(188px, 1fr) repeat(${periods.length}, 52px) 8px`,
    minWidth,
  };
  const groupSpans = useMemo(() => {
    const spans: Array<{ group: string; start: number; count: number }> = [];
    periods.forEach((period, index) => {
      const previous = spans.at(-1);
      if (previous?.group === period.group) previous.count += 1;
      else spans.push({ group: period.group, start: index, count: 1 });
    });
    return spans;
  }, [periods]);

  useEffect(() => {
    if (!isCurrentWindow || !scrollRef.current) return;
    const current = scrollRef.current.querySelector<HTMLElement>('[data-current-period="true"]');
    current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [currentPeriodKey, isCurrentWindow, reducedMotion]);

  return (
    <section
      aria-labelledby={`habit-${frequency}-heading`}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 id={`habit-${frequency}-heading`} className="text-base font-semibold">
            {FREQUENCY_LABEL[frequency]}
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">{habits.length}</span>
        </div>
        <div className="-mr-1 flex items-center rounded-full bg-[hsl(var(--surface-container-high))] p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-11 rounded-full md:size-9"
            onClick={onPrevious}
            aria-label={`Previous ${frequency} window`}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <button
            type="button"
            onClick={onCurrent}
            disabled={isCurrentWindow}
            className="h-9 min-w-32 rounded-full px-3 text-xs tabular-nums text-muted-foreground transition-colors enabled:text-primary enabled:hover:bg-[hsl(var(--on-surface)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={isCurrentWindow ? windowTitle : 'Return to current period'}
          >
            {windowTitle}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-11 rounded-full md:size-9"
            onClick={onNext}
            disabled={!canMoveForward}
            aria-label={`Next ${frequency} window`}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <div className="grid gap-x-1 px-2 pt-3 sm:px-3" style={gridStyle}>
          <div className="sticky left-0 z-20 bg-card" />
          {groupSpans.map((span) => (
            <div
              key={`${span.group}-${span.start}`}
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
              style={{ gridColumn: `${span.start + 2} / span ${span.count}` }}
            >
              {span.group}
            </div>
          ))}
        </div>

        <div className="grid gap-x-1 px-2 sm:px-3" style={gridStyle}>
          <div className="sticky left-0 z-20 bg-card" />
          {periods.map((period) => {
            const isCurrent = period.key === currentPeriodKey;
            return (
              <div
                key={period.key}
                data-current-period={isCurrent || undefined}
                className="flex h-9 items-center justify-center pb-1"
                title={period.accessibleLabel}
              >
                {/* Today is marked once, in the header, with the selection
                    role; the cells below only get a neutral state ring. */}
                <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold ${
                  isCurrent
                    ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                    : 'text-muted-foreground'
                }`}>
                  {period.label}
                </span>
              </div>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {habits.map((habit) => {
            const logDates = logsMap[String(habit.id)] ?? [];
            const done = periods.map((period) => periodIsComplete(logDates, period));
            // The streak's newest tick carries the count (from 2 up).
            const headKey = habit.current_streak >= 2
              ? streakHeadKey(currentPeriodKey, habit.logged_current_period, frequency)
              : null;
            return (
              <motion.div
                key={habit.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
                className="grid gap-x-1 border-t border-[hsl(var(--outline-variant)/0.72)] px-2 sm:px-3"
                style={gridStyle}
              >
                <button
                  type="button"
                  onClick={() => onEdit(habit)}
                  className="sticky left-0 z-20 flex min-w-0 items-center gap-3 bg-card px-2 py-3 text-left outline-none transition-colors hover:bg-[hsl(var(--surface-container-high))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  title={`Edit ${habit.name}`}
                >
                  {/* Name in the habit's colour (pills share the section's
                      longest width so the figures line up), then the total.
                      The streak lives in its newest tick. Phones stack the
                      total below. */}
                  <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <span
                      className="max-w-full shrink-0 truncate rounded-lg px-2.5 py-1 text-sm font-semibold"
                      style={{ backgroundColor: habit.color, color: inkOn(habit.color), width: pillWidth }}
                    >
                      {habit.name}
                    </span>
                    <span className="flex items-center gap-4 pl-0.5 text-xs text-muted-foreground sm:pl-0">
                      <span className="w-14 tabular-nums">{habit.total_periods ?? habit.total_logs} total</span>
                    </span>
                  </span>
                </button>

                {periods.map((period, index) => {
                  const complete = done[index];
                  const isCurrent = period.key === currentPeriodKey;
                  const isFuture = period.key > currentPeriodKey || period.key > todayKey && frequency === 'daily';
                  // Ticks in a row are joined by a soft band in the habit's
                  // colour (it spans half the 4px column gap each side).
                  const joinLeft = complete && index > 0 && done[index - 1];
                  const joinRight = complete && index < done.length - 1 && done[index + 1];
                  return (
                    <div key={period.key} className="relative flex items-center justify-center py-2">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-2 -left-0.5 right-1/2 transition-opacity duration-200 motion-reduce:transition-none"
                        style={{ backgroundColor: habit.color, opacity: joinLeft ? 0.4 : 0 }}
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-2 left-1/2 -right-0.5 transition-opacity duration-200 motion-reduce:transition-none"
                        style={{ backgroundColor: habit.color, opacity: joinRight ? 0.4 : 0 }}
                      />
                      <PeriodToggle
                        period={period}
                        complete={complete}
                        streak={complete && period.key === headKey ? habit.current_streak : undefined}
                        streakUnit={habit.streak_unit}
                        current={isCurrent}
                        future={isFuture}
                        color={habit.color}
                        reducedMotion={Boolean(reducedMotion)}
                        loading={logsLoading}
                        onToggle={() => onToggle(habit, period)}
                      />
                    </div>
                  );
                })}

                <div aria-hidden />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}

// Both outlines share one point count, so clip-path can morph between them.
const OUTLINE_POINTS = 72;
function outline(radiusAt: (angle: number) => number): string {
  const points = Array.from({ length: OUTLINE_POINTS }, (_, i) => {
    const angle = (i / OUTLINE_POINTS) * 2 * Math.PI;
    const r = radiusAt(angle);
    return `${(50 + r * Math.cos(angle)).toFixed(2)}% ${(50 + r * Math.sin(angle)).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}
// The toggle's 44px tile with 18px corners, in % of its side.
function tileRadius(angle: number): number {
  const corner = (18 / 44) * 100;
  const inner = 50 - corner;
  let low = 0;
  let high = 75;
  for (let step = 0; step < 24; step++) {
    const r = (low + high) / 2;
    const qx = Math.abs(r * Math.cos(angle)) - inner;
    const qy = Math.abs(r * Math.sin(angle)) - inner;
    const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
    if (distance > 0) high = r;
    else low = r;
  }
  return low;
}
const TILE_OUTLINE = outline(tileRadius);
// M3 Expressive's nine-sided cookie marks the streak's newest tick.
const COOKIE_OUTLINE = outline((angle) => 46.5 + 3.5 * Math.cos(9 * angle));

function PeriodToggle({
  period,
  complete,
  streak,
  streakUnit,
  current,
  future,
  color,
  reducedMotion,
  loading,
  onToggle,
}: {
  period: HabitPeriod;
  complete: boolean;
  /** Set on the streak's newest tick: shown instead of the check. */
  streak?: number;
  streakUnit: string;
  current: boolean;
  future: boolean;
  color: string;
  reducedMotion: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const disabled = future || loading;
  const title = future
    ? `${period.accessibleLabel}, future period`
    : `${period.accessibleLabel}, ${complete ? 'completed' : 'not completed'}${streak ? `, ${streak} ${streakUnit} streak` : ''}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={complete}
      aria-label={title}
      title={title}
      className={`relative grid size-11 place-items-center overflow-hidden rounded-[18px] outline-none transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        disabled ? 'cursor-default opacity-40' : 'active:scale-[0.96]'
      }`}
      style={{
        // Once done, the fill is the whole shape (the cookie has no corners to fill).
        backgroundColor: complete ? 'transparent' : 'hsl(var(--surface-container-highest))',
        boxShadow: current && !complete ? 'inset 0 0 0 2px hsl(var(--outline))' : 'none',
      }}
    >
      <AnimatePresence initial={false}>
        {complete && (
          <motion.span
            key="fill"
            className="absolute inset-0 transition-[clip-path] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
            style={{ backgroundColor: color, clipPath: streak ? COOKIE_OUTLINE : TILE_OUTLINE }}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.86 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0, 0, 1] }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {complete && (
          <motion.span
            key={streak ? `streak-${streak}` : 'check'}
            className="relative z-10 inline-flex text-[15px] font-bold tabular-nums [grid-area:1/1]"
            // Same contrast-chosen ink as the habit's name pill.
            style={{ color: inkOn(color) }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            {streak ? streak : <Check className="size-4" strokeWidth={3} />}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
