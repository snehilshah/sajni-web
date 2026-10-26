import { useEffect, useState } from 'react';

import { EditActions } from '@/components/editor-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/time-picker';
import { useEditorDraft } from '@/hooks/use-editor-draft';
import { useIsMobile } from '@/hooks/use-mobile';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/utils';
import { plans as plansApi } from '@/api';
import { useCreatePlan, useDeletePlan, usePlans } from '@/queries/plans';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import type { Plan, PlanInput } from '@/types';

const SWATCHES = ['#2D5A4F', '#7C9A92', '#C49A6C', '#A14B4F', '#4F6FA1', '#8B6FA1', '#7A7A7A'];
const WEEKDAYS = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

const same = (a: number[], b: number[]) => a.length === b.length && b.every((d) => a.includes(d));

/** "Workdays", "Weekends", "Every day", else "Mon, Wed". */
export function planDaysLabel(days: number[]) {
  if (days.length === 7) return 'Every day';
  if (same(days, WORKDAYS)) return 'Workdays';
  if (same(days, WEEKENDS)) return 'Weekends';
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]).join(', ');
}

/** "09:00" → "9:00 AM". */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const emptyDraft = (): PlanInput => ({
  name: '', color: SWATCHES[0], weekdays: WORKDAYS, start_time: '09:00', notify: true,
});
const draftOf = (p: Plan): PlanInput => ({
  name: p.name, color: p.color, weekdays: p.weekdays, start_time: p.start_time, notify: p.notify,
});

/** Journal's plans manager: the list, and an editor for one plan.
 *  Nothing saves until Save; a new plan is an explicit Add. */
