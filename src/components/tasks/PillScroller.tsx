import { useState } from 'react';
import { Sun, Star, Calendar, CalendarRange, Target, AlarmClock, CalendarX2, Inbox, ListTodo, Plus, MoreVertical, Pencil, Trash2 } from '@/components/ui/icons';

import type { TaskList, SmartList } from '@/types';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { SMART_LISTS, type Selection } from './helpers';
import { confirmDialog } from '@/lib/confirm';

const SMART_ICON: Record<SmartList, typeof Sun> = {
  my_day: Sun,
  important: Star,
  planned: Calendar,
  week: CalendarRange,
  month: Target,
  scheduled: AlarmClock,
  missed: CalendarX2,
  inbox: Inbox,
  all: ListTodo,
};

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

// PillScroller — horizontal swipeable row replacing the old vertical
// rail. Works identically on mobile and desktop, snaps cleanly, hides
// its scrollbar, and forwards vertical wheel scroll to horizontal so
// trackpad/mouse users can still pan with two fingers.
export default function PillScroller({ lists, selection, onSelect, onCreate, onRename, onDelete, smartCounts }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const submitRename = async (id: number) => {
    const name = editDraft.trim();
    if (name && onRename) await onRename(id, name);
    setEditingId(null);
    setEditDraft('');
  };

  const submitNew = async () => {
    const name = draft.trim();
    if (!name) { setAdding(false); setDraft(''); return; }
    await onCreate(name);
    setDraft('');
    setAdding(false);
  };

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto overflow-y-hidden py-1 -mx-1 px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
        }
      }}
    >
      {SMART_LISTS.map((s) => {
        const Icon = SMART_ICON[s.smart];
        const active = selection.kind === 'smart' && selection.smart === s.smart;
        const count = smartCounts?.[s.smart] ?? 0;
        // Missed is the one smart pill that flags a count, tinted as an alert
        // so a pile of overdue tasks reads at a glance.
        const isMissedAlert = s.smart === 'missed' && count > 0;
        return (
          <button
            key={s.smart}
            onClick={() => onSelect({ kind: 'smart', smart: s.smart })}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors
              ${active
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border border-transparent'
                : isMissedAlert
                  ? 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))] border border-transparent'
                  : 'bg-transparent text-foreground/85 border border-[hsl(var(--outline-variant))] hover:bg-[hsl(var(--on-surface)/0.08)]'}`}
            title={s.description}
          >
            <Icon className="size-4" /> {s.label}
            {count > 0 && (
              <span className={`text-xs tabular-nums rounded-full px-1.5 leading-[1.4] ${
                isMissedAlert && !active ? 'bg-[hsl(var(--error))] text-[hsl(var(--on-error))]' : 'bg-foreground/10'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      <span className="self-stretch w-px my-1.5 mx-1 bg-border/60 shrink-0" aria-hidden />

      {lists.map((l) => {
        const active = selection.kind === 'list' && selection.id === l.id;
        const isEditing = editingId === l.id;
        return (
          <div
            key={l.id}
            className={`group inline-flex items-center gap-1 h-9 pl-3.5 pr-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors
              ${active
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border border-transparent'
                : 'bg-transparent text-foreground/85 border border-[hsl(var(--outline-variant))] hover:bg-[hsl(var(--on-surface)/0.08)]'}`}
          >
            <span className="size-2 rounded-full shrink-0" style={{ background: l.color }} />
            {isEditing ? (
              <Input
                name={`rename-list-${l.id}`}
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={() => submitRename(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(l.id);
                  if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                }}
                className="h-6 w-24 border-0 border-b border-current bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-current focus-visible:shadow-none text-[12.5px]"
              />
            ) : (
              <button
                onClick={() => onSelect({ kind: 'list', id: l.id })}
                className="text-left"
              >
                {l.name}
              </button>
            )}
            {!isEditing && l.task_count > 0 && (
              <span className="text-xs tabular-nums opacity-70 ml-1">{l.task_count}</span>
            )}
            {!isEditing && (onRename || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 size-5 inline-flex items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-foreground/10"
                      title="List options"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="text-sm">
                  {onRename && (
                    <DropdownMenuItem onClick={() => { setEditingId(l.id); setEditDraft(l.name); }}>
                      <Pencil className="size-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        if (await confirmDialog(`Delete list "${l.name}"? Tasks inside move to Inbox.`)) onDelete(l.id);
                      }}
                    >
                      <Trash2 className="size-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="inline-flex items-center h-9 px-2 rounded-full border border-dashed border-border bg-background shrink-0">
          <Input
            name="new-list-name"
            autoFocus
            value={draft}
            placeholder="List name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
            className="h-6 w-28 text-[12px] bg-transparent border-0 shadow-none focus-visible:ring-0 px-1"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors"
        >
          <Plus className="size-3.5" /> New list
        </button>
      )}
    </div>
  );
}
