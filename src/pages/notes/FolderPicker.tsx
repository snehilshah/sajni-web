import { useMemo, useState } from 'react';

import type { NoteFolder } from '@/types';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, ChevronDown, ChevronRight, Folder, FileText } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/** A searchable list of folders; "Notes" is the top level. */
function FolderList({ folders, current, onPick }: { folders: NoteFolder[]; current: string; onPick: (path: string) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = [{ path: '', label: 'Notes', depth: 0 }, ...[...folders]
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true }))
      .map((f) => ({ path: f.path, label: f.path.split('/').pop() || f.path, depth: f.path.split('/').length }))];
    // While searching, show full paths flat so a match says where it is.
    return q ? all.filter((r) => r.path.toLowerCase().includes(q)).map((r) => ({ ...r, label: r.path.split('/').join(' / '), depth: 1 })) : all;
  }, [folders, q]);

  return (
    <>
      {folders.length > 6 && (
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && rows[0]) { e.preventDefault(); onPick(rows[0].path); } }}
          placeholder="Find a folder"
          aria-label="Find a folder"
          className="mb-1 h-9"
        />
      )}
      <div className="max-h-[min(22rem,60vh)] overflow-y-auto" role="listbox" aria-label="Folders">
        {rows.map((r) => {
          const on = r.path === current;
          return (
            <button
              key={r.path || '__top'}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => onPick(r.path)}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg pr-2.5 text-left text-sm transition-colors',
                on ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]' : 'hover:bg-[hsl(var(--on-surface)/0.06)]',
              )}
              style={{ paddingLeft: 10 + Math.max(0, r.depth - 1) * 14 }}
            >
              {r.path ? <Folder className="size-3.5 shrink-0 text-muted-foreground" /> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {on && <Check className="size-3.5 shrink-0" aria-hidden />}
            </button>
          );
        })}
        {rows.length === 0 && <p className="px-2.5 py-3 text-sm text-muted-foreground">No folder called “{query.trim()}”</p>}
      </div>
    </>
  );
}

/** The note's place as a breadcrumb; tap it to move the note (or pick where a new one goes). */
export function FolderPicker({ folders, folder, onPick, compact, className }: {
  folders: NoteFolder[];
  folder: string;
  onPick: (path: string) => void;
  /** Only the note's own folder (phones). */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const all = folder ? folder.split('/') : [];
  const parts = compact ? all.slice(-1) : all;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <button
            type="button"
            title="Move to another folder"
            className={cn(
              '-ml-2 inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.06)] hover:text-foreground',
              className,
            )}
          >
            {!(compact && parts.length) && <span className="truncate">Notes</span>}
            {parts.map((p, i) => (
              <span key={`${p}:${i}`} className="flex min-w-0 items-center gap-1">
                {!(compact && i === 0) && <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />}
                <span className={cn('truncate', i === parts.length - 1 && 'text-foreground/85')}>{p}</span>
              </span>
            ))}
            <ChevronDown className={cn('size-3.5 shrink-0 opacity-70 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        )}
      />
      <PopoverContent align="start" className="w-72 gap-0 p-2">
        <FolderList folders={folders} current={folder} onPick={(p) => { setOpen(false); onPick(p); }} />
      </PopoverContent>
    </Popover>
  );
}

export function MoveDialog({ open, title, folders, current, onPick, onOpenChange }: {
  open: boolean;
  title: string;
  folders: NoteFolder[];
  current: string;
  onPick: (path: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">Move “{title}”</DialogTitle>
        </DialogHeader>
        <FolderList folders={folders} current={current} onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}
