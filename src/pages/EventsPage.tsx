import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
} from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

import PageShell, { PageShellTabs } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calendar,
  Car,
  Clock,
  Coins,
  Edit3,
  Flame,
  Gift,
  Globe,
  Heart,
  Loader2,
  MapPin,
  Plus,
  Search,
  Scissors,
  Sparkles,
  Star,
  Target,
  Trash2,
  Wallet,
  X,
  Zap,
} from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TimePicker } from '@/components/ui/time-picker';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/utils';
import {
  useAddEventVariable,
  useCreateEvent,
  useCreateEventEntry,
  useDeleteEvent,
  useDeleteEventEntry,
  useDeleteEventVariable,
  useEvent,
  useEventEntries,
  useEvents,
  useEventTrends,
  useUpdateEvent,
  useUpdateEventEntry,
  useUpdateEventVariable,
} from '@/queries/events';
import type {
  TrackedEvent,
  TrackedEventEntry,
  TrackedEventTrendPoint,
} from '@/types';

const COLORS = ['#2D5A4F', '#4F6FA1', '#8B6FA1', '#A14B4F', '#C0783C', '#5E7C3A', '#7A7A7A'];
const ICONS = {
  calendar: Calendar,
  scissors: Scissors,
  briefcase: Briefcase,
  car: Car,
  heart: Heart,
  clock: Clock,
  activity: Activity,
  sparkle: Sparkles,
  target: Target,
  flame: Flame,
  star: Star,
  gift: Gift,
  wallet: Wallet,
  coins: Coins,
  book: BookOpen,
  place: MapPin,
  globe: Globe,
  zap: Zap,
} satisfies Record<string, ComponentType<{ className?: string }>>;

type SortMode = 'longest' | 'recent' | 'name';
type DetailView = 'timeline' | 'trends';

interface VariableDraft {
  id?: number;
  name: string;
  unit: string;
}

interface EventDraft {
  name: string;
  description: string;
  color: string;
  icon: string;
  variables: VariableDraft[];
}

const EMPTY_EVENT: EventDraft = {
  name: '',
  description: '',
  color: COLORS[0],
  icon: 'calendar',
  variables: [],
};

function EventGlyph({ event, className }: { event: Pick<TrackedEvent, 'icon' | 'color'>; className?: string }) {
  const Icon = ICONS[event.icon as keyof typeof ICONS] ?? Calendar;
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-[16px]',
        className,
      )}
      style={{ color: event.color, backgroundColor: `${event.color}20` }}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

function relativeTime(value: string | null) {
  if (!value) return 'Never logged';
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

function exactTime(value: string) {
  return format(new Date(value), 'EEE, d MMM yyyy · h:mm a');
}

function formatGap(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 6) / 10;
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 2.4) / 10;
  if (days < 60) return `${days}d`;
  const months = Math.round((days / 30.44) * 10) / 10;
  if (months < 24) return `${months}mo`;
  return `${Math.round((days / 365.25) * 10) / 10}y`;
}

function useRememberedSort() {
  const [sort, setSort] = useState<SortMode>(() => {
    try {
      const saved = localStorage.getItem('sajni:event-sort');
      return saved === 'recent' || saved === 'name' ? saved : 'longest';
    } catch {
      return 'longest';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('sajni:event-sort', sort); } catch {}
  }, [sort]);
  return [sort, setSort] as const;
}

