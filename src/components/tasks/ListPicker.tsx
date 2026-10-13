import { useMemo, useState } from 'react';
import { huePillBase, huePillOn, huePillOff, huePillGlyph, hueVar } from '@/components/ui/hue-pill';
import {
  Check, ChevronDown, Inbox, List, MoreVertical, Pencil, Plus, Trash2,
} from '@/components/ui/icons';

import type { TaskList } from '@/types';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'sajni:tasks:recent-lists';
const RECENT_MAX = 4;

function readRecent(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
  } catch { return []; }
}

function pushRecent(id: number): number[] {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

interface Props {
  lists: TaskList[];
  /** The list currently shown, if a user list (not a smart list) is selected. */
  selectedId: number | null;
  /** Inbox (unfiled tasks, the default home) is showing. */
  inboxSelected: boolean;
  onSelect: (id: number) => void;
  onSelectInbox: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename?: (id: number, name: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

// ListPicker — Inbox and every user list behind one chip that never scrolls
// away. The chip names the open list; the menu leads with Inbox, searches by
// name, keeps the last few used on top, and holds New / Rename / Delete.
// Enter picks the first match.
export default function ListPicker({
  lists, selectedId, inboxSelected, onSelect, onSelectInbox, onCreate, onRename, onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<number[]>(readRecent);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const selected = lists.find((l) => l.id === selectedId) ?? null;
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? lists.filter((l) => l.name.toLowerCase().includes(q)) : lists),
    [lists, q],
  );
  // Recents only earn a section when the full list is long enough to scroll.
  const showInbox = !q || 'inbox'.includes(q);
  const recentLists = useMemo(
    () => (q || lists.length <= 6 ? [] : recent.map((id) => lists.find((l) => l.id === id)).filter((l): l is TaskList => !!l)),
    [lists, recent, q],
  );

  const pick = (id: number) => {
    setRecent(pushRecent(id));
    onSelect(id);
    setOpen(false);
  };

  const pickInbox = () => {
    onSelectInbox();
    setOpen(false);
  };

  const submitRename = async (id: number) => {
    const name = editDraft.trim();
    setEditingId(null);
    setEditDraft('');
    if (name && onRename) await onRename(id, name);
  };

  const submitNew = async () => {
    const name = draft.trim();
    setDraft('');
    setAdding(false);
    if (name) await onCreate(name);
  };

  const row = (l: TaskList) => {
    const active = l.id === selectedId;
    if (editingId === l.id) {
      return (
        <div key={l.id} className="flex h-10 items-center gap-2 px-2.5" style={hueVar(l.color)}>
          <List className={huePillGlyph} aria-hidden />
          <Input
            name={`rename-list-${l.id}`}
            autoFocus
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onBlur={() => submitRename(l.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitRename(l.id); }
              if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); setEditDraft(''); }
            }}
            className="h-8 flex-1 text-sm"
          />
        </div>
      );
    }
    return (
      <div
        key={l.id}
        style={hueVar(l.color)}
        className={cn(
          'group flex h-10 items-center rounded-lg transition-colors',
          active ? 'bg-[color-mix(in_oklab,var(--hue)_14%,transparent)]' : 'hover:bg-[hsl(var(--on-surface)/0.06)]',
        )}
      >
        <button
          type="button"
          onClick={() => pick(l.id)}
          aria-pressed={active}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2.5 text-left text-sm"
        >
          <List className={huePillGlyph} aria-hidden />
          <span className={cn('min-w-0 flex-1 truncate', active && 'font-semibold')}>{l.name}</span>
          {l.task_count > 0 && <span className="text-xs tabular-nums text-muted-foreground">{l.task_count}</span>}
          <span className="w-4 shrink-0">{active && <Check className="size-4" aria-label="Showing" />}</span>
        </button>
        {(onRename || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="mx-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground opacity-60 hover:bg-foreground/10 hover:opacity-100"
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
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) { setQuery(''); setAdding(false); setEditingId(null); }
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            style={hueVar(selected?.color)}
            className={cn(huePillBase, 'max-w-48 pl-3 pr-2.5', selected || inboxSelected ? huePillOn : huePillOff)}
            title="Your lists"
          >
            {inboxSelected
              ? <Inbox className={huePillGlyph} aria-hidden />
              : <List className={cn(huePillGlyph, !selected && 'text-current')} aria-hidden />}
            <span className="truncate">{selected ? selected.name : inboxSelected ? 'Inbox' : 'Lists'}</span>
            {selected && selected.task_count > 0 && (
              <span className="text-xs font-semibold tabular-nums text-[color-mix(in_oklab,var(--hue)_80%,hsl(var(--on-surface)))]">
                {selected.task_count}
              </span>
            )}
            <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-1 p-2">
        <Input
          name="find-list"
          autoFocus
          value={query}
          placeholder="Find a list"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (matches[0]) { e.preventDefault(); pick(matches[0].id); } else if (showInbox) { e.preventDefault(); pickInbox(); }
          }}
          className="h-9"
        />
        <div className="mt-1 max-h-[min(22rem,60vh)] overflow-y-auto">
          {showInbox && (
            <button
              type="button"
              onClick={pickInbox}
              aria-pressed={inboxSelected}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors',
                inboxSelected ? 'bg-[hsl(var(--primary)/0.12)]' : 'hover:bg-[hsl(var(--on-surface)/0.06)]',
              )}
              title="Tasks not filed in any list"
            >
              <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn('min-w-0 flex-1 truncate', inboxSelected && 'font-semibold')}>Inbox</span>
              <span className="w-4 shrink-0">{inboxSelected && <Check className="size-4" aria-label="Showing" />}</span>
              {(onRename || onDelete) && <span className="mx-1 size-8 shrink-0" aria-hidden />}
            </button>
          )}
          {recentLists.length > 0 && (
            <>
              <div className="label-kicker px-2.5 pb-1 pt-1.5 text-muted-foreground">Recent</div>
              {recentLists.map(row)}
              <div className="label-kicker px-2.5 pb-1 pt-2.5 text-muted-foreground">All lists</div>
            </>
          )}
          {matches.map(row)}
          {q && matches.length === 0 && !showInbox && (
            <div className="px-2.5 py-3 text-sm text-muted-foreground">No list called “{query.trim()}”</div>
          )}
        </div>
        {adding ? (
          <Input
            name="new-list-name"
            autoFocus
            value={draft}
            placeholder="List name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitNew(); }
              if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setDraft(''); }
            }}
            className="h-9"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setDraft(q ? query.trim() : ''); }}
            className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground"
          >
            <Plus className="size-4" /> {q && matches.length === 0 ? `Create “${query.trim()}”` : 'New list'}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
