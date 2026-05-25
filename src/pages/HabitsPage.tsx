import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, startOfDay } from 'date-fns';

import { habits as habitsApi } from '@/api';
import type { Habit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Flame, Loader2, Pencil, Check } from 'lucide-react';
import PageShell from '@/components/PageShell';

const SWATCHES = ['#2D5A4F', '#7C9A92', '#C49A6C', '#A14B4F', '#4F6FA1', '#8B6FA1', '#7A7A7A'];

// Habits — single-card week grid. Mon..Sun ending today. Each cell is
// clickable to toggle that day's log; the small streak column on the
// right shows the longest current streak. Clicking the row name (or its
// dot) opens the edit dialog.
export default function HabitsPage() {
  const [habitsList, setHabitsList] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<number, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [form, setForm] = useState({ name: '', frequency: 'daily', color: SWATCHES[0] });
  const [saving, setSaving] = useState(false);

  const week = useMemo(() => {
    // Mon..Sun ending on the most recent Sunday or today, whichever
    // sweeps in today. Simpler: last 7 days ending today.
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
  }, []);
  const weekKeys = useMemo(() => week.map((d) => format(d, 'yyyy-MM-dd')), [week]);
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const longestStreak = useMemo(
    () => habitsList.reduce((m, h) => Math.max(m, h.current_streak), 0),
    [habitsList],
  );

  const load = async () => {
    try {
      const data = await habitsApi.list();
      setHabitsList(data);
      const entries = await Promise.all(
        data.map(async (h) => {
          try { return [h.id, await habitsApi.getLogs(h.id, 14)] as const; }
          catch { return [h.id, [] as string[]] as const; }
        })
      );
      const logs: Record<number, Set<string>> = {};
      for (const [id, arr] of entries) logs[id] = new Set(arr);
      setHabitLogs(logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const openEdit = (h: Habit) => {
    setEditing(h);
    setForm({ name: h.name, frequency: h.frequency, color: h.color });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await habitsApi.update(editing.id, form);
      else await habitsApi.create(form);
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this habit and all its logs?')) return;
    await habitsApi.delete(id);
    load();
  };

  const toggleDay = async (habit: Habit, dateStr: string) => {
    setHabitLogs((prev) => {
      const next = { ...prev };
      const set = new Set(next[habit.id] || []);
      if (set.has(dateStr)) set.delete(dateStr); else set.add(dateStr);
      next[habit.id] = set;
      return next;
    });
    await habitsApi.toggleLogForDate(habit.id, dateStr);
    const fresh = await habitsApi.list();
    setHabitsList(fresh);
  };

  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const caption = `${habitsList.length} active ${habitsList.length === 1 ? 'habit' : 'habits'}${longestStreak > 0 ? ` · longest streak ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}` : ''}`;

  return (
    <PageShell
      caption={caption}
      title="Habits"
      actions={<Button onClick={openCreate}><Plus className="size-3.5" /> New habit</Button>}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : habitsList.length === 0 ? (
        <div className="rounded-lg text-center py-16 text-muted-foreground bg-[hsl(var(--surface-container))] border border-border">
          <div className="text-4xl mb-3 opacity-30">◉</div>
          <p className="text-sm">No habits yet. Build something small.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="size-3.5" /> Add your first habit
          </Button>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden bg-[hsl(var(--surface-container))] border border-border">
          {/* Header row */}
          <div
            className="hidden md:grid items-center px-5 md:px-6 py-3 border-b border-border/50"
            style={{ gridTemplateColumns: 'minmax(0, 1.6fr) repeat(7, minmax(0, 60px)) 100px' }}
          >
            <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Habit</div>
            {dayLetters.map((d, i) => (
              <div key={i} className="mono text-[10px] text-muted-foreground text-center">{d}</div>
            ))}
            <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground text-right">Streak</div>
          </div>

          <div className="sajni-stagger">
            <AnimatePresence initial={false}>
              {habitsList.map((habit) => (
                <motion.div
                  key={habit.id}
                  layout="position"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                >
                  <HabitWeekRow
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
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v ?? 'daily' })}>
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

function HabitWeekRow({
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
  return (
    <div
      className="group items-center px-5 md:px-6 py-4 border-b border-border/30 last:border-b-0
                 grid md:grid"
      style={{ gridTemplateColumns: 'minmax(0, 1.6fr) repeat(7, minmax(0, 60px)) 100px' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          onClick={onEdit}
          className="size-2.5 rounded-full shrink-0 cursor-pointer"
          style={{ backgroundColor: habit.color }}
          title="Edit"
        />
        <button onClick={onEdit} className="text-left min-w-0">
          <div className="text-[14.5px] font-medium text-foreground truncate">{habit.name}</div>
          <div className="mono text-[10.5px] text-muted-foreground mt-0.5 capitalize">
            {habit.frequency} · {habit.total_logs} total
          </div>
        </button>
        <div className="ml-auto md:hidden flex items-center gap-1 text-[12px] text-muted-foreground">
          <Flame className="size-3 text-secondary" />
          <span className="mono">{habit.current_streak}d</span>
        </div>
      </div>

      {weekKeys.map((d, i) => {
        const on = loggedDays.has(d);
        const isToday = d === todayKey;
        return (
          <div key={i} className="hidden md:flex justify-center">
            <button
              onClick={() => onToggleDay(d)}
              title={`${d}${on ? ' — logged' : ''}${isToday ? ' (today)' : ''}`}
              className="size-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
              style={{
                background: on ? habit.color : 'hsl(var(--muted-foreground) / 0.08)',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: on ? `0 4px 12px -4px ${habit.color}66` : 'none',
                outline: isToday ? `1.5px solid ${habit.color}` : 'none',
                outlineOffset: isToday ? 2 : 0,
              }}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </button>
          </div>
        );
      })}

      <div className="hidden md:flex items-center justify-end gap-1.5 group">
        <Flame className="size-3.5 text-secondary" />
        <span className="mono text-[14px] font-semibold tabular-nums">{habit.current_streak}</span>
        <span className="mono text-[11px] text-muted-foreground">d</span>
        <div className="flex gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit"><Pencil className="size-3" /></Button>
          <Button variant="ghost" size="icon-xs" onClick={onDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete">
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Mobile: simple 7-dot row */}
      <div className="md:hidden col-span-full mt-2 flex gap-1.5">
        {weekKeys.map((d, i) => {
          const on = loggedDays.has(d);
          return (
            <button
              key={i}
              onClick={() => onToggleDay(d)}
              className="flex-1 h-6 rounded-md flex items-center justify-center"
              style={{ background: on ? habit.color : 'hsl(var(--muted-foreground) / 0.1)' }}
            >
              {on && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
