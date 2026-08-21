import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';

import type { Reminder, ReminderHistoryItem, ReminderInput, ReminderRecurrence } from '@/types';
import {
  useCreateReminder, useDeleteReminder, useReminderHistory, useReminders,
  useSkipReminder, useSnoozeReminder, useUpdateReminder,
} from '@/queries/reminders';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlarmClock, Bell, CalendarClock, ChevronDown, Clock, MoreHorizontal,
  ChevronRight, Pencil, Repeat, Search, Trash2,
} from '@/components/ui/icons';

const FREQUENCIES = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
] as const;

const WEEKDAYS = [
  { value: 1, label: 'M' }, { value: 2, label: 'T' }, { value: 3, label: 'W' },
  { value: 4, label: 'T' }, { value: 5, label: 'F' }, { value: 6, label: 'S' },
  { value: 0, label: 'S' },
] as const;

type Draft = {
  message: string;
  notes: string;
  when: string;
  repeat: boolean;
  frequency: NonNullable<ReminderRecurrence['frequency']>;
  interval: number;
  weekdays: number[];
  monthlyMode: 'date' | 'weekday';
  monthDay: number;
  weekday: number;
  ordinal: number;
  endMode: 'never' | 'date' | 'count';
  until: string;
  count: number;
};

function nextHourInput() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function localInput(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

function emptyDraft(): Draft {
  const date = new Date(nextHourInput());
  return {
    message: '', notes: '', when: nextHourInput(), repeat: false,
    frequency: 'weekly', interval: 1, weekdays: [date.getDay()],
    monthlyMode: 'date', monthDay: date.getDate(), weekday: date.getDay(),
    ordinal: Math.ceil(date.getDate() / 7), endMode: 'never', until: '', count: 10,
  };
}

function reminderDraft(item: Reminder): Draft {
  const rule = item.recurrence ?? {};
  const start = new Date(item.starts_at);
  return {
    message: item.message,
    notes: item.notes,
    when: localInput(item.next_occurrence?.scheduled_at ?? item.starts_at),
    repeat: !!rule.frequency,
    frequency: rule.frequency ?? 'weekly',
    interval: rule.interval ?? 1,
    weekdays: rule.weekdays?.length ? rule.weekdays : [start.getDay()],
    monthlyMode: rule.monthly_mode ?? 'date',
    monthDay: rule.month_day ?? start.getDate(),
    weekday: rule.weekday ?? start.getDay(),
    ordinal: rule.ordinal ?? Math.ceil(start.getDate() / 7),
    endMode: rule.until ? 'date' : rule.count ? 'count' : 'never',
    until: rule.until ?? '',
    count: rule.count ?? 10,
  };
}

function recurrenceFromDraft(draft: Draft): ReminderRecurrence {
  if (!draft.repeat) return {};
  const rule: ReminderRecurrence = {
    frequency: draft.frequency,
    interval: Math.max(1, draft.interval),
  };
  if (draft.frequency === 'weekly') rule.weekdays = draft.weekdays;
  if (draft.frequency === 'monthly') {
    rule.monthly_mode = draft.monthlyMode;
    if (draft.monthlyMode === 'date') rule.month_day = draft.monthDay;
    else {
      rule.weekday = draft.weekday;
      rule.ordinal = draft.ordinal;
    }
  }
  if (draft.endMode === 'date' && draft.until) rule.until = draft.until;
  if (draft.endMode === 'count') rule.count = Math.max(1, draft.count);
  return rule;
}

function recurrenceLabel(rule: ReminderRecurrence) {
  const interval = rule.interval ?? 1;
  if (!rule.frequency) return '';
  if (rule.frequency === 'weekly' && rule.weekdays?.length) {
    const days = rule.weekdays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ');
    return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
  }
  if (rule.frequency === 'monthly' && rule.monthly_mode === 'weekday') {
    const ordinal = rule.ordinal === -1 ? 'last' : ['first', 'second', 'third', 'fourth', 'fifth'][(rule.ordinal ?? 1) - 1];
    return `${interval === 1 ? 'Monthly' : `Every ${interval} months`} · ${ordinal} ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][rule.weekday ?? 0]}`;
  }
  const singular = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.frequency];
	return interval === 1 ? `Every ${singular}` : `Every ${interval} ${singular}s`;
}