export function PlansManager({ open, onOpenChange, initialId = null }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens straight into this plan's editor ('new' for a blank one). */
  initialId?: number | 'new' | null;
}) {
  const mobile = useIsMobile();
  const qc = useQueryClient();
  const { data: list = [] } = usePlans();
  const create = useCreatePlan();
  const remove = useDeletePlan();
  const [view, setView] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<PlanInput>(emptyDraft);
  const editing = typeof view === 'number' ? list.find((r) => r.id === view) ?? null : null;
  const invalid = !draft.name.trim() ? 'a plan needs a name.'
    : draft.weekdays.length === 0 ? 'pick at least one day.' : null;

  // Nothing saves until Save (or Add plan); leaving with changes asks twice.
  const editor = useEditorDraft({
    open: open,
    editing: !!(open && editing),
    value: draft,
    // The list has nothing to lose.
    dirty: view === null ? false : undefined,
    invalid,
    save: async (v) => {
      if (!editing) return;
      await plansApi.update(editing.id, v);
      void qc.invalidateQueries({ queryKey: qk.tasks.all });
    },
  });
  const loadDraft = editor.load;

  useEffect(() => { if (open) setView(initialId); }, [open, initialId]);
  // Load once per opened plan; later list refetches mustn't reset typing.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (view === 'new') { const blank = emptyDraft(); setDraft(blank); loadDraft(blank); return; }
    const r = list.find((x) => x.id === view);
    if (!r) return;
    const loaded = draftOf(r);
    setDraft(loaded);
    loadDraft(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, editingId, loadDraft]);

  const back = () => editor.close(() => setView(null));
  const requestClose = () => editor.close(() => onOpenChange(false));
  const handleOpenChange = (next: boolean) => (next ? onOpenChange(true) : requestClose());

  const add = () => {
    if (invalid) return;
    create.mutate(draft, { onSuccess: () => setView(null) });
  };
  const del = async () => {
    if (!editing) return;
    if (!(await confirmDialog(`Delete ${editing.name}? Its tasks stay in Tasks.`))) return;
    editor.cancel();
    remove.mutate(editing.id, { onSuccess: () => setView(null) });
  };

  const inEditor = view !== null;
  const title = !inEditor ? 'Plans' : editing ? 'Edit plan' : 'New plan';
  const description = !inEditor
    ? 'Moments to plan your day, like reaching the office. They show at the top of each Journal day.'
    : 'At this time on these days, plan what the day is about.';

  const body = !inEditor ? (
    <PlanList plans={list} onOpen={setView} />
  ) : (
    <PlanForm draft={draft} onChange={setDraft} />
  );
  const footer = !inEditor ? (
    <>
      <Button variant="outline" onClick={requestClose}>Close</Button>
      <Button onClick={() => setView('new')}><Plus className="size-4" /> New plan</Button>
    </>
  ) : editing ? (
    <>
      <Button variant="destructive-ghost" size="icon-sm" className="mr-auto size-10" onClick={del} aria-label="Delete plan" title="Delete plan">
        <Trash2 className="size-4" />
      </Button>
      <EditActions draft={editor} onCancel={() => setView(null)} onSave={() => void editor.save(() => setView(null))} />
    </>
  ) : (
    <EditActions draft={editor} onCancel={() => setView(null)} onSave={add} saveLabel="Add plan"
      disabled={create.isPending || !!invalid} />
  );
  const heading = (
    <span className="flex items-center gap-1.5">
      {inEditor && (
        <Button variant="ghost" size="icon-sm" className="-ml-2 rounded-full" onClick={back} aria-label="All plans">
          <ChevronLeft className="size-4" />
        </Button>
      )}
      {title}
    </span>
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="flex items-baseline justify-between gap-3 serif text-xl normal-case tracking-tight">{heading}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-4">{body}</div>
          <SheetFooter className="sticky bottom-0 flex-row justify-end border-t border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[min(86vh,760px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle>{heading}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanList({ plans, onOpen }: { plans: Plan[]; onOpen: (id: number) => void }) {
  if (plans.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No plans yet. Try “Office start”, workdays at 9:00.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl bg-[hsl(var(--surface-container-low))]">
      {plans.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p.id)}
          className={cn(
            'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[hsl(var(--surface-container))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
            i > 0 && 'border-t border-[hsl(var(--outline-variant)/0.55)]',
          )}
        >
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color || SWATCHES[0] }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.name}</span>
            <span className="block text-xs text-muted-foreground">
              {planDaysLabel(p.weekdays)} · {formatClock(p.start_time)}
              {!p.notify && ' · no alert'}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function PlanForm({ draft, onChange }: { draft: PlanInput; onChange: (d: PlanInput) => void }) {
  const set = (patch: Partial<PlanInput>) => onChange({ ...draft, ...patch });
  const presets = [
    { label: 'Workdays', days: WORKDAYS },
    { label: 'Weekends', days: WEEKENDS },
    { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="plan-name">Name</Label>
        <Input id="plan-name" autoFocus value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Office start" />
      </div>

      <div className="grid gap-2">
        <Label>Days</Label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => set({ weekdays: p.days })}
              className={cn('chip', same(draft.weekdays, p.days) && 'chip-selected')}
            >{p.label}</button>
          ))}
        </div>
        <div className="flex justify-between gap-1" aria-label="Days it runs">
          {WEEKDAYS.map((day) => {
            const selected = draft.weekdays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                aria-label={DAY_NAMES[day.value]}
                aria-pressed={selected}
                onClick={() => set({ weekdays: selected ? draft.weekdays.filter((d) => d !== day.value) : [...draft.weekdays, day.value] })}
                className={cn('size-10 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45', selected ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'bg-[hsl(var(--surface-container-high))] text-muted-foreground hover:text-foreground')}
              >{day.label}</button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="plan-time">Starts at</Label>
          <TimePicker id="plan-time" value={draft.start_time} onChange={(v) => v && set({ start_time: v })} />
        </div>
        <label className="flex min-h-10 items-center gap-2.5 text-sm">
          Alert
          <Switch checked={draft.notify} onCheckedChange={(v) => set({ notify: v })} aria-label="Alert at the start time" />
        </label>
      </div>

      <div className="grid gap-2">
        <Label>Colour</Label>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => set({ color })}
              aria-label={`Use colour ${color}`}
              aria-pressed={draft.color === color}
              className={cn('size-8 rounded-md border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                draft.color === color ? 'scale-110 border-background ring-2 ring-ring' : 'border-transparent')}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
