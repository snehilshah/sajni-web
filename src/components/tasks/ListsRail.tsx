import { useState } from 'react';
import {
  Sun, Star, Calendar, AlarmClock, Inbox, ListTodo, Plus, MoreVertical, Trash2, Pencil,
} from 'lucide-react';

import type { TaskList, SmartList } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { SMART_LISTS, type Selection } from './helpers';

const SMART_ICON: Record<SmartList, typeof Sun> = {
  my_day: Sun,
  important: Star,
  planned: Calendar,
  scheduled: AlarmClock,
  inbox: Inbox,
  all: ListTodo,
};

interface Props {
  lists: TaskList[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  smartCounts?: Partial<Record<SmartList, number>>;
}

export default function ListsRail({
  lists, selection, onSelect, onCreate, onRename, onDelete, smartCounts,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const submitNew = async () => {
    const name = draft.trim();
    if (!name) { setAdding(false); setDraft(''); return; }
    await onCreate(name);
    setDraft('');
    setAdding(false);
  };

  const submitRename = async (id: number) => {
    const name = editDraft.trim();
    if (name) await onRename(id, name);
    setEditingId(null);
    setEditDraft('');
  };

  return (
    <aside className="w-52 shrink-0 hidden md:block">
      <nav className="rounded-lg border border-border bg-card/40 p-2 flex flex-col gap-0.5 sticky top-6">
        <div className="px-2.5 pb-1.5 mono text-[9px] uppercase tracking-widest text-muted-foreground">Smart</div>
        {SMART_LISTS.map((s) => {
          const Icon = SMART_ICON[s.smart];
          const active = selection.kind === 'smart' && selection.smart === s.smart;
          const count = smartCounts?.[s.smart];
          return (
            <button
              key={s.smart}
              onClick={() => onSelect({ kind: 'smart', smart: s.smart })}
              className={`flex items-center gap-2.5 h-8 px-2.5 rounded-md text-sm text-left
                ${active
                  ? 'bg-primary/12 text-primary font-semibold'
                  : 'text-foreground/80 hover:bg-foreground/5'}`}
              title={s.description}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span className="mono text-[10px] px-1 rounded bg-muted text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <div className="my-2 border-t border-border/60" />

        <div className="px-2.5 pb-1.5 mono text-[9px] uppercase tracking-widest text-muted-foreground">Lists</div>

        {lists.map((l) => {
          const active = selection.kind === 'list' && selection.id === l.id;
          const isEditing = editingId === l.id;
          return (
            <div
              key={l.id}
              className={`group flex items-center gap-2 h-8 px-2.5 rounded-md text-sm
                ${active
                  ? 'bg-primary/12 text-primary font-semibold'
                  : 'text-foreground/80 hover:bg-foreground/5'}`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: l.color }}
              />
              {isEditing ? (
                <Input
                  name={`rail-rename-list-${l.id}`}
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => submitRename(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(l.id);
                    if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                  }}
                  className="h-6 flex-1 border-0 border-b border-current bg-transparent px-1 py-0 shadow-none outline-none focus-visible:border-current focus-visible:shadow-none text-sm relative z-10 min-w-0"
                />
              ) : (
                <button
                  onClick={() => onSelect({ kind: 'list', id: l.id })}
                  className="flex-1 text-left truncate relative z-10 min-w-0"
                >
                  {l.name}
                </button>
              )}
              {!isEditing && l.task_count > 0 && (
                <span className={`font-mono text-[10px] px-1 rounded relative z-10 ${active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'}`}>
                  {l.task_count}
                </span>
              )}
              {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity relative z-10 p-0.5 rounded hover:bg-foreground/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-3.5" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="text-sm">
                    <DropdownMenuItem
                      onClick={() => { setEditingId(l.id); setEditDraft(l.name); }}
                    >
                      <Pencil className="size-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete list "${l.name}"? Tasks inside move to Inbox.`)) onDelete(l.id);
                      }}
                    >
                      <Trash2 className="size-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}

        <div className="mx-2 mt-1">
          {adding ? (
            <div className="flex flex-col gap-1 px-1">
              <Input
                name="rail-new-list-name"
                autoFocus
                placeholder="New list name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={submitNew}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNew();
                  if (e.key === 'Escape') { setAdding(false); setDraft(''); }
                }}
                className="h-7 text-sm"
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              className="w-full justify-start h-8 text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5 mr-1.5" /> New list
            </Button>
          )}
        </div>
      </nav>
    </aside>
  );
}
