import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sun, Star, Calendar, Inbox, ListTodo, Plus, MoreVertical, Trash2, Pencil,
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
    <aside className="w-56 shrink-0 border-r border-border/60 bg-card/30 flex flex-col">
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col gap-0.5">
        {SMART_LISTS.map((s) => {
          const Icon = SMART_ICON[s.smart];
          const active = selection.kind === 'smart' && selection.smart === s.smart;
          const count = smartCounts?.[s.smart];
          return (
            <button
              key={s.smart}
              onClick={() => onSelect({ kind: 'smart', smart: s.smart })}
              className={`relative mx-2 flex items-center gap-2.5 h-8 px-2.5 rounded-md text-sm transition-colors text-left
                ${active ? 'text-primary-foreground' : 'text-foreground/80 hover:bg-accent'}`}
              title={s.description}
            >
              {active && (
                <motion.span
                  layoutId="lists-active"
                  className="absolute inset-0 rounded-md bg-primary -z-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="size-4 shrink-0 relative z-10" />
              <span className="flex-1 truncate relative z-10">{s.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span className="font-mono text-[10px] px-1 rounded bg-muted text-muted-foreground relative z-10">
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <div className="mx-3 my-2 border-t border-border/60" />

        <div className="mx-3 mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Lists
        </div>

        {lists.map((l) => {
          const active = selection.kind === 'list' && selection.id === l.id;
          const isEditing = editingId === l.id;
          return (
            <div
              key={l.id}
              className={`group relative mx-2 flex items-center gap-2 h-8 px-2.5 rounded-md text-sm
                ${active ? 'text-primary-foreground' : 'text-foreground/80 hover:bg-accent'}`}
            >
              {active && (
                <motion.span
                  layoutId="lists-active"
                  className="absolute inset-0 rounded-md bg-primary -z-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span
                className="size-2 rounded-full shrink-0 relative z-10"
                style={{ backgroundColor: l.color }}
              />
              {isEditing ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => submitRename(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(l.id);
                    if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                  }}
                  className="flex-1 bg-transparent outline-none border-b border-current text-sm relative z-10 min-w-0"
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
