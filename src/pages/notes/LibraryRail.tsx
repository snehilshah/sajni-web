import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { notes as notesApi } from '@/api';
import type { NoteFolder } from '@/types';
import { qk } from '@/queries/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronRight, FilePlus, FolderPlus, MoreHorizontal, PanelLeftClose, Pencil, Pin, PinOff, Search, Trash2, X,
  FolderInput as MoveIcon,
} from '@/components/ui/icons';
import { confirmDialog } from '@/lib/confirm';
import { failureText } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { displayTitle, folderAncestors, type NoteListItem, type TreeNode } from './model';

// Row geometry, shared by every row (folders, notes, the inline name field)
// so names start on one edge at each depth: a 16px leading slot (chevron),
// 6px gap, then the name.
const INDENT = 14;
const PAD = 8;
const rowPad = (depth: number) => ({ paddingLeft: PAD + depth * INDENT });

export interface LibraryRailProps {
  tree: TreeNode;
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  selectedId: number | null;
  /** The unsaved draft, shown as a row in its folder. */
  draft: { folder: string; title: string } | null;
  expanded: Set<string>;
  onToggle: (path: string, open?: boolean) => void;
  onOpen: (id: number) => void;
  onPrefetch: (id: number) => void;
  onNew: (folder: string) => void;
  onMove: (id: number, folder: string) => void;
  onMoveRequest: (note: NoteListItem) => void;
  onPin: (note: NoteListItem) => void;
  onDelete: (note: NoteListItem) => void;
  onFolderRenamed: (from: string, to: string) => void;
  onFolderDeleted: (path: string) => void;
  onCollapse?: () => void;
}

type Editing = { kind: 'new'; parent: string } | { kind: 'rename'; path: string } | null;

