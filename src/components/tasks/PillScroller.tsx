import { HuePill } from '@/components/ui/hue-pill';
import {
  ListChecks, Sun, Star, CalendarDays, CalendarRange,
  Calendar, AlarmClock, Ban, CalendarClock, Inbox, type LucideIcon,
} from '@/components/ui/icons';

import type { TaskList, SmartList } from '@/types';
import { SMART_LISTS, SMART_LIST_HUES, type Selection } from './helpers';
import ListPicker from './ListPicker';


interface Props {
  lists: TaskList[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onCreate: (name: string) => Promise<void>;
  onRename?: (id: number, name: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  /** Live counts for smart pills (only Missed renders one today). */
  smartCounts?: Partial<Record<SmartList, number>>;
}

const SMART_ICONS: Record<SmartList, LucideIcon> = {
  all: ListChecks, my_day: Sun, important: Star, planned: CalendarDays, week: CalendarRange,
  month: Calendar, scheduled: AlarmClock, blocked: Ban, missed: CalendarClock, inbox: Inbox,
};

// PillScroller — the list picker chip pinned on the leading edge (every user
// list, searchable, never scrolled out of reach), then the smart lists as a
// horizontal swipeable row that hides its scrollbar and forwards vertical
// wheel scroll to horizontal so trackpad/mouse users can still pan.
export default function PillScroller({ lists, selection, onSelect, onCreate, onRename, onDelete, smartCounts }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ListPicker
        lists={lists}
        selectedId={selection.kind === 'list' ? selection.id : null}
        onSelect={(id) => onSelect({ kind: 'list', id })}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
      />
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
          }
        }}
      >
        {SMART_LISTS.map((s) => {
          const active = selection.kind === 'smart' && selection.smart === s.smart;
          const count = smartCounts?.[s.smart] ?? 0;
          const Icon = SMART_ICONS[s.smart];
          const hue = SMART_LIST_HUES[s.smart]
            ?? (s.smart === 'missed' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))');
          return (
            <HuePill
              key={s.smart}
              icon={Icon}
              hue={hue}
              selected={active}
              count={count}
              title={s.description}
              onClick={() => onSelect({ kind: 'smart', smart: s.smart })}
            >
              {s.label}
            </HuePill>
          );
        })}
      </div>
    </div>
  );
}
