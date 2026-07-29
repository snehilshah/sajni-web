import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

import type { HabitFrequency } from '@/types';

const WEEKLY_EPOCH = new Date(1970, 0, 5);
const FORTNIGHT_EPOCH = new Date(1970, 0, 12);
const PERIODS_PER_WINDOW = 12;

export interface HabitPeriod {
  key: string;
  start: Date;
  end: Date;
  label: string;
  group: string;
  accessibleLabel: string;
}

export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function habitPeriodForDate(date: Date, frequency: HabitFrequency): HabitPeriod {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let start = normalized;
  let end = normalized;

  if (frequency === 'weekly') {
    start = startOfWeek(normalized, { weekStartsOn: 1 });
    end = addDays(start, 6);
  } else if (frequency === 'fortnightly') {
    const monday = startOfWeek(normalized, { weekStartsOn: 1 });
    const weeks = differenceInCalendarDays(monday, FORTNIGHT_EPOCH) / 7;
    start = Math.abs(weeks % 2) === 1 ? addDays(monday, -7) : monday;
    end = addDays(start, 13);
  } else if (frequency === 'monthly') {
    start = startOfMonth(normalized);
    end = endOfMonth(normalized);
  }

  return makePeriod(start, end, frequency);
}

export function completedPeriodKeys(logDates: string[], frequency: HabitFrequency): Set<string> {
  return new Set(logDates.map((value) => habitPeriodForDate(parseISO(value), frequency).key));
}

export function periodIsComplete(logDates: string[], period: HabitPeriod): boolean {
  return logDates.some((date) => date >= dateKey(period.start) && date <= dateKey(period.end));
}

export function dailyPeriods(anchor: Date, weekOffset = 0): HabitPeriod[] {
  const monday = addDays(startOfWeek(anchor, { weekStartsOn: 1 }), weekOffset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    return makePeriod(date, date, 'daily');
  });
}

export function weeklyPeriods(anchor: Date, windowOffset = 0): HabitPeriod[] {
  const currentStart = habitPeriodForDate(anchor, 'weekly').start;
  const currentIndex = Math.floor(
    differenceInCalendarDays(currentStart, WEEKLY_EPOCH) / 7,
  );
  const pageIndex = Math.floor(currentIndex / PERIODS_PER_WINDOW) + windowOffset;
  const firstStart = addDays(WEEKLY_EPOCH, pageIndex * PERIODS_PER_WINDOW * 7);

  return Array.from({ length: PERIODS_PER_WINDOW }, (_, index) => {
    const start = addDays(firstStart, index * 7);
    return makePeriod(start, addDays(start, 6), 'weekly');
  });
}

export function fortnightlyPeriods(anchor: Date, windowOffset = 0): HabitPeriod[] {
  const currentStart = habitPeriodForDate(anchor, 'fortnightly').start;
  const currentIndex = Math.floor(
    differenceInCalendarDays(currentStart, FORTNIGHT_EPOCH) / 14,
  );
  const pageIndex = Math.floor(currentIndex / PERIODS_PER_WINDOW) + windowOffset;
  const firstStart = addDays(FORTNIGHT_EPOCH, pageIndex * PERIODS_PER_WINDOW * 14);

  return Array.from({ length: PERIODS_PER_WINDOW }, (_, index) => {
    const start = addDays(firstStart, index * 14);
    return makePeriod(start, addDays(start, 13), 'fortnightly');
  });
}

export function monthlyPeriods(anchor: Date, yearOffset = 0): HabitPeriod[] {
  const yearStart = addYears(startOfYear(anchor), yearOffset);
  return Array.from({ length: 12 }, (_, index) => {
    const start = addMonths(yearStart, index);
    return makePeriod(start, endOfMonth(start), 'monthly');
  });
}

export function visiblePeriodRange(periodGroups: HabitPeriod[][]): { from: string; to: string } {
  const periods = periodGroups.flat();
  if (periods.length === 0) return { from: '', to: '' };
  const starts = periods.map((period) => period.start.getTime());
  const ends = periods.map((period) => period.end.getTime());
  return {
    from: dateKey(new Date(Math.min(...starts))),
    to: dateKey(new Date(Math.max(...ends))),
  };
}

export function periodWindowTitle(
  frequency: HabitFrequency,
  anchor: Date,
  offset: number,
): string {
  if (frequency === 'daily') {
    const periods = dailyPeriods(anchor, offset);
    return `${format(periods[0].start, 'MMM d')} – ${format(periods[6].start, 'MMM d')}`;
  }
  if (frequency === 'monthly') {
    return format(addYears(anchor, offset), 'yyyy');
  }
  const periods = frequency === 'weekly'
    ? weeklyPeriods(anchor, offset)
    : fortnightlyPeriods(anchor, offset);
  const firstOwner = weekOwner(periods[0].start);
  const lastOwner = weekOwner(periods.at(-1)!.start);
  if (firstOwner.getFullYear() !== lastOwner.getFullYear()) {
    return `${format(firstOwner, 'MMM yyyy').toUpperCase()}–${format(lastOwner, 'MMM yyyy').toUpperCase()}`;
  }
  if (firstOwner.getMonth() === lastOwner.getMonth()) {
    return format(firstOwner, 'MMM yyyy').toUpperCase();
  }
  return `${format(firstOwner, 'MMM').toUpperCase()}–${format(lastOwner, 'MMM yyyy').toUpperCase()}`;
}

export function periodWindowEnd(frequency: HabitFrequency, anchor: Date, offset: number): Date {
  if (frequency === 'daily') return dailyPeriods(anchor, offset).at(-1)!.end;
  if (frequency === 'monthly') return endOfYear(addYears(anchor, offset));
  const periods = frequency === 'weekly'
    ? weeklyPeriods(anchor, offset)
    : fortnightlyPeriods(anchor, offset);
  return periods.at(-1)!.end;
}

function makePeriod(start: Date, end: Date, frequency: HabitFrequency): HabitPeriod {
  const key = dateKey(start);
  if (frequency === 'daily') {
    return {
      key, start, end,
      label: format(start, 'EEEEE'),
      group: format(start, 'MMM').toUpperCase(),
      accessibleLabel: format(start, 'EEEE, MMMM d, yyyy'),
    };
  }
  if (frequency === 'monthly') {
    return {
      key, start, end,
      label: format(start, 'MMM').toUpperCase(),
      group: format(start, 'yyyy'),
      accessibleLabel: format(start, 'MMMM yyyy'),
    };
  }

  const owner = weekOwner(start);
  const weekNumber = Math.ceil(owner.getDate() / 7);
  const group = format(owner, 'MMM').toUpperCase();
  const range = `${format(start, 'MMM d')}–${format(end, 'MMM d, yyyy')}`;
  return {
    key, start, end,
    label: `W${weekNumber}`,
    group,
    accessibleLabel: frequency === 'fortnightly'
      ? `${format(owner, 'MMMM')} week ${weekNumber}, fortnight ${range}`
      : `${format(owner, 'MMMM')} week ${weekNumber}, ${range}`,
  };
}

function weekOwner(monday: Date): Date {
  return addDays(monday, 3);
}