export default function LibraryRail(props: LibraryRailProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const searching = props.search.trim().length > 0;

  const refreshAll = () => qc.invalidateQueries({ queryKey: qk.notes.all });

  const createFolder = async (parent: string, name: string) => {
    setEditing(null);
    const clean = name.trim().replace(/\//g, '-');
    if (!clean) return;
    const path = parent ? `${parent}/${clean}` : clean;
    qc.setQueryData<NoteFolder[]>(qk.notes.folders(), (old) => (old && !old.some((f) => f.path === path) ? [...old, { path, pinned: false }] : old));
    folderAncestors(path).forEach((p) => props.onToggle(p, true));
    try {
      await notesApi.createFolder(path);
    } catch (err) {
      toast.error(failureText(err, "Couldn't create the folder"));
    }
    void qc.invalidateQueries({ queryKey: qk.notes.folders() });
  };

  const renameFolder = async (from: string, name: string) => {
    setEditing(null);
    const clean = name.trim().replace(/\//g, '-');
    const cut = from.lastIndexOf('/');
    const to = (cut >= 0 ? `${from.slice(0, cut)}/` : '') + clean;
    if (!clean || to === from) return;
    try {
      await notesApi.renameFolder(from, to);
      props.onFolderRenamed(from, to);
    } catch (err) {
      toast.error(failureText(err, "Couldn't rename the folder"));
    }
    void refreshAll();
  };

  const deleteFolder = async (node: TreeNode) => {
    const ok = await confirmDialog({
      title: `Delete “${node.name}”?`,
      description: node.count
        ? `Its ${node.count === 1 ? 'note' : `${node.count} notes`} and subfolders go with it. This can't be undone.`
        : 'The empty folder is removed.',
      confirmText: 'Delete folder',
    });
    if (!ok) return;
    try {
      await notesApi.deleteFolder(node.path);
      props.onFolderDeleted(node.path);
    } catch (err) {
      toast.error(failureText(err, "Couldn't delete the folder"));
    }
    void refreshAll();
  };

  const pinFolder = async (node: TreeNode) => {
    qc.setQueryData<NoteFolder[]>(qk.notes.folders(), (old) => {
      if (!old) return old;
      return old.some((f) => f.path === node.path)
        ? old.map((f) => (f.path === node.path ? { ...f, pinned: !node.pinned } : f))
        : [...old, { path: node.path, pinned: !node.pinned }];
    });
    try {
      await notesApi.pinFolder(node.path, !node.pinned);
    } catch (err) {
      toast.error(failureText(err, "Couldn't pin the folder"));
      void qc.invalidateQueries({ queryKey: qk.notes.folders() });
    }
  };

  // Drag a note onto a folder (or the library's empty space = top level).
  const dropProps = (path: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('application/x-sajni-note')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== path) setDropTarget(path);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget((t) => (t === path ? null : t));
    },
    onDrop: (e: React.DragEvent) => {
      const id = Number(e.dataTransfer.getData('application/x-sajni-note'));
      setDropTarget(null);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      props.onMove(id, path);
      if (path) props.onToggle(path, true);
    },
  });

  const renderChildren = (node: TreeNode, depth: number): ReactNode => (
    <>
      {editing?.kind === 'new' && editing.parent === node.path && (
        <NameField
          depth={depth}
          initial=""
          placeholder="Folder name"
          onDone={(name) => (name === null ? setEditing(null) : createFolder(node.path, name))}
        />
      )}
      {props.draft && props.draft.folder === node.path && (
        <Row depth={depth} selected leading={null}>
          <span className="flex-1 truncate">{props.draft.title.trim() || 'Untitled'}</span>
        </Row>
      )}
      {node.children.map((child) => (child.type === 'folder'
        ? (
          renderFolder(child, depth)
        ) : (
          renderNote(child.note!, depth)
        )))}
    </>
  );

  // Plain render helpers (not components), so rows keep their state.
  function renderFolder(node: TreeNode, depth: number) {
    const open = searching || props.expanded.has(node.path);
    const renaming = editing?.kind === 'rename' && editing.path === node.path;
    return (
      <div key={`f:${node.path}`} role="none" {...dropProps(node.path)}>
        {renaming ? (
          <NameField
            depth={depth}
            initial={node.name}
            placeholder="Folder name"
            leading={<Chevron open={open} />}
            onDone={(name) => (name === null ? setEditing(null) : renameFolder(node.path, name))}
          />
        ) : (
          <Row
            depth={depth}
            role="treeitem"
            ariaExpanded={open}
            dropping={dropTarget === node.path}
            onClick={() => props.onToggle(node.path)}
            leading={<Chevron open={open} />}
            trailing={(
              <>
                {node.pinned && <Pin className="size-3 text-muted-foreground" aria-label="Pinned" />}
                <span className="text-xs tabular-nums text-muted-foreground">{node.count || ''}</span>
              </>
            )}
            menu={(
              <>
                <DropdownMenuItem onClick={() => props.onNew(node.path)}><FilePlus /> New note</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { props.onToggle(node.path, true); setEditing({ kind: 'new', parent: node.path }); }}><FolderPlus /> New folder</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing({ kind: 'rename', path: node.path })}><Pencil /> Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => pinFolder(node)}>{node.pinned ? <PinOff /> : <Pin />} {node.pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => deleteFolder(node)}><Trash2 /> Delete</DropdownMenuItem>
              </>
            )}
            menuLabel={`More for ${node.name}`}
          >
            <span className="flex-1 truncate">{node.name}</span>
          </Row>
        )}
        {open && <div role="group">{renderChildren(node, depth + 1)}</div>}
      </div>
    );
  }

  function renderNote(note: NoteListItem, depth: number) {
    const selected = props.selectedId === note.id;
    return (
      <Row
        key={`n:${note.id}`}
        depth={depth}
        role="treeitem"
        selected={selected}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-sajni-note', String(note.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => props.onOpen(note.id)}
        onPointerEnter={() => props.onPrefetch(note.id)}
        leading={null}
        trailing={note.pinned ? <Pin className="size-3 text-muted-foreground" aria-label="Pinned" /> : null}
        menu={(
          <>
            <DropdownMenuItem onClick={() => props.onPin(note)}>{note.pinned ? <PinOff /> : <Pin />} {note.pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onMoveRequest(note)}><MoveIcon /> Move to…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => props.onDelete(note)}><Trash2 /> Delete</DropdownMenuItem>
          </>
        )}
        menuLabel={`More for ${displayTitle(note.title)}`}
      >
        <span className="flex-1 truncate">{displayTitle(note.title)}</span>
      </Row>
    );
  }

  const empty = !props.loading && props.tree.children.length === 0 && !props.draft && !editing;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 pl-4 pr-2">
        <h2 className="flex-1 truncate text-xl font-semibold tracking-tight">Notes</h2>
        <Button size="icon-sm" variant="ghost" className="rounded-full" title="New note · Alt+N" aria-label="New note" onClick={() => props.onNew('')}>
          <FilePlus className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" className="rounded-full" title="New folder" aria-label="New folder" onClick={() => setEditing({ kind: 'new', parent: '' })}>
          <FolderPlus className="size-4" />
        </Button>
        {props.onCollapse && (
          <Button size="icon-sm" variant="ghost" className="rounded-full" title="Hide library" aria-label="Hide library" onClick={props.onCollapse}>
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </header>

      <div className="shrink-0 px-2 pb-2">
       <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') props.onSearch(''); }}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-9 rounded-lg bg-[hsl(var(--surface-container))] pl-8 pr-8 text-sm"
        />
        {props.search && (
          <button
            type="button"
            onClick={() => props.onSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
       </div>
      </div>

      <div
        className={cn('stable-scrollbar flex-1 min-h-0 overflow-y-auto px-2 pb-6', dropTarget === '' && 'bg-[hsl(var(--primary)/0.04)]')}
        role="tree"
        aria-label="Notes"
        {...dropProps('')}
      >
        {props.loading ? (
          <div className="flex flex-col gap-1.5 px-2 py-1">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : empty ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searching ? 'No notes match' : 'No notes yet'}
          </p>
        ) : renderChildren(props.tree, 0)}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn('size-3.5 text-muted-foreground transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]', open && 'rotate-90')}
      aria-hidden
    />
  );
}

function Row({
  depth, selected, dropping, leading, trailing, menu, menuLabel, children, onClick, role, ariaExpanded, ...rest
}: {
  depth: number;
  selected?: boolean;
  dropping?: boolean;
  leading: ReactNode;
  trailing?: ReactNode;
  menu?: ReactNode;
  menuLabel?: string;
  children: ReactNode;
  onClick?: () => void;
  role?: string;
  ariaExpanded?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onPointerEnter?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      role={role}
      aria-selected={role === 'treeitem' && ariaExpanded === undefined ? !!selected : undefined}
      aria-expanded={ariaExpanded}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
      }}
      onContextMenu={menu ? (e) => { e.preventDefault(); setMenuOpen(true); } : undefined}
      style={rowPad(depth)}
      className={cn(
        'group relative flex min-h-11 md:min-h-8 select-none items-center gap-1.5 rounded-lg pr-1.5 text-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))]',
        onClick && 'cursor-pointer',
        selected
          ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
          : 'text-foreground/85 hover:bg-[hsl(var(--surface-container-high))]',
        dropping && 'ring-2 ring-inset ring-[hsl(var(--primary))]',
      )}
      {...rest}
    >
      <span className="flex w-4 shrink-0 items-center justify-center">{leading}</span>
      {children}
      {/* One trailing slot: pin/count at rest, the menu on hover (no shift). */}
      <span className="relative flex h-7 min-w-7 shrink-0 items-center justify-end gap-1.5 pr-1">
        <span className={cn('flex items-center gap-1.5', menu && (menuOpen ? 'invisible' : 'group-hover:invisible group-focus-within:invisible'))}>
          {trailing}
        </span>
        {menu && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              render={(
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'absolute right-0 top-0 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--surface-container-highest))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                    menuOpen ? 'flex' : 'max-md:flex md:invisible md:group-hover:visible md:group-focus-within:visible',
                  )}
                  aria-label={menuLabel}
                  title="More"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              )}
            />
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </div>
  );
}

/** Inline name field that sits exactly where a row's name would. */
function NameField({
  depth, initial, placeholder, leading, onDone,
}: {
  depth: number;
  initial: string;
  placeholder: string;
  leading?: ReactNode;
  onDone: (name: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const [value, setValue] = useState(initial);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <div style={rowPad(depth)} className="flex min-h-11 md:min-h-8 items-center gap-1.5 pr-1.5">
      <span className="flex w-4 shrink-0 items-center justify-center">{leading}</span>
      <Input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(value); }
          if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        }}
        onBlur={() => finish(value.trim() ? value : null)}
        placeholder={placeholder}
        aria-label={placeholder}
        // Text starts on the row's name edge: the field's padding is pulled
        // back by the same amount.
        className="-ml-1.5 h-7 flex-1 rounded-md border-0 bg-[hsl(var(--surface-container-highest))] px-1.5 text-sm focus-visible:shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]"
      />
    </div>
  );
}