export default function EventsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const eventId = Number(params.get('id') ?? 0);
  const detailView = params.get('view') === 'trends' ? 'trends' : 'timeline';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useRememberedSort();
  const [eventDialog, setEventDialog] = useState<TrackedEvent | 'new' | null>(null);
  const [entryDialog, setEntryDialog] = useState<{
    event: TrackedEvent;
    entry?: TrackedEventEntry;
  } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), search ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: events = [], isLoading } = useEvents({
    archived,
    search: debouncedSearch || undefined,
  });
  const { data: selectedEvent, isLoading: detailLoading, isError: detailError } = useEvent(eventId);

  const orderedEvents = useMemo(() => [...events].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    const aTime = a.last_occurred_at ? new Date(a.last_occurred_at).getTime() : 0;
    const bTime = b.last_occurred_at ? new Date(b.last_occurred_at).getTime() : 0;
    return sort === 'recent' ? bTime - aTime : aTime - bTime;
  }), [events, sort]);

  function openEvent(id: number) {
    const next = new URLSearchParams(params);
    next.set('tab', 'events');
    next.set('id', String(id));
    next.delete('view');
    setParams(next);
  }

  function closeEvent() {
    const next = new URLSearchParams(params);
    next.delete('id');
    next.delete('view');
    setParams(next);
  }

  function setDetailView(value: DetailView) {
    const next = new URLSearchParams(params);
    if (value === 'timeline') next.delete('view');
    else next.set('view', value);
    setParams(next, { replace: true });
  }

  const hubTabs = (
    <PageShellTabs
      bare
      ariaLabel="Habits sections"
      value="events"
      options={[
        { value: 'habits', label: 'Habits' },
        { value: 'events', label: 'Events' },
      ]}
      onChange={(value) => { if (value === 'habits') navigate('/habits'); }}
    />
  );

  if (eventId) {
    return (
      <PageShell
        title="Habits"
        navigation={hubTabs}
        leading={(
          <Button variant="ghost" size="icon-sm" onClick={closeEvent} aria-label="Back to events">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        actions={selectedEvent && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEventDialog(selectedEvent)}>
              <Edit3 className="size-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button size="sm" onClick={() => setEntryDialog({ event: selectedEvent })}>
              <Plus className="size-3.5" />
              Log
            </Button>
          </>
        )}
      >
        {detailLoading ? (
          <EventDetailSkeleton />
        ) : detailError || !selectedEvent ? (
          <div className="mx-auto w-full max-w-xl rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] px-6 py-16 text-center">
            <p className="font-medium">Event not found</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been deleted or is no longer available.</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={closeEvent}>Back to events</Button>
          </div>
        ) : (
          <EventDetail
            event={selectedEvent}
            view={detailView}
            onViewChange={setDetailView}
            onLog={() => setEntryDialog({ event: selectedEvent })}
            onEditEntry={(entry) => setEntryDialog({ event: selectedEvent, entry })}
          />
        )}
        <EventEditor
          value={eventDialog}
          onOpenChange={(open) => { if (!open) setEventDialog(null); }}
          onDeleted={closeEvent}
        />
        <EntryEditor
          value={entryDialog}
          onOpenChange={(open) => { if (!open) setEntryDialog(null); }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Habits"
      navigation={hubTabs}
      actions={(
        <Button size="sm" onClick={() => setEventDialog('new')}>
          <Plus className="size-3.5" />
          New event
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events"
              className="h-11 rounded-full pl-10 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select
            value={sort}
            onValueChange={(value) => setSort((value as SortMode) || 'longest')}
            items={[
              { value: 'longest', label: 'Longest since' },
              { value: 'recent', label: 'Most recent' },
              { value: 'name', label: 'Name' },
            ]}
          >
            <SelectTrigger className="h-11 w-full rounded-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="longest">Longest since</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={archived ? 'secondary' : 'outline'}
            className="h-11 rounded-full"
            onClick={() => setArchived((value) => !value)}
          >
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? 'Active' : 'Archived'}
          </Button>
        </div>

        {isLoading ? (
          <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))]">
            {[1, 2, 3].map((row) => <Skeleton key={row} className="h-24 w-full rounded-none border-b last:border-0" />)}
          </div>
        ) : orderedEvents.length === 0 ? (
          <EmptyEvents search={search} archived={archived} onCreate={() => setEventDialog('new')} />
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))]">
            <AnimatePresence initial={false}>
              {orderedEvents.map((event) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex min-h-24 items-center gap-3 border-b border-[hsl(var(--outline-variant))] px-3 py-3 last:border-b-0 sm:px-5"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openEvent(event.id)}
                  >
                    <EventGlyph event={event} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{event.name}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {event.last_occurred_at ? format(new Date(event.last_occurred_at), 'd MMM yyyy · h:mm a') : event.description || 'No entries yet'}
                      </span>
                      {event.last_values.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {event.last_values.map((value) => (
                            <span key={value.variable_id}>{value.name}: {value.value}{value.unit ? ` ${value.unit}` : ''}</span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-sm font-medium text-[hsl(var(--primary))]">{relativeTime(event.last_occurred_at)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {event.total_entries} {event.total_entries === 1 ? 'entry' : 'entries'}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 rounded-full"
                    onClick={() => setEntryDialog({ event })}
                  >
                    <Plus className="size-3.5" />
                    <span className="hidden sm:inline">Log</span>
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <EventEditor
        value={eventDialog}
        onOpenChange={(open) => { if (!open) setEventDialog(null); }}
      />
      <EntryEditor
        value={entryDialog}
        onOpenChange={(open) => { if (!open) setEntryDialog(null); }}
      />
    </PageShell>
  );
}

function EmptyEvents({
  search,
  archived,
  onCreate,
}: {
  search: string;
  archived: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] px-6 py-20 text-center">
      <Clock className="mx-auto size-10 text-[hsl(var(--primary))] opacity-60" />
      <p className="mt-4 font-medium">
        {search ? 'No matching events' : archived ? 'No archived events' : 'Remember when it happened'}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {search
          ? 'Try another name or description.'
          : archived
            ? 'Archived events will stay here with their full history.'
            : 'Track haircuts, leave, maintenance, or anything worth measuring by time.'}
      </p>
      {!search && !archived && (
        <Button className="mt-5 rounded-full" onClick={onCreate}>
          <Plus className="size-4" />
          Create your first event
        </Button>
      )}
    </div>
  );
}

function EventDetail({
  event,
  view,
  onViewChange,
  onLog,
  onEditEntry,
}: {
  event: TrackedEvent;
  view: DetailView;
  onViewChange: (view: DetailView) => void;
  onLog: () => void;
  onEditEntry: (entry: TrackedEventEntry) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <section className="relative overflow-hidden rounded-[32px] bg-[hsl(var(--primary-container))] px-5 py-6 text-[hsl(var(--on-primary-container))] sm:px-8 sm:py-8">
        <div
          aria-hidden
          className="absolute -right-12 -top-12 size-44 rounded-full opacity-15"
          style={{ backgroundColor: event.color }}
        />
        <div className="relative flex items-start gap-4">
          <EventGlyph event={event} className="size-14 rounded-[20px] bg-[hsl(var(--surface)/0.75)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">Last happened</p>
            <h1 className="serif mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {relativeTime(event.last_occurred_at)}
            </h1>
            <p className="mt-2 text-sm opacity-75">
              {event.last_occurred_at ? exactTime(event.last_occurred_at) : 'Log the first occurrence when it happens.'}
            </p>
          </div>
        </div>
        <div className="relative mt-7 flex flex-col gap-3 border-t border-current/15 pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{event.name}</h2>
            {event.description && <p className="mt-1 max-w-2xl text-sm opacity-75">{event.description}</p>}
          </div>
          {event.last_values.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.last_values.map((value) => (
                <span key={value.variable_id} className="rounded-full bg-[hsl(var(--surface)/0.7)] px-3 py-1.5 text-xs font-medium">
                  {value.name} · {value.value}{value.unit ? ` ${value.unit}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-center">
        <PageShellTabs
          ariaLabel="Event detail"
          value={view}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'trends', label: 'Trends' },
          ]}
          onChange={onViewChange}
        />
      </div>

      {view === 'timeline'
        ? <EventTimeline event={event} onLog={onLog} onEdit={onEditEntry} />
        : <EventTrends event={event} />}
    </div>
  );
}

function EventTimeline({
  event,
  onLog,
  onEdit,
}: {
  event: TrackedEvent;
  onLog: () => void;
  onEdit: (entry: TrackedEventEntry) => void;
}) {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const reduceMotion = useReducedMotion();
  const { data, isLoading } = useEventEntries(event.id, {
    search: search.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 100,
  });
  const entries = data?.entries ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(entry) => setSearch(entry.target.value)}
            placeholder="Search notes"
            className="h-11 rounded-full pl-10"
          />
        </div>
        <DatePicker value={from} onChange={setFrom} placeholder="From date" className="rounded-full" />
        <DatePicker value={to} onChange={setTo} placeholder="To date" className="rounded-full" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-[24px]" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[hsl(var(--outline))] px-5 py-14 text-center">
          <p className="font-medium">{search || from || to ? 'No entries in this view' : 'No entries yet'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || from || to ? 'Clear a filter to widen the timeline.' : 'Your first log starts the elapsed-time spine.'}
          </p>
          {!search && !from && !to && (
            <Button onClick={onLog} className="mt-4 rounded-full">
              <Plus className="size-4" /> Log now
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <span className="absolute bottom-7 left-[19px] top-7 w-px bg-[hsl(var(--outline-variant))] sm:left-[27px]" aria-hidden />
          <div className="flex flex-col">
            {entries.map((entry, index) => {
              const older = entries[index + 1];
              const gap = older
                ? differenceInMinutes(new Date(entry.occurred_at), new Date(older.occurred_at))
                : null;
              return (
                <motion.div
                  key={entry.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.025, 0.2) }}
                  className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-5 sm:grid-cols-[56px_minmax(0,1fr)]"
                >
                  <div className="relative z-10 flex justify-center pt-5">
                    <span
                      className="size-3 rounded-full border-[3px] border-background"
                      style={{ backgroundColor: event.color, boxShadow: `0 0 0 1px ${event.color}` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(entry)}
                    className="rounded-[24px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] px-4 py-4 text-left outline-none transition-colors hover:bg-[hsl(var(--surface-container))] focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
                  >
                    <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <span className="font-medium">{format(new Date(entry.occurred_at), 'EEEE, d MMMM yyyy')}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(entry.occurred_at), 'h:mm a')}</span>
                    </span>
                    {entry.note && <span className="mt-2 block text-sm leading-6 text-muted-foreground">{entry.note}</span>}
                    {entry.values.length > 0 && (
                      <span className="mt-3 flex flex-wrap gap-2">
                        {entry.values.map((value) => (
                          <span key={value.variable_id} className="rounded-full bg-[hsl(var(--secondary-container))] px-2.5 py-1 text-xs text-[hsl(var(--on-secondary-container))]">
                            {value.name}: {value.value}{value.unit ? ` ${value.unit}` : ''}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  {gap != null && (
                    <span className="col-start-2 -mt-2 mb-1 text-xs font-medium text-[hsl(var(--primary))]">
                      {formatGap(gap)} since previous
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
          {data?.next_cursor && (
            <p className="pl-[52px] text-xs text-muted-foreground sm:pl-[68px]">
              Showing the latest 100 matching entries.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function EventTrends({ event }: { event: TrackedEvent }) {
  const { data, isLoading } = useEventTrends(event.id);
  const [variableId, setVariableId] = useState('');

  useEffect(() => {
    if (!event.variables.some((item) => String(item.id) === variableId)) {
      setVariableId(event.variables[0] ? String(event.variables[0].id) : '');
    }
  }, [event.variables, variableId]);

  if (isLoading || !data) {
    return <Skeleton className="h-80 rounded-[28px]" />;
  }

  const gapPoints = data.points
    .filter((point): point is TrackedEventTrendPoint & { gap_days: number } => point.gap_days != null)
    .map((point) => ({ at: point.occurred_at, value: point.gap_days }));
  const variable = event.variables.find((item) => String(item.id) === variableId);
  const variablePoints = data.points
    .filter((point) => point.values[variableId] != null)
    .map((point) => ({ at: point.occurred_at, value: point.values[variableId] }));

  return (
    <section className="flex flex-col gap-4">
      <div className="grid overflow-hidden rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] sm:grid-cols-3">
        <Stat label="Last occurrence" value={data.last_occurred_at ? relativeTime(data.last_occurred_at) : 'Never'} />
        <Stat label="Total entries" value={String(data.total_entries)} />
        <Stat
          label="Average interval"
          value={data.average_gap_days == null ? 'Not enough data' : `${data.average_gap_days} days`}
        />
      </div>
      <TrendPanel
        title="Time between occurrences"
        subtitle="Days between each entry"
        points={gapPoints}
        suffix="d"
        color={event.color}
      />
      {event.variables.length > 0 && (
        <div className="rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold">Recorded variable</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">How a measurement changes over time</p>
            </div>
            <Select
              value={variableId}
              onValueChange={(value) => setVariableId(value ?? '')}
              items={event.variables.map((item) => ({ value: String(item.id), label: item.name }))}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {event.variables.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LineChart points={variablePoints} suffix={variable?.unit ?? ''} color={event.color} />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[hsl(var(--outline-variant))] px-5 py-5 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function TrendPanel({
  title,
  subtitle,
  points,
  suffix,
  color,
}: {
  title: string;
  subtitle: string;
  points: Array<{ at: string; value: number }>;
  suffix: string;
  color: string;
}) {
  return (
    <div className="rounded-[28px] border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] p-4 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-0.5 mb-5 text-sm text-muted-foreground">{subtitle}</p>
      <LineChart points={points} suffix={suffix} color={color} />
    </div>
  );
}

function LineChart({
  points,
  suffix,
  color,
}: {
  points: Array<{ at: string; value: number }>;
  suffix: string;
  color: string;
}) {
  if (points.length < 2) {
    return (
      <div className="grid h-44 place-items-center rounded-[20px] bg-[hsl(var(--surface-container))] px-4 text-center text-sm text-muted-foreground">
        Log at least two comparable values to draw this trend.
      </div>
    );
  }
  const width = 720;
  const height = 210;
  const pad = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((point, index) => ({
    x: pad + (index / (points.length - 1)) * (width - pad * 2),
    y: pad + ((max - point.value) / range) * (height - pad * 2),
    ...point,
  }));
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full overflow-visible"
        role="img"
        aria-label={`Trend from ${values[0]}${suffix} to ${values.at(-1)}${suffix}`}
      >
        {[0, 1, 2].map((line) => {
          const y = pad + (line / 2) * (height - pad * 2);
          return <line key={line} x1={pad} y1={y} x2={width - pad} y2={y} stroke="hsl(var(--outline-variant))" strokeDasharray="4 6" />;
        })}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((point) => (
          <g key={`${point.at}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="6" fill="hsl(var(--surface-container-low))" stroke={color} strokeWidth="3" />
            <title>{format(new Date(point.at), 'd MMM yyyy')}: {point.value}{suffix ? ` ${suffix}` : ''}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{format(new Date(points[0].at), 'd MMM yyyy')}</span>
        <span>{format(new Date(points.at(-1)!.at), 'd MMM yyyy')}</span>
      </div>
    </div>
  );
}

function EventEditor({
  value,
  onOpenChange,
  onDeleted,
}: {
  value: TrackedEvent | 'new' | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const editing = value !== null && value !== 'new' ? value : null;
  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const addVariable = useAddEventVariable();
  const updateVariable = useUpdateEventVariable();
  const deleteVariable = useDeleteEventVariable();

  useEffect(() => {
    if (value === 'new') setDraft({ ...EMPTY_EVENT, variables: [] });
    else if (value) {
      setDraft({
        name: value.name,
        description: value.description,
        color: value.color,
        icon: value.icon,
        variables: value.variables.map((variable) => ({
          id: variable.id,
          name: variable.name,
          unit: variable.unit,
        })),
      });
    }
  }, [value]);

  async function save() {
    if (!draft.name.trim()) return;
    const cleanVariables = draft.variables
      .map((variable) => ({ ...variable, name: variable.name.trim(), unit: variable.unit.trim() }))
      .filter((variable) => variable.name);
    setSaving(true);
    try {
      if (!editing) {
        await createEvent.mutateAsync({
          name: draft.name.trim(),
          description: draft.description.trim(),
          color: draft.color,
          icon: draft.icon,
          variables: cleanVariables.map(({ name, unit }) => ({ name, unit })),
        });
      } else {
        await updateEvent.mutateAsync({
          id: editing.id,
          data: {
            name: draft.name.trim(),
            description: draft.description.trim(),
            color: draft.color,
            icon: draft.icon,
          },
        });
        for (const variable of cleanVariables) {
          if (variable.id) {
            const original = editing.variables.find((item) => item.id === variable.id);
            if (original && (original.name !== variable.name || original.unit !== variable.unit)) {
              await updateVariable.mutateAsync({
                eventId: editing.id,
                variableId: variable.id,
                data: { name: variable.name, unit: variable.unit },
              });
            }
          } else {
            await addVariable.mutateAsync({
              eventId: editing.id,
              data: { name: variable.name, unit: variable.unit },
            });
          }
        }
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeVariable(variable: VariableDraft, index: number) {
    if (variable.id && editing) {
      const confirmed = await confirmDialog({
        title: 'Delete this variable?',
        description: `All historical "${variable.name}" values will be permanently deleted. Event entries remain.`,
        confirmText: 'Delete variable',
      });
      if (!confirmed) return;
      await deleteVariable.mutateAsync({ eventId: editing.id, variableId: variable.id });
    }
    setDraft((current) => ({
      ...current,
      variables: current.variables.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function archive() {
    if (!editing) return;
    await updateEvent.mutateAsync({ id: editing.id, data: { archived: !editing.archived } });
    onOpenChange(false);
    onDeleted?.();
  }

  async function removeEvent() {
    if (!editing) return;
    const confirmed = await confirmDialog({
      title: `Delete "${editing.name}"?`,
      description: 'The event, its variables, and every timeline entry will be permanently deleted.',
      confirmText: 'Delete event',
    });
    if (!confirmed) return;
    await deleteEvent.mutateAsync(editing.id);
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog open={value !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">Name</Label>
            <Input
              id="event-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. Haircut"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-description">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="event-description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="What does this event track?"
              className="min-h-20"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDraft({ ...draft, color })}
                    aria-label={`Use color ${color}`}
                    aria-pressed={draft.color === color}
                    className={cn(
                      'size-9 rounded-[12px] border-[3px] border-transparent outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring',
                      draft.color === color && 'scale-110 border-background ring-2 ring-ring',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
                {Object.entries(ICONS).map(([name, Icon]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon: name })}
                    aria-label={`Use ${name} icon`}
                    aria-pressed={draft.icon === name}
                    className={cn(
                      'grid size-10 place-items-center rounded-[14px] text-muted-foreground outline-none hover:bg-[hsl(var(--on-surface)/0.08)] focus-visible:ring-2 focus-visible:ring-ring',
                      draft.icon === name && 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Variables</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Optional numbers recorded with each occurrence. Up to 6.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={draft.variables.length >= 6}
                onClick={() => setDraft({
                  ...draft,
                  variables: [...draft.variables, { name: '', unit: '' }],
                })}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            {draft.variables.map((variable, index) => (
              <div key={variable.id ?? `new-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.55fr)_40px] gap-2">
                <Input
                  value={variable.name}
                  onChange={(event) => setDraft({
                    ...draft,
                    variables: draft.variables.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item),
                  })}
                  placeholder="Cost, size…"
                  aria-label={`Variable ${index + 1} name`}
                />
                <Input
                  value={variable.unit}
                  onChange={(event) => setDraft({
                    ...draft,
                    variables: draft.variables.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, unit: event.target.value } : item),
                  })}
                  placeholder="₹, mm…"
                  aria-label={`Variable ${index + 1} unit`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVariable(variable, index)}
                  aria-label={`Remove ${variable.name || 'variable'}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          {editing && (
            <div className="mr-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={archive}>
                {editing.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {editing.archived ? 'Restore' : 'Archive'}
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={removeEvent} aria-label="Delete event">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!draft.name.trim() || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function localDateTimeParts(value?: string) {
  const date = value ? new Date(value) : new Date();
  return {
    date: format(date, 'yyyy-MM-dd'),
    time: format(date, 'HH:mm'),
  };
}

function combineLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function EntryEditor({
  value,
  onOpenChange,
}: {
  value: { event: TrackedEvent; entry?: TrackedEventEntry } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const event = value?.event;
  const entry = value?.entry;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const createEntry = useCreateEventEntry();
  const updateEntry = useUpdateEventEntry();
  const deleteEntry = useDeleteEventEntry();

  useEffect(() => {
    if (!value) return;
    const parts = localDateTimeParts(entry?.occurred_at);
    setDate(parts.date);
    setTime(parts.time);
    setNote(entry?.note ?? '');
    setValues(Object.fromEntries((entry?.values ?? []).map((item) => [String(item.variable_id), String(item.value)])));
  }, [entry, value]);

  async function save() {
    if (!event || !date || !time) return;
    const data = {
      occurred_at: combineLocalDateTime(date, time),
      note: note.trim(),
      values: event.variables.flatMap((variable) => {
        const raw = values[String(variable.id)]?.trim();
        if (!raw) return [];
        const number = Number(raw);
        return Number.isFinite(number) ? [{ variable_id: variable.id, value: number }] : [];
      }),
    };
    setSaving(true);
    try {
      if (entry) {
        await updateEntry.mutateAsync({ eventId: event.id, entryId: entry.id, data });
      } else {
        await createEntry.mutateAsync({ eventId: event.id, data });
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event || !entry) return;
    if (!(await confirmDialog({
      title: 'Delete this occurrence?',
      description: `${exactTime(entry.occurred_at)} will be removed from the timeline.`,
      confirmText: 'Delete entry',
    }))) return;
    await deleteEntry.mutateAsync({ eventId: event.id, entryId: entry.id });
    onOpenChange(false);
  }

  return (
    <Dialog open={value !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{entry ? `Edit ${event?.name ?? 'entry'}` : `Log ${event?.name ?? 'event'}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <TimePicker value={time} onChange={setTime} />
            </div>
          </div>
          {(event?.variables.length ?? 0) > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {event?.variables.map((variable) => (
                <div key={variable.id} className="space-y-1.5">
                  <Label htmlFor={`event-variable-${variable.id}`}>{variable.name}</Label>
                  <div className="relative">
                    <Input
                      id={`event-variable-${variable.id}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={values[String(variable.id)] ?? ''}
                      onChange={(input) => setValues({
                        ...values,
                        [String(variable.id)]: input.target.value,
                      })}
                      className={variable.unit ? 'pr-12' : undefined}
                      placeholder="Optional"
                    />
                    {variable.unit && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {variable.unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="event-entry-note">Note <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="event-entry-note"
              value={note}
              onChange={(input) => setNote(input.target.value)}
              placeholder="Anything worth remembering?"
              className="min-h-24"
            />
          </div>
        </div>
        <DialogFooter>
          {entry && (
            <Button variant="destructive" onClick={remove} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !date || !time}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {entry ? 'Save' : 'Log event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Skeleton className="h-60 rounded-[32px]" />
      <Skeleton className="mx-auto h-12 w-52 rounded-full" />
      {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-[24px]" />)}
    </div>
  );
}
