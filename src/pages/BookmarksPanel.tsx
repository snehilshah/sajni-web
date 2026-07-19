import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { toast } from 'sonner';

import {
  useBookmarks, useCreateBookmark, useUpdateBookmark, useDeleteBookmark,
} from '@/queries/bookmarks';
import type { Bookmark } from '@/types';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { M3CookieLoader } from '@/components/ui/shapes';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Globe, Search, X, MoreVertical, Archive, ArchiveRestore,
  CircleCheck, Circle, Trash2, ExternalLink, Pencil, MonitorPlay, BookmarkPlus,
} from '@/components/ui/icons';

// Pretty names for hosts whose favicon alone isn't label enough. Everything
// else shows its fetched site_name or bare host — the favicon carries the
// brand.
const HOST_NAMES: Record<string, string> = {
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo',
  'twitch.tv': 'Twitch', 'medium.com': 'Medium', 'github.com': 'GitHub',
  'reddit.com': 'Reddit', 'x.com': 'X', 'twitter.com': 'X',
  'news.ycombinator.com': 'Hacker News', 'substack.com': 'Substack',
  'wikipedia.org': 'Wikipedia', 'stackoverflow.com': 'Stack Overflow',
  'google.com': 'Google', 'dev.to': 'DEV', 'linkedin.com': 'LinkedIn',
};

function hostOf(raw: string): string {
  try { return new URL(raw).hostname.replace(/^(www|m)\./, ''); } catch { return ''; }
}

function siteLabel(b: Bookmark): string {
  const host = hostOf(b.url);
  for (const [h, name] of Object.entries(HOST_NAMES)) {
    if (host === h || host.endsWith('.' + h)) return name;
  }
  return b.site_name || host || 'link';
}

// Never render a blank title — an empty <p> collapses the card. Fall back
// to the site label, then the raw URL.
function displayTitle(b: Bookmark): string {
  return b.title.trim() || siteLabel(b) || b.url;
}

function agoShort(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: false })
      .replace(/ (\w)\w* ?(\w*)$/, '$1'); // "3 days" → "3d"
  } catch { return ''; }
}