function reminderInput(draft: Draft): ReminderInput {
  return {
    message: draft.message.trim(),
    notes: draft.notes.trim(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    starts_at: new Date(draft.when).toISOString(),
    recurrence: recurrenceFromDraft(draft),
  };
}

export default function RemindersPanel({ createSignal = 0, focusId }: { createSignal?: number; focusId?: number }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const { data: reminders = [], isLoading } = useReminders(deferredSearch);
  const { data: recent = [] } = useReminderHistory();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [creating, setCreating] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [customSnooze, setCustomSnooze] = useState<Reminder | null>(null);
  const [customWhen, setCustomWhen] = useState(nextHourInput());

  const snooze = useSnoozeReminder();
  const skip = useSkipReminder();
  const remove = useDeleteReminder();
  const handledFocus = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (createSignal > 0) {
      setEditing(null);
      setCreating(true);
    }
  }, [createSignal]);

  useEffect(() => {
    if (!focusId || handledFocus.current === focusId) return;
    const item = reminders.find((candidate) => candidate.id === focusId);
    if (item) {
      handledFocus.current = focusId;
      setEditing(item);
    }
  }, [focusId, reminders]);

  const groups = useMemo(() => groupReminders(reminders), [reminders]);

  const doSnooze = (item: Reminder, minutes: number) => {
    snooze.mutate({ id: item.id, occurrenceId: item.next_occurrence?.id, minutes });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section
        aria-label="Reminder controls"
        className="flex items-center gap-2 rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-2.5 sm:p-3"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reminders"
            aria-label="Search reminders"
            className="h-11 rounded-full bg-[hsl(var(--surface-container))] pl-10"
          />
        </div>
        <Button
          variant="tonal"
          className="hidden h-11 gap-2 rounded-full px-4 sm:inline-flex"
          onClick={() => { setEditing(null); setCreating(true); }}
        >
          <Bell className="size-4" /> New reminder
        </Button>
      </section>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((value) => <Skeleton key={value} className="h-16 rounded-xl" />)}
        </div>
      ) : reminders.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[hsl(var(--outline-variant))] py-16 text-center text-muted-foreground">
          <Bell className="mx-auto mb-3 size-9 opacity-35" />
          <div className="text-sm font-medium text-foreground">No upcoming reminders</div>
          <div className="mt-1 text-sm">A message and a time are enough.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <ReminderGroup
              key={group.label}
              label={group.label}
              items={group.items}
              onEdit={setEditing}
              onSnooze={doSnooze}
              onCustomSnooze={(item) => { setCustomSnooze(item); setCustomWhen(nextHourInput()); }}
              onSkip={(item) => skip.mutate({ id: item.id, occurrenceId: item.next_occurrence?.id })}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-2">
          <button
            type="button"
            onClick={() => setRecentOpen((open) => !open)}
            className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            aria-expanded={recentOpen}
          >
            <ChevronDown className={cn('size-4 transition-transform', !recentOpen && '-rotate-90')} />
            Recent <span className="mono text-xs tabular-nums">{recent.length}</span>
          </button>
          {recentOpen && <RecentLedger items={recent} />}
        </section>
      )}

      <ReminderEditor
        open={creating || editing !== null}
        editing={editing}
        onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}
      />

      <Dialog open={customSnooze !== null} onOpenChange={(open) => { if (!open) setCustomSnooze(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze reminder</DialogTitle>
            <DialogDescription>Choose when this occurrence should interrupt you again.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="custom-snooze">New time</Label>
            <Input id="custom-snooze" type="datetime-local" value={customWhen} onChange={(event) => setCustomWhen(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomSnooze(null)}>Cancel</Button>
            <Button
              disabled={!customWhen || snooze.isPending}
              onClick={() => {
                if (!customSnooze) return;
                snooze.mutate({
                  id: customSnooze.id,
                  occurrenceId: customSnooze.next_occurrence?.id,
                  fireAt: new Date(customWhen).toISOString(),
                }, { onSuccess: () => setCustomSnooze(null) });
              }}
            >Snooze</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete reminder?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.recurrence.frequency ? 'This deletes the entire recurring series and its history.' : 'This reminder and its history will be removed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function groupReminders(items: Reminder[]) {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const groups: Array<{ label: string; items: Reminder[] }> = [
    { label: 'Today', items: [] }, { label: 'Tomorrow', items: [] },
    { label: 'Later', items: [] }, { label: 'Recurring', items: [] },
  ];
  [...items]
    .filter((item) => item.next_occurrence)
    .sort((a, b) => new Date(a.next_occurrence!.fire_at).getTime() - new Date(b.next_occurrence!.fire_at).getTime())
    .forEach((item) => {
      const fireAt = new Date(item.next_occurrence!.fire_at);
      if (isSameDay(fireAt, today)) groups[0].items.push(item);
      else if (isSameDay(fireAt, tomorrow)) groups[1].items.push(item);
      else if (item.recurrence.frequency) groups[3].items.push(item);
      else groups[2].items.push(item);
    });
  return groups.filter((group) => group.items.length > 0);
}

function ReminderGroup({ label, items, onEdit, onSnooze, onCustomSnooze, onSkip, onDelete }: {
  label: string;
  items: Reminder[];
  onEdit: (item: Reminder) => void;
  onSnooze: (item: Reminder, minutes: number) => void;
  onCustomSnooze: (item: Reminder) => void;
  onSkip: (item: Reminder) => void;
  onDelete: (item: Reminder) => void;
}) {
  return (
    <section aria-labelledby={`reminders-${label.toLowerCase()}`}>
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <h2 id={`reminders-${label.toLowerCase()}`} className="mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</h2>
        <span className="mono text-xs tabular-nums text-muted-foreground/70">{items.length}</span>
        <span className="h-px flex-1 bg-[hsl(var(--outline-variant))]" />
      </div>
      <div className="overflow-hidden rounded-[22px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
        {items.map((item, index) => (
          <ReminderRow
            key={item.id}
            item={item}
            separated={index > 0}
            onEdit={() => onEdit(item)}
            onSnooze={(minutes) => onSnooze(item, minutes)}
            onCustomSnooze={() => onCustomSnooze(item)}
            onSkip={() => onSkip(item)}
            onDelete={() => onDelete(item)}
          />
        ))}
      </div>
    </section>
  );
}

function ReminderRow({ item, separated, onEdit, onSnooze, onCustomSnooze, onSkip, onDelete }: {
  item: Reminder;
  separated: boolean;
  onEdit: () => void;
  onSnooze: (minutes: number) => void;
  onCustomSnooze: () => void;
  onSkip: () => void;
  onDelete: () => void;
}) {
  const fireAt = item.next_occurrence ? new Date(item.next_occurrence.fire_at) : null;
  return (
    <div className={cn('group flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4', separated && 'border-t border-[hsl(var(--outline-variant)/0.55)]')}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]">
        <AlarmClock className="size-4" />
      </div>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/45">
        <div className="truncate text-sm font-semibold text-foreground">{item.message}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {fireAt && <span className="shrink-0">{format(fireAt, isSameDay(fireAt, new Date()) ? 'h:mm a' : 'EEE, MMM d · h:mm a')}</span>}
          {item.recurrence.frequency && (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Repeat className="size-3 shrink-0" /> {recurrenceLabel(item.recurrence)}
            </span>
          )}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="size-11 shrink-0" aria-label={`Actions for ${item.message}`} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Snooze</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onSnooze(10)}><Clock />10 minutes</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSnooze(60)}><Clock />1 hour</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSnooze(minutesUntilTomorrowNine())}><CalendarClock />Tomorrow at 9 AM</DropdownMenuItem>
          <DropdownMenuItem onClick={onCustomSnooze}><CalendarClock />Pick date & time</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}><Pencil />Edit series</DropdownMenuItem>
          {item.recurrence.frequency && <DropdownMenuItem onClick={onSkip}><ChevronRight />Skip this occurrence</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />Delete series</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RecentLedger({ items }: { items: ReminderHistoryItem[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-[22px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
      {items.map((item, index) => (
        <div key={item.id} className={cn('flex min-h-14 items-center gap-3 px-4 py-2.5', index > 0 && 'border-t border-[hsl(var(--outline-variant)/0.55)]')}>
          <Bell className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{item.message}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.status === 'skipped' ? 'Skipped' : 'Delivered'} · {format(new Date(item.delivered_at ?? item.skipped_at ?? item.fire_at), 'MMM d · h:mm a')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReminderEditor({ open, editing, onOpenChange }: { open: boolean; editing: Reminder | null; onOpenChange: (open: boolean) => void }) {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? reminderDraft(editing) : emptyDraft());
  }, [editing, open]);

  const save = () => {
    if (!draft.message.trim() || !draft.when || (draft.repeat && draft.frequency === 'weekly' && draft.weekdays.length === 0)) return;
    const input = reminderInput(draft);
    if (editing) update.mutate({ id: editing.id, input }, { onSuccess: () => onOpenChange(false) });
    else create.mutate(input, { onSuccess: () => onOpenChange(false) });
  };

  const form = <ReminderForm draft={draft} onChange={setDraft} />;
  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button disabled={saving || !draft.message.trim() || !draft.when || (draft.repeat && draft.frequency === 'weekly' && draft.weekdays.length === 0)} onClick={save}>
        {editing ? 'Save changes' : 'Create reminder'}
      </Button>
    </>
  );

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="serif text-xl normal-case tracking-tight">{editing ? 'Edit reminder' : 'New reminder'}</SheetTitle>
            <SheetDescription>A message and a time. Everything else is optional.</SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-4">{form}</div>
          <SheetFooter className="sticky bottom-0 border-t border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(86vh,760px)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit reminder' : 'New reminder'}</DialogTitle>
          <DialogDescription>A message and a time. Everything else is optional.</DialogDescription>
        </DialogHeader>
        {form}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const frequencyItems = FREQUENCIES.map((item) => ({ value: item.value, label: item.label }));
  const endItems = [{ value: 'never', label: 'Never' }, { value: 'date', label: 'On date' }, { value: 'count', label: 'After count' }];
  const monthlyItems = [{ value: 'date', label: 'Day of month' }, { value: 'weekday', label: 'Weekday pattern' }];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="reminder-message">Remind me to</Label>
        <Input id="reminder-message" autoFocus value={draft.message} maxLength={500} onChange={(event) => onChange({ ...draft, message: event.target.value })} placeholder="Call Mom" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reminder-when">When</Label>
        <Input id="reminder-when" type="datetime-local" value={draft.when} onChange={(event) => onChange({ ...draft, when: event.target.value })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reminder-notes">Notes <span className="font-normal text-muted-foreground">optional</span></Label>
        <Textarea id="reminder-notes" value={draft.notes} maxLength={4000} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="Anything useful when this arrives" className="min-h-20" />
      </div>

      <section className="rounded-[22px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-3.5">
        <button
          type="button"
          onClick={() => onChange({ ...draft, repeat: !draft.repeat })}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          aria-expanded={draft.repeat}
        >
          <span className={cn('flex size-9 items-center justify-center rounded-[13px]', draft.repeat ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'bg-[hsl(var(--surface-container-high))] text-muted-foreground')}>
            <Repeat className="size-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Repeat</span>
            <span className="block text-xs text-muted-foreground">{draft.repeat ? recurrenceLabel(recurrenceFromDraft(draft)) : 'One time'}</span>
          </span>
          <ChevronDown className={cn('size-4 transition-transform', !draft.repeat && '-rotate-90')} />
        </button>

        {draft.repeat && (
          <div className="mt-3 grid gap-3 border-t border-[hsl(var(--outline-variant)/0.6)] pt-3">
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <Input type="number" min={1} max={999} value={draft.interval} aria-label="Repeat interval" onChange={(event) => onChange({ ...draft, interval: Number(event.target.value) || 1 })} />
              <Select value={draft.frequency} onValueChange={(value) => onChange({ ...draft, frequency: value as Draft['frequency'] })} items={frequencyItems}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}{draft.interval > 1 ? 's' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {draft.frequency === 'weekly' && (
              <div className="flex justify-between gap-1" aria-label="Repeat weekdays">
                {WEEKDAYS.map((day) => {
                  const selected = draft.weekdays.includes(day.value);
                  return (
                    <button
                      key={`${day.label}-${day.value}`}
                      type="button"
                      aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.value]}
                      aria-pressed={selected}
                      onClick={() => onChange({ ...draft, weekdays: selected ? draft.weekdays.filter((value) => value !== day.value) : [...draft.weekdays, day.value] })}
                      className={cn('size-10 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45', selected ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'bg-[hsl(var(--surface-container-high))] text-muted-foreground hover:text-foreground')}
                    >{day.label}</button>
                  );
                })}
              </div>
            )}

            {draft.frequency === 'monthly' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={draft.monthlyMode} onValueChange={(value) => onChange({ ...draft, monthlyMode: value as Draft['monthlyMode'] })} items={monthlyItems}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="date">Day of month</SelectItem><SelectItem value="weekday">Weekday pattern</SelectItem></SelectContent>
                </Select>
                {draft.monthlyMode === 'date' ? (
                  <Input type="number" min={1} max={31} value={draft.monthDay} aria-label="Day of month" onChange={(event) => onChange({ ...draft, monthDay: Number(event.target.value) || 1 })} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={String(draft.ordinal)} onValueChange={(value) => onChange({ ...draft, ordinal: Number(value) })} items={[[-1, 'Last'], [1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [5, 'Fifth']].map(([value, label]) => ({ value: String(value), label: String(label) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[[-1, 'Last'], [1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [5, 'Fifth']].map(([value, label]) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(draft.weekday)} onValueChange={(value) => onChange({ ...draft, weekday: Number(value) })} items={WEEKDAYS.map((day) => ({ value: String(day.value), label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.value] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{WEEKDAYS.map((day) => <SelectItem key={day.value} value={String(day.value)}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.value]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={draft.endMode} onValueChange={(value) => onChange({ ...draft, endMode: value as Draft['endMode'] })} items={endItems}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="never">Never ends</SelectItem><SelectItem value="date">Ends on date</SelectItem><SelectItem value="count">Ends after count</SelectItem></SelectContent>
              </Select>
              {draft.endMode === 'date' && <Input type="date" value={draft.until} aria-label="Recurrence end date" onChange={(event) => onChange({ ...draft, until: event.target.value })} />}
              {draft.endMode === 'count' && <Input type="number" min={1} value={draft.count} aria-label="Number of occurrences" onChange={(event) => onChange({ ...draft, count: Number(event.target.value) || 1 })} />}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function minutesUntilTomorrowNine() {
  const target = addDays(startOfDay(new Date()), 1);
  target.setHours(9);
  return Math.max(1, Math.round((target.getTime() - Date.now()) / 60000));
}
