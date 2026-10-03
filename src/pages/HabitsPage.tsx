import { useEffect, useMemo, useRef, useState } from 'react';
import { inkOn } from '@/lib/ink';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import {
  useCreateHabit,
  useDeleteHabit,
  useHabitLogRange,
  useHabits,
  useToggleHabitPeriod,
  useUpdateHabit,
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
  Flame,
  Loader2,
  Plus,
} from '@/components/ui/icons';
import PageShell, { PageShellTabs } from '@/components/PageShell';

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
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [form, setForm] = useState<HabitForm>({
    name: '',
    frequency: 'daily',
    color: SWATCHES[0],
  });
  const [saving, setSaving] = useState(false);

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
  }, [focusId, habitsList, searchParams, setSearchParams]);

  function openEdit(habit: Habit) {
    setEditing(habit);
    setForm({ name: habit.name, frequency: habit.frequency, color: habit.color });
    setShowForm(true);
  }

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', frequency: 'daily', color: SWATCHES[0] });
    setShowForm(true);
  };

  const saveHabit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const value = { ...form, name: form.name.trim() };
      if (editing) {
        await updateHabit.mutateAsync({ id: editing.id, data: value });
      } else {
        await createHabit.mutateAsync(value);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const removeHabit = async (habit: Habit) => {
    if (!(await confirmDialog(`Delete "${habit.name}" and all its logs?`))) return;
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Habit' : 'New Habit'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="habit-name">Name</Label>
              <Input
                id="habit-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
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

          <DialogFooter>
            {editing && (
              <Button
                variant="destructive"
                onClick={() => removeHabit(editing)}
                className="sm:mr-auto"
              >
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={saveHabit} disabled={saving || !form.name.trim()} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </Button>
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
                  {/* The name sits in the habit's colour (no separate dot):
                      identity and label in one shape, matching Android. */}
                  <span className="flex min-w-0 flex-col items-start">
                    <span
                      className="max-w-full truncate rounded-lg px-2.5 py-1 text-sm font-semibold"
                      style={{ backgroundColor: habit.color, color: inkOn(habit.color) }}
                    >
                      {habit.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2 pl-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">{habit.total_periods ?? habit.total_logs} total</span>
                      <span className="inline-flex items-center gap-0.5" title={`${habit.current_streak} ${habit.streak_unit} streak`}>
                        <Flame className="size-3" />
                        <span className="tabular-nums">{habit.current_streak}</span>
                      </span>
                    </span>
                  </span>
                </button>

                {periods.map((period) => {
                  const complete = periodIsComplete(logDates, period);
                  const isCurrent = period.key === currentPeriodKey;
                  const isFuture = period.key > currentPeriodKey || period.key > todayKey && frequency === 'daily';
                  return (
                    <div key={period.key} className="flex items-center justify-center py-2">
                      <PeriodToggle
                        period={period}
                        complete={complete}
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

function PeriodToggle({
  period,
  complete,
  current,
  future,
  color,
  reducedMotion,
  loading,
  onToggle,
}: {
  period: HabitPeriod;
  complete: boolean;
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
    : `${period.accessibleLabel}, ${complete ? 'completed' : 'not completed'}`;
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
        backgroundColor: 'hsl(var(--surface-container-highest))',
        boxShadow: current && !complete ? 'inset 0 0 0 2px hsl(var(--outline))' : 'none',
      }}
    >
      <AnimatePresence initial={false}>
        {complete && (
          <motion.span
            key="fill"
            className="absolute inset-0 rounded-[18px]"
            style={{ backgroundColor: color }}
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
            key="check"
            className="relative z-10 inline-flex text-[hsl(var(--primary-foreground))]"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