function Favicon({ b, className }: { b: Bookmark; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Fallback = b.kind === 'video' ? MonitorPlay : Globe;
  if (failed || !b.favicon_url) {
    return (
      <span className={cn('grid place-items-center bg-[hsl(var(--surface-container-high))] text-muted-foreground', className)}>
        <Fallback className="size-[55%]" strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <span className={cn('grid place-items-center bg-[hsl(var(--surface-container-high))] overflow-hidden', className)}>
      <img src={b.favicon_url} alt="" className="size-[62%] object-contain" onError={() => setFailed(true)} loading="lazy" />
    </span>
  );
}

type Shelf = 'all' | 'unread' | 'archived';

export default function BookmarksPanel({ kind, addSignal }: {
  kind: 'video' | 'site';
  /** Increments when the page-level Add button is pressed on this tab. */
  addSignal: number;
}) {
  const isMobile = useIsMobile();
  const [shelf, setShelf] = useState<Shelf>('all');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Bookmark | null>(null);
  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: items = [], isLoading: loading } = useBookmarks({ kind, archived: shelf === 'archived' });
  const createBookmark = useCreateBookmark();
  const updateBookmark = useUpdateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const openForm = useCallback((b?: Bookmark) => {
    setEditItem(b ?? null);
    setFormUrl(b?.url ?? '');
    setFormTitle(b?.title ?? '');
    setFormNote(b?.note ?? '');
    setShowForm(true);
  }, []);

  // Page-level "Add" button lives in MediaPage's PageShell; it pokes this
  // counter instead of the panel owning a second button.
  useEffect(() => {
    if (addSignal > 0) openForm();
  }, [addSignal, openForm]);

  const visible = useMemo(() => {
    // The optimistic archive/restore patch flips `archived` in the cache before
    // the refetch lands; this client filter makes the row leave its shelf at
    // once instead of waiting a round-trip.
    let out = items.filter((b) => (shelf === 'archived' ? b.archived : !b.archived));
    if (shelf === 'unread') out = out.filter((b) => b.unread);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q) ||
        siteLabel(b).toLowerCase().includes(q));
    }
    return out;
  }, [items, shelf, search]);

  const unreadCount = useMemo(() => items.filter((b) => b.unread && !b.archived).length, [items]);

  // Opening a link is the read action — the queue clears itself.
  const open = (b: Bookmark) => {
    window.open(b.url, '_blank', 'noopener,noreferrer');
    if (b.unread) updateBookmark.mutate({ id: b.id, data: { unread: false } });
  };

  const toggleRead = (b: Bookmark) => {
    updateBookmark.mutate({ id: b.id, data: { unread: !b.unread } });
  };

  const setArchived = (b: Bookmark, archived: boolean) => {
    updateBookmark.mutate(
      { id: b.id, data: { archived } },
      { onSuccess: () => toast.success(archived ? 'Archived' : 'Restored') },
    );
  };

  const remove = (b: Bookmark) => {
    deleteBookmark.mutate(b.id);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editItem) {
        await updateBookmark.mutateAsync({ id: editItem.id, data: { title: formTitle.trim(), note: formNote.trim() } });
      } else {
        const created = await createBookmark.mutateAsync({ url: formUrl.trim(), title: formTitle.trim(), note: formNote.trim() });
        if (created.kind !== kind) toast.success(`Saved under ${created.kind === 'video' ? 'Videos' : 'Sites'}`);
      }
      setShowForm(false);
    } catch (e) {
      toast.error('Could not save: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  const shelves: { value: Shelf; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: shelf === 'archived' ? undefined : items.length },
    { value: 'unread', label: 'Unread', count: shelf === 'archived' ? undefined : unreadCount },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Toolbar: shelf chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {shelves.map((s) => (
            <button
              key={s.value}
              onClick={() => setShelf(s.value)}
              className={cn(
                'h-8 px-3 rounded-full text-xs font-medium inline-flex items-center gap-1.5 border transition-colors',
                shelf === s.value
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))] border-transparent'
                  : 'border-[hsl(var(--outline))] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
              )}
            >
              {s.label}
              {s.count !== undefined && s.count > 0 && (
                <span className="font-mono text-xs opacity-70">{s.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={kind === 'video' ? 'Filter videos…' : 'Filter sites…'}
            className="h-10 pl-11 pr-9 w-full rounded-full bg-[hsl(var(--surface-container-high))] border-transparent hover:bg-[hsl(var(--surface-container-highest))] hover:border-transparent focus-visible:rounded-full focus-visible:pl-11 focus-visible:border-2 focus-visible:border-primary focus-visible:bg-[hsl(var(--surface-container-highest))] transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <M3CookieLoader size="lg" tone="primary" />
          <span className="mono text-xs tracking-[0.22em] uppercase text-muted-foreground">
            opening bookmarks…
          </span>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <BookmarkPlus className="size-8 text-muted-foreground" strokeWidth={1.4} />
          <p className="text-sm text-muted-foreground max-w-[36ch]">
            {search || shelf !== 'all'
              ? 'Nothing here matches the current filter.'
              : kind === 'video'
                ? 'No saved videos yet. Share one to Sajni from your phone, or add a link.'
                : 'No saved sites yet. Share a page to Sajni from your phone, or add a link.'}
          </p>
          {!search && shelf === 'all' && (
            <Button variant="tonal" size="sm" onClick={() => openForm()} className="gap-1.5">
              <BookmarkPlus className="size-3.5" /> Add link
            </Button>
          )}
        </div>
      ) : kind === 'video' && !isMobile ? (
        /* Videos, desktop: thumbnail grid — YouTube og:images are 16:9 and
           carry the card. Mobile falls through to the denser list. */
        <motion.div layout className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence initial={false}>
            {visible.map((b) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, transform: 'scale(0.92)' }}
                animate={{ opacity: 1, transform: 'scale(1)' }}
                exit={{ opacity: 0, transform: 'scale(0.9)', transition: { duration: 0.16 } }}
                transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.6 }}
              >
                <VideoCard b={b} onOpen={() => open(b)} menu={
                  <RowMenu b={b} shelf={shelf} onEdit={() => openForm(b)} onToggleRead={() => toggleRead(b)} onArchive={setArchived} onDelete={() => remove(b)} />
                } />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="rounded-xl overflow-hidden bg-[hsl(var(--surface-container))] border border-border">
          <AnimatePresence initial={false}>
            {visible.map((b, i) => (
              <motion.div
                key={b.id}
                layout
                initial={false}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
              >
                <BookmarkRow
                  b={b}
                  first={i === 0}
                  onOpen={() => open(b)}
                  menu={
                    <RowMenu b={b} shelf={shelf} onEdit={() => openForm(b)} onToggleRead={() => toggleRead(b)} onArchive={setArchived} onDelete={() => remove(b)} />
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / edit */}
      <Dialog open={showForm} onOpenChange={setShowForm} onOpenChangeComplete={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="size-5 text-muted-foreground" />
              {editItem ? 'Edit bookmark' : 'Add bookmark'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            {!editItem && (
              <div className="grid gap-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Link</Label>
                <Input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  autoFocus
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={editItem ? '' : 'Fetched from the page when left blank'}
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
              <Textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Why save this? Use #tags."
                rows={2}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || (!editItem && !formUrl.trim())} className="gap-1.5">
              {saving && <M3CookieLoader size="xs" tone="primary" className="!text-primary-foreground" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowMenu({ b, shelf, onEdit, onToggleRead, onArchive, onDelete }: {
  b: Bookmark;
  shelf: Shelf;
  onEdit: () => void;
  onToggleRead: () => void;
  onArchive: (b: Bookmark, archived: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--on-surface)/0.08)] transition-colors shrink-0"
        aria-label="Bookmark actions"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => window.open(b.url, '_blank', 'noopener,noreferrer')}>
          <ExternalLink className="size-3.5" /> Open
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleRead}>
          {b.unread ? <CircleCheck className="size-3.5" /> : <Circle className="size-3.5" />}
          {b.unread ? 'Mark read' : 'Mark unread'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {shelf === 'archived' ? (
          <DropdownMenuItem onClick={() => onArchive(b, false)}>
            <ArchiveRestore className="size-3.5" /> Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(b, true)}>
            <Archive className="size-3.5" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="size-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BookmarkRow({ b, first, onOpen, menu }: {
  b: Bookmark;
  first: boolean;
  onOpen: () => void;
  menu: React.ReactNode;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={cn(
        'group flex items-center gap-3 px-3.5 py-3 cursor-pointer min-w-0',
        'hover:bg-[hsl(var(--on-surface)/0.04)] transition-colors',
        !first && 'border-t border-border/60',
      )}
    >
      <span className="relative shrink-0">
        <Favicon b={b} className="size-10 rounded-lg" />
        {b.unread && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-[hsl(var(--surface-container))]" aria-label="Unread" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm truncate leading-snug', b.unread ? 'font-medium text-foreground' : 'text-foreground/80')}>
          {displayTitle(b)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {siteLabel(b)} · {agoShort(b.created_at)}
          {b.note ? <> · {b.note}</> : null}
        </p>
      </div>
      <span onClick={(e) => e.stopPropagation()}>{menu}</span>
    </div>
  );
}

function VideoCard({ b, onOpen, menu }: { b: Bookmark; onOpen: () => void; menu: React.ReactNode }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="group cursor-pointer rounded-xl overflow-hidden bg-[hsl(var(--surface-container))] border border-border hover:border-[hsl(var(--outline))] transition-colors"
    >
      <div className="relative aspect-video bg-[hsl(var(--surface-container-high))]">
        {b.image_url && !imgFailed ? (
          <img
            src={b.image_url}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <MonitorPlay className="size-8" strokeWidth={1.2} />
          </div>
        )}
        {b.unread && (
          <span className="absolute top-2 left-2 h-5 px-2 inline-flex items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-medium tracking-wide">
            unread
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 p-2.5 min-w-0">
        <Favicon b={b} className="size-7 rounded-md shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] leading-snug line-clamp-2', b.unread ? 'font-medium' : 'text-foreground/80')}>
            {displayTitle(b)}
          </p>
          <p className="text-xs text-muted-foreground truncate">{siteLabel(b)} · {agoShort(b.created_at)}</p>
        </div>
        <span onClick={(e) => e.stopPropagation()}>{menu}</span>
      </div>
    </div>
  );
}
