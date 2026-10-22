import { format, parseISO } from 'date-fns';

import { IntInput } from '@/components/ui/int-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ReminderRecurrence } from '@/types';

type Scope = 'day' | 'week' | 'month';
type Preset = 'none' | 'daily' | 'workdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const WORKDAYS = [1, 2, 3, 4, 5];
const same = (a: number[] = [], b: number[]) => a.length === b.length && b.every((d) => a.includes(d));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export const repeats = (rule?: ReminderRecurrence | null) => !!rule?.frequency;

/** "Daily", "Workdays", "Weekly · Mon, Thu", "Every 2 weeks", "Monthly". */
export function repeatLabel(rule?: ReminderRecurrence | null): string {
  if (!rule?.frequency) return '';
  const n = rule.interval ?? 1;
  switch (rule.frequency) {
    case 'daily':
      return n === 1 ? 'Daily' : `Every ${n} days`;
    case 'weekly': {
      if (n === 1 && same(rule.weekdays, WORKDAYS)) return 'Workdays';
      const days = rule.weekdays?.length
        ? ' · ' + WEEKDAYS.filter((d) => rule.weekdays!.includes(d)).map((d) => DAY_SHORT[d]).join(', ')
        : '';
      return (n === 1 ? 'Weekly' : `Every ${n} weeks`) + days;
    }
    case 'monthly':
      return n === 1 ? 'Monthly' : `Every ${n} months`;
    case 'yearly':
      return n === 1 ? 'Yearly' : `Every ${n} years`;
  }
}

function presetOf(rule: ReminderRecurrence, scope: Scope, date: Date): Preset {
  if (!rule.frequency) return 'none';
  const n = rule.interval ?? 1;
  if (scope === 'week') return rule.frequency === 'weekly' && n === 1 ? 'weekly' : 'custom';
  if (scope === 'month') return rule.frequency === 'monthly' && n === 1 ? 'monthly' : 'custom';
  if (n !== 1) return 'custom';
  if (rule.frequency === 'daily') return 'daily';
  if (rule.frequency === 'weekly' && same(rule.weekdays, WORKDAYS)) return 'workdays';
  if (rule.frequency === 'weekly' && same(rule.weekdays, [date.getDay()])) return 'weekly';
  if (rule.frequency === 'monthly' && (rule.monthly_mode ?? 'date') === 'date' && (rule.month_day ?? date.getDate()) === date.getDate()) return 'monthly';
  if (rule.frequency === 'yearly') return 'yearly';
  return 'custom';
}

function ruleOf(preset: Preset, scope: Scope, date: Date, current: ReminderRecurrence): ReminderRecurrence {
  switch (preset) {
    case 'none': return {};
    case 'daily': return { frequency: 'daily', interval: 1 };
    case 'workdays': return { frequency: 'weekly', interval: 1, weekdays: WORKDAYS };
    case 'weekly': return scope === 'day' ? { frequency: 'weekly', interval: 1, weekdays: [date.getDay()] } : { frequency: 'weekly', interval: 1 };
    case 'monthly': return scope === 'day' ? { frequency: 'monthly', interval: 1, monthly_mode: 'date', month_day: date.getDate() } : { frequency: 'monthly', interval: 1 };
    case 'yearly': return { frequency: 'yearly', interval: 1 };
    case 'custom': {
      if (current.frequency) return { ...current, interval: Math.max(2, current.interval ?? 1) };
      if (scope === 'week') return { frequency: 'weekly', interval: 2 };
      if (scope === 'month') return { frequency: 'monthly', interval: 2 };
      return { frequency: 'daily', interval: 2 };
    }
  }
}

/** The task editor's Repeat control. Day tasks take daily, workdays, weekly,
 *  monthly, yearly or every N; week tasks repeat weekly, month goals monthly.
 *  A task needs a date before it can repeat. */
export function RepeatPicker({ value, onChange, scope, date }: {
  value: ReminderRecurrence;
  onChange: (rule: ReminderRecurrence) => void;
  scope: Scope;
  /** The task's day, Monday or 1st (YYYY-MM-DD); '' when undated. */
  date: string;
}) {
  const anchor = date ? parseISO(date) : new Date();
  const preset = presetOf(value, scope, anchor);
  const options: { value: Preset; label: string }[] = scope === 'week'
    ? [{ value: 'none', label: "Doesn't repeat" }, { value: 'weekly', label: 'Every week' }, { value: 'custom', label: 'Every few weeks…' }]
    : scope === 'month'
    ? [{ value: 'none', label: "Doesn't repeat" }, { value: 'monthly', label: 'Every month' }, { value: 'custom', label: 'Every few months…' }]
    : [
        { value: 'none', label: "Doesn't repeat" },
        { value: 'daily', label: 'Daily' },
        { value: 'workdays', label: 'Workdays (Mon–Fri)' },
        { value: 'weekly', label: `Weekly on ${format(anchor, 'EEEE')}` },
        { value: 'monthly', label: `Monthly on the ${ordinal(anchor.getDate())}` },
        { value: 'yearly', label: `Yearly on ${format(anchor, 'MMM d')}` },
        { value: 'custom', label: 'Custom…' },
      ];
  const units = scope === 'week' ? [{ value: 'weekly', label: 'weeks' }]
    : scope === 'month' ? [{ value: 'monthly', label: 'months' }]
    : [{ value: 'daily', label: 'days' }, { value: 'weekly', label: 'weeks' }, { value: 'monthly', label: 'months' }];

  return (
    <div className="grid gap-2">
      <Select
        value={preset}
        disabled={!date}
        onValueChange={(v) => onChange(ruleOf(v as Preset, scope, anchor, value))}
        items={options}
      >
        <SelectTrigger aria-label="Repeat" title={date ? undefined : 'Give the task a date first'}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Every</span>
          <IntInput
            min={1}
            max={999}
            value={value.interval ?? 1}
            aria-label="Repeat every"
            className="w-20"
            onChange={(interval) => onChange({ ...value, interval })}
          />
          <Select
            value={value.frequency ?? 'daily'}
            onValueChange={(f) => onChange(f === 'weekly' && scope === 'day'
              ? { frequency: 'weekly', interval: value.interval ?? 1, weekdays: [anchor.getDay()] }
              : f === 'monthly' && scope === 'day'
              ? { frequency: 'monthly', interval: value.interval ?? 1, monthly_mode: 'date', month_day: anchor.getDate() }
              : { frequency: f as ReminderRecurrence['frequency'], interval: value.interval ?? 1 })}
            items={units}
          >
            <SelectTrigger className="w-32" aria-label="Repeat unit"><SelectValue /></SelectTrigger>
            <SelectContent>{units.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {scope === 'day' && value.frequency === 'weekly' && preset === 'custom' && (
        <div className="flex justify-between gap-1" aria-label="Repeat on">
          {WEEKDAYS.map((d) => {
            const on = value.weekdays?.includes(d) ?? false;
            return (
              <button
                key={d}
                type="button"
                aria-label={DAY_SHORT[d]}
                aria-pressed={on}
                onClick={() => {
                  const next = on ? (value.weekdays ?? []).filter((x) => x !== d) : [...(value.weekdays ?? []), d];
                  if (next.length) onChange({ ...value, weekdays: next });
                }}
                className={cn('size-9 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                  on ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'bg-[hsl(var(--surface-container-high))] text-muted-foreground hover:text-foreground')}
              >{DAY_SHORT[d][0]}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
