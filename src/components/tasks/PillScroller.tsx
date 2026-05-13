import { useState } from 'react';
import { Sun, Star, Calendar, Inbox, ListTodo, Plus } from 'lucide-react';

import type { TaskList, SmartList } from '@/types';
import { Input } from '@/components/ui/input';
import { SMART_LISTS, type Selection } from './helpers';

const SMART_ICON: Record<SmartList, typeof Sun> = {
  my_day: Sun,
  important: Star,
  planned: Calendar,
  inbox: Inbox,
  all: ListTodo,
};

interface Props {
  lists: TaskList[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onCreate: (name: string) => Promise<void>;
}

// PillScroller — horizontal swipeable row replacing the old vertical
// rail. Works identically on mobile and desktop, snaps cleanly, hides
// its scrollbar, and forwards vertical wheel scroll to horizontal so
// trackpad/mouse users can still pan with two fingers.
export default function PillScroller({ lists, selection, onSelect, onCreate }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

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
        return (
          <button
            key={s.smart}
            onClick={() => onSelect({ kind: 'smart', smart: s.smart })}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap shrink-0 transition-colors
              ${active
                ? 'bg-primary/15 text-primary border border-primary/40'
                : 'bg-muted/40 text-foreground/85 border border-border/60 hover:bg-muted/80'}`}
            title={s.description}
          >
            <Icon className="size-3.5" /> {s.label}
          </button>
        );
      })}

      <span className="self-stretch w-px my-1.5 mx-1 bg-border/60 shrink-0" aria-hidden />

      {lists.map((l) => {
        const active = selection.kind === 'list' && selection.id === l.id;
        return (
          <button
            key={l.id}
            onClick={() => onSelect({ kind: 'list', id: l.id })}
            className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap shrink-0 transition-colors
              ${active
                ? 'bg-primary/15 text-primary border border-primary/40'
                : 'bg-muted/40 text-foreground/85 border border-border/60 hover:bg-muted/80'}`}
          >
            <span className="size-2 rounded-full shrink-0" style={{ background: l.color }} />
            {l.name}
            {l.task_count > 0 && (
              <span className="mono text-[10px] text-muted-foreground">{l.task_count}</span>
            )}
          </button>
        );
      })}

      {adding ? (
        <div className="inline-flex items-center h-8 px-2 rounded-full border border-dashed border-border bg-background/60 shrink-0">
          <Input
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
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap shrink-0 border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Plus className="size-3.5" /> New list
        </button>
      )}
    </div>
  );
}
