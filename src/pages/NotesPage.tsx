import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import { notes as notesApi } from '@/api';
import type { BacklinkRef } from '@/types';
import { useNotes, useNoteFolders } from '@/queries/notes';
import { qk } from '@/queries/keys';
import { useNavChrome } from '@/components/nav-chrome';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SegmentedButton } from '@/components/ui/segmented-button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Code, Copy, Edit3, Eye, FilePlus, AlignLeft, Check, Maximize2, MoreHorizontal, MoveHorizontal, PanelLeft, PanelRight, Pin, PinOff, Trash2,
} from '@/components/ui/icons';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useIsMobile } from '@/hooks/use-mobile';
import { confirmDialog } from '@/lib/confirm';
import { lazyPage } from '@/lib/lazyPage';
import { useVimKeys } from '@/lib/vimPref';
import VimStatusBar from '@/components/editor/VimStatusBar';
import type { MarkdownEditorHandle } from '@/components/editor/MarkdownEditor';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import LibraryRail from './notes/LibraryRail';
import NoteContext from './notes/NoteContext';
import { FolderPicker, MoveDialog } from './notes/FolderPicker';
import { useNoteDoc, type SaveStatus } from './notes/useNoteDoc';
import {
  buildTree, countText, displayTitle, effectiveTitle, extractOutgoing, extractOutline, folderAncestors, fullTime, relTime,
  type NoteListItem, type OutgoingLink, type OutlineItem,
} from './notes/model';

const MarkdownEditor = lazyPage(() => import('@/components/editor/MarkdownEditor'));

type Mode = 'live' | 'source' | 'read';

const LIBRARY_KEY = 'sajni:notes-library';
const DETAILS_KEY = 'sajni:notes-details';
const EXPANDED_KEY = 'sajni:notes-expanded';
// Full width is the default; "Readable width" brings back the column.
const WIDE_KEY = 'sajni:notes-full-width';

const EASE = [0.2, 0, 0, 1] as const;
const LIBRARY_WIDTH_KEY = 'sajni:notes-library-width';
const DETAILS_WIDTH_KEY = 'sajni:notes-details-width';
const LIBRARY_DEFAULT = 272;
const DETAILS_DEFAULT = 288;
const clampRail = (w: number) => Math.round(Math.min(480, Math.max(200, w)));
const readWidth = (key: string, fallback: number) => {
  try { return clampRail(Number(localStorage.getItem(key)) || fallback); } catch { return fallback; }
};

function readFlag(key: string, fallback: boolean) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}

export default function NotesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();
  const isWide = useWide();
  const { setCalm: setChromeCalm } = useNavChrome();

  const notesQ = useNotes();
  const foldersQ = useNoteFolders();
  const allNotes = useMemo(() => (notesQ.data ?? []) as NoteListItem[], [notesQ.data]);
  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data]);

  const { doc, loading, status, edit, open, prefetch, newDraft, close, move, setPinned, remove, flush } = useNoteDoc();

  const [mode, setMode] = useState<Mode>('live');
  const [search, setSearch] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(() => readFlag(LIBRARY_KEY, true));
  const [detailsOpen, setDetailsOpen] = useState(() => readFlag(DETAILS_KEY, true));
  const [detailsSheet, setDetailsSheet] = useState(false);
  const [moveTarget, setMoveTarget] = useState<NoteListItem | null>(null);
  const [focus, setFocus] = useState(false);
  const [wide, setWide] = useState(() => readFlag(WIDE_KEY, true));
  const [libraryWidth, setLibraryWidth] = useState(() => readWidth(LIBRARY_WIDTH_KEY, LIBRARY_DEFAULT));
  const [detailsWidth, setDetailsWidth] = useState(() => readWidth(DETAILS_WIDTH_KEY, DETAILS_DEFAULT));
  const [calm, setCalm] = useState(false);
  const vimKeys = useVimKeys();
  const [vimHost, setVimHost] = useState<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]')); } catch { return new Set(); }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  useEffect(() => { try { localStorage.setItem(LIBRARY_KEY, libraryOpen ? '1' : '0'); } catch { /* private mode */ } }, [libraryOpen]);
  useEffect(() => { try { localStorage.setItem(DETAILS_KEY, detailsOpen ? '1' : '0'); } catch { /* private mode */ } }, [detailsOpen]);
  useEffect(() => { try { localStorage.setItem(LIBRARY_WIDTH_KEY, String(libraryWidth)); } catch { /* private mode */ } }, [libraryWidth]);
  useEffect(() => { try { localStorage.setItem(DETAILS_WIDTH_KEY, String(detailsWidth)); } catch { /* private mode */ } }, [detailsWidth]);
  useEffect(() => { try { localStorage.setItem(WIDE_KEY, wide ? '1' : '0'); } catch { /* private mode */ } }, [wide]);
  useEffect(() => { try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])); } catch { /* private mode */ } }, [expanded]);

  // ── Library ────────────────────────────────────────────────────────────
  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allNotes;
    return allNotes.filter((n) => displayTitle(n.title).toLowerCase().includes(q)
      || n.tags.some((t) => t.toLowerCase().includes(q.replace(/^#/, ''))));
  }, [allNotes, search]);
  const tree = useMemo(() => buildTree(visibleNotes, search.trim() ? [] : folders), [visibleNotes, folders, search]);

  const toggleFolder = useCallback((path: string, force?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const on = force ?? !next.has(path);
      if (on) next.add(path); else next.delete(path);
      return next;
    });
  }, []);

  const reveal = useCallback((folder: string) => {
    if (!folder) return;
    setExpanded((prev) => {
      const missing = folderAncestors(folder).filter((p) => !prev.has(p));
      return missing.length ? new Set([...prev, ...missing]) : prev;
    });
  }, []);

  // ── URL ⇄ open note ───────────────────────────────────────────────────
  // The URL mirrors the open note. A URL this page didn't write (a link,
  // back/forward) opens that note instead.
  const urlId = Number(params.get('id')) || null;
  const docId = doc?.id ?? null;
  const written = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (urlId !== written.current) {
      written.current = urlId;
      if (urlId && urlId !== docId) void open(urlId).then((d) => d && reveal(d.folder));
      return;
    }
    if (docId === urlId) return;
    written.current = docId;
    const next = new URLSearchParams(params);
    if (docId) next.set('id', String(docId)); else next.delete('id');
    setParams(next, { replace: true });
  }, [urlId, docId, params, setParams, open, reveal]);

  const openNote = useCallback((id: number) => {
    void open(id).then((d) => d && reveal(d.folder));
  }, [open, reveal]);

  const startNew = useCallback((folder?: string) => {
    setMode('live');
    void newDraft(folder ?? doc?.folder ?? '').then(() => requestAnimationFrame(() => titleRef.current?.focus()));
  }, [newDraft, doc?.folder]);

  const closeNote = useCallback(() => { void close(); }, [close]);

  const deleteNote = useCallback(async (note: { id: number; title: string }) => {
    const ok = await confirmDialog({ title: `Delete “${displayTitle(note.title)}”?`, description: "This can't be undone.", confirmText: 'Delete note' });
    if (!ok) return;
    await remove(note.id);
  }, [remove]);

  // ── Derived from the open note ─────────────────────────────────────────
  const content = doc?.content ?? '';
  const outline = useMemo(() => extractOutline(content), [content]);
  const outgoing = useMemo(() => extractOutgoing(content, allNotes, doc?.id ?? null), [content, allNotes, doc?.id]);
  // Counting walks the whole text; doing it a beat after typing stops keeps keystrokes light.
  const [counts, setCounts] = useState({ words: 0, characters: 0 });
  useEffect(() => {
    const t = setTimeout(() => setCounts(countText(content)), 250);
    return () => clearTimeout(t);
  }, [content]);
  const listItem = doc?.id ? allNotes.find((n) => n.id === doc.id) : undefined;
  const pinned = !!listItem?.pinned;

  const openBacklink = (b: BacklinkRef) => {
    setDetailsSheet(false);
    if (b.source_type === 'note') return openNote(b.source_id);
    if (b.source_type === 'journal') return navigate(`/journal?date=${encodeURIComponent(b.title)}`);
    if (b.source_type === 'memo') return navigate(`/memos?id=${b.source_id}`);
    if (b.source_type === 'task') window.dispatchEvent(new CustomEvent('task:open', { detail: { id: b.source_id } }));
  };

  const openOutgoing = async (l: OutgoingLink) => {
    setDetailsSheet(false);
    if (l.id) return openNote(l.id);
    try {
      await flush();
      const created = await notesApi.create(l.ref, '', doc?.folder ?? '');
      await qc.invalidateQueries({ queryKey: qk.notes.all });
      openNote(created.id);
    } catch {
      toast.error(`Couldn't create “${l.ref}”`);
    }
  };

  const jumpTo = (item: OutlineItem) => {
    setDetailsSheet(false);
    editorRef.current?.revealHeading(item.index);
  };

  const focusBody = () => editorRef.current?.focus('start');

  // ── Calm & focus ───────────────────────────────────────────────────────
  // Typing (or reading down) calms the chrome; moving the pointer or
  // scrolling back up brings it back. Focus also folds both rails away.
  useEffect(() => { setChromeCalm(calm || focus); }, [calm, focus, setChromeCalm]);
  useEffect(() => () => setChromeCalm(false), [setChromeCalm]);

  useEffect(() => {
    if (!calm) return;
    let travelled = 0;
    let last: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (last) travelled += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (travelled > 24) setCalm(false);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [calm]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let anchor = el.scrollTop;
    const onScroll = () => {
      const y = Math.max(0, el.scrollTop);
      if (y < 8) { setCalm(false); anchor = y; return; }
      if (y - anchor > 48) { setCalm(true); anchor = y; } else if (anchor - y > 48) { setCalm(false); anchor = y; }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [doc?.key]);

  const onWritingKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') setCalm(true);
  };

  // ── Keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Page shortcuts run first (capture) and stop there, so the editor (and
    // Vim keys, which use Ctrl+E to scroll) never sees them.
    const onShortcut = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const take = (run: () => void) => { e.preventDefault(); e.stopPropagation(); run(); };
      if (mod && (e.key === 's' || e.key === 'S')) take(() => { void flush(); });
      else if (mod && (e.key === 'e' || e.key === 'E') && doc) take(() => setMode((m) => (m === 'read' ? 'live' : 'read')));
      else if (mod && e.key === '.') take(() => setFocus((f) => !f));
      else if (e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) take(startNew);
    };
    // Esc last (bubble), so dialogs and Vim (back to normal mode) get it first.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !focus || e.defaultPrevented) return;
      // With Vim keys, Esc in the text or its ":" / "/" prompt is Vim's.
      if (vimKeys && e.target instanceof Element && e.target.closest('.cm-editor, .sajni-vim-status')) return;
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) return;
      setFocus(false);
    };
    window.addEventListener('keydown', onShortcut, true);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onShortcut, true);
      window.removeEventListener('keydown', onEscape);
    };
  }, [flush, doc, focus, startNew, vimKeys]);

  // ── Pieces ─────────────────────────────────────────────────────────────
  const railProps = {
    tree,
    loading: notesQ.isPending,
    search,
    onSearch: setSearch,
    selectedId: doc?.id ?? null,
    draft: doc && doc.id == null ? { folder: doc.folder, title: doc.title } : null,
    expanded,
    onToggle: toggleFolder,
    onOpen: openNote,
    onPrefetch: prefetch,
    onNew: (folder: string) => startNew(folder),
    onMove: (id: number, folder: string) => { void move(id, folder); },
    onMoveRequest: setMoveTarget,
    onPin: (n: NoteListItem) => { void setPinned(n.id, !n.pinned); },
    onDelete: (n: NoteListItem) => { void deleteNote(n); },
    onFolderRenamed: (from: string, to: string) => {
      if (doc && (doc.folder === from || doc.folder.startsWith(`${from}/`))) {
        // The open note moved with its folder; reload it under the new path.
        const id = doc.id;
        if (id) void qc.invalidateQueries({ queryKey: qk.notes.detail(id) });
        reveal(to + doc.folder.slice(from.length));
      }
    },
    onFolderDeleted: (path: string) => {
      if (doc && (doc.folder === path || doc.folder.startsWith(`${path}/`))) closeNote();
    },
  };

  const details = doc && (
    <NoteContext
      description={doc.description}
      onDescription={(v) => edit({ description: v })}
      outline={outline}
      onOutline={jumpTo}
      backlinks={doc.backlinks}
      onBacklink={openBacklink}
      outgoing={outgoing}
      onOutgoing={(l) => { void openOutgoing(l); }}
      tags={doc.tags}
      onCollapse={isWide ? () => setDetailsOpen(false) : undefined}
    />
  );

  const showLibraryRail = !isMobile && libraryOpen && !focus;
  const showDetailsRail = isWide && detailsOpen && !focus && !!doc;
  const openDetails = () => {
    if (isWide) { setFocus(false); setDetailsOpen(true); } else setDetailsSheet(true);
  };
  const chromeHidden = calm;

  const overflowMenu = doc && (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button variant="ghost" size="icon-sm" className="rounded-full max-md:size-11 md:size-8" title="More" aria-label="More">
            <MoreHorizontal className="size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end" side={isMobile ? 'bottom' : 'top'} className="min-w-52">
        {doc.id != null && (
          <DropdownMenuItem onClick={() => { void setPinned(doc.id!, !pinned); }}>
            {pinned ? <PinOff /> : <Pin />} {pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
        )}
        {!isMobile && (
          <DropdownMenuItem onClick={() => setFocus((f) => !f)}>
            <Maximize2 /> {focus ? 'Leave focus' : 'Focus'}
            <DropdownMenuShortcut>Ctrl .</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {!isMobile && (
          <>
            <DropdownMenuItem onClick={() => setWide(true)}>
              <MoveHorizontal /> Full width
              {wide && <Check className="ml-auto" aria-label="On" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWide(false)}>
              <AlignLeft /> Readable width
              {!wide && <Check className="ml-auto" aria-label="On" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {!isWide && (
          <DropdownMenuItem onClick={openDetails}>
            <PanelRight /> Details
          </DropdownMenuItem>
        )}
        {doc.id != null && (
          <DropdownMenuItem onClick={() => {
            void navigator.clipboard?.writeText(`${window.location.origin}/notes?id=${doc.id}`);
            toast.success('Link copied');
          }}
          >
            <Copy /> Copy link
          </DropdownMenuItem>
        )}
        {doc.id != null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => { void deleteNote({ id: doc.id!, title: effectiveTitle(doc.title, doc.content) }); }}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
        {/* Read-only facts, like the foot of Notion's ⋯ menu. Desktop shows
            "Edited" above the title and the counts in its corner pill. */}
        {doc.created_at && (
          <>
            <DropdownMenuSeparator />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 pb-1.5 pt-1 text-xs text-muted-foreground">
              <dt>Created</dt><dd className="text-foreground/80">{fullTime(doc.created_at)}</dd>
              {isMobile && doc.updated_at && <><dt>Edited</dt><dd className="text-foreground/80">{fullTime(doc.updated_at)}</dd></>}
              {isMobile && <><dt>Length</dt><dd className="tabular-nums text-foreground/80">{counts.words.toLocaleString()} words · {counts.characters.toLocaleString()} chars</dd></>}
            </dl>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const modeSwitch = doc && (
    <SegmentedButton
      value={mode}
      onChange={setMode}
      showCheck={false}
      size="sm"
      aria-label="View"
      className="[&>button]:h-7 [&>button]:px-2.5 max-md:[&>button]:h-10"
      options={[
        { value: 'live', label: isMobile ? '' : 'Live', icon: Edit3 },
        { value: 'source', label: isMobile ? '' : 'Source', icon: Code },
        { value: 'read', label: isMobile ? '' : 'Read', icon: Eye },
      ]}
    />
  );

  // Phones: one bar above the text (back · folder · view · more).
  const topBar = doc && isMobile && (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-1 px-3 transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)]',
        chromeHidden && 'pointer-events-none opacity-0',
      )}
    >
      <Button variant="ghost" size="icon-sm" className="size-11 rounded-full" onClick={closeNote} title="All notes" aria-label="All notes">
        <ArrowLeft className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center pl-2">
        <FolderPicker
          folders={folders}
          folder={doc.folder}
          onPick={(path) => { void move(doc.id, path); reveal(path); }}
          compact
          className="min-w-0"
        />
      </div>
      <SaveState status={status} onRetry={() => { void flush(); }} />
      {modeSwitch}
      {overflowMenu}
    </div>
  );

  const writing = doc && (
    // Desktop: the text runs the full height and slides under the nav pill,
    // fading out at the top edge, so calm never leaves an empty band.
    <div
      ref={scrollRef}
      className="stable-scrollbar flex-1 min-h-0 overflow-y-auto md:[mask-image:linear-gradient(to_bottom,transparent_0,black_68px)]"
    >
      <motion.article
        key={doc.key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: EASE }}
        className={cn(
          'mx-auto flex min-h-full w-full flex-col px-5 pt-6 pb-[40vh] md:pt-[76px]',
          wide ? 'max-w-none md:pl-16 md:pr-10' : 'max-w-[46rem] md:px-8',
        )}
        onKeyDownCapture={onWritingKey}
      >
        {!isMobile && (
          <div className="-mt-1 mb-2 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <FolderPicker
              folders={folders}
              folder={doc.folder}
              onPick={(path) => { void move(doc.id, path); reveal(path); }}
              className="min-w-0"
            />
            {doc.updated_at && (
              <span className="shrink-0" title={new Date(doc.updated_at).toLocaleString()}>· Edited {relTime(doc.updated_at)}</span>
            )}
          </div>
        )}
        {mode === 'read' ? (
          <h1 className="font-serif text-[2rem] md:text-[2.5rem] font-semibold leading-tight tracking-tight text-balance">
            {displayTitle(effectiveTitle(doc.title, doc.content))}
          </h1>
        ) : (
          <Textarea
            ref={titleRef}
            value={doc.title}
            rows={1}
            readOnly={loading}
            placeholder={doc.content.trim() ? effectiveTitle('', doc.content) : 'Untitled'}
            aria-label="Title"
            onChange={(e) => edit({ title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
                e.preventDefault();
                focusBody();
              }
            }}
            className="min-h-0 overflow-hidden rounded-none border-0 bg-transparent p-0 font-serif text-[2rem] md:text-[2.5rem] font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/35 focus-visible:shadow-none"
          />
        )}
        <div className="mt-5 flex flex-1 flex-col">
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-8/12" />
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
              <MarkdownEditor
                key={doc.key}
                ref={editorRef}
                value={doc.content}
                onChange={(v) => edit({ content: v })}
                mode={mode}
                placeholder={mode === 'read' ? 'Nothing written yet.' : 'Write, or type / for more'}
                ariaLabel="Note"
                fill
                vim={vimKeys}
                vimStatus={vimHost}
                onSave={() => { void flush(); }}
              />
            </Suspense>
          )}
        </div>
      </motion.article>
    </div>
  );

  // Desktop: the note's controls (counts, save state, view, ⋯, details).
  const controls = doc && (
    <>
      <span className="hidden xl:inline">{counts.words.toLocaleString()} {counts.words === 1 ? 'word' : 'words'} · {counts.characters.toLocaleString()} {counts.characters === 1 ? 'character' : 'characters'}</span>
      <span className="xl:hidden" title={`${counts.characters.toLocaleString()} characters`}>{counts.words.toLocaleString()} {counts.words === 1 ? 'word' : 'words'}</span>
      {doc.backlinks.length > 0 && (
        <button type="button" className="rounded hover:text-foreground" onClick={openDetails}>
          · {doc.backlinks.length} {doc.backlinks.length === 1 ? 'backlink' : 'backlinks'}
        </button>
      )}
      <SaveState status={status} onRetry={() => { void flush(); }} />
      {modeSwitch}
      {overflowMenu}
      {!showDetailsRail && (
        <Button variant="ghost" size="icon-sm" className="size-8 rounded-full" onClick={openDetails} title="Show details" aria-label="Show details">
          <PanelRight className="size-4" />
        </Button>
      )}
    </>
  );
  const showLibraryButton = (!libraryOpen || focus) && (
    <Button
      variant="ghost" size="icon-sm"
      onClick={() => { setFocus(false); setLibraryOpen(true); }}
      title="Show library" aria-label="Show library"
      className="size-8 rounded-full"
    >
      <PanelLeft className="size-4" />
    </Button>
  );

  // Without Vim the controls float bottom-right, out of the text's way, and
  // fade while you type. With Vim they sit in a fixed status line with Vim's mode.
  const statusLine = doc && !isMobile && (vimKeys ? (
    <VimStatusBar ref={setVimHost} leading={showLibraryButton}>{controls}</VimStatusBar>
  ) : (
    <>
      {showLibraryButton && (
        <div className={cn('absolute bottom-3 left-3 z-10 rounded-full bg-[hsl(var(--surface-container-low))] p-0.5 transition-opacity duration-300', chromeHidden && 'pointer-events-none opacity-0')}>
          {showLibraryButton}
        </div>
      )}
      <div
        className={cn(
          'absolute bottom-3 right-3 z-10 flex h-10 items-center gap-1 rounded-full bg-[hsl(var(--surface-container-low))] pl-3.5 pr-1 text-xs tabular-nums text-muted-foreground shadow-[var(--m3-elev-1)] transition-opacity duration-300',
          chromeHidden && 'pointer-events-none opacity-0',
        )}
      >
        {controls}
      </div>
    </>
  ));

  return (
    <div
      className="page-fade-in flex flex-1 min-h-0 overflow-hidden"
      // The rails' bottom buttons line up with the Vim status line when it shows.
      style={vimKeys && doc && !isMobile ? { '--notes-foot-h': '36px' } as CSSProperties : undefined}
    >
      <AnimatePresence initial={false}>
        {showLibraryRail && (
          <Rail key="library" side="left" width={libraryWidth} defaultWidth={LIBRARY_DEFAULT} onResize={setLibraryWidth}>
            <LibraryRail {...railProps} onCollapse={() => setLibraryOpen(false)} />
          </Rail>
        )}
      </AnimatePresence>

      <main
        className="relative flex min-w-0 flex-1 flex-col bg-background"
        style={{ paddingTop: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 4px)' : undefined }}
      >
        {doc ? (
          <>
            {topBar}
            {writing}
            {statusLine}
          </>
        ) : isMobile ? (
          <div className="flex min-h-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom,0px)+76px)]">
            <LibraryRail {...railProps} />
          </div>
        ) : (
          <NothingOpen
            notes={allNotes}
            onOpen={openNote}
            onNew={() => startNew('')}
            showLibrary={!libraryOpen}
            onShowLibrary={() => setLibraryOpen(true)}
          />
        )}
      </main>

      <AnimatePresence initial={false}>
        {showDetailsRail && (
          <Rail key="details" side="right" width={detailsWidth} defaultWidth={DETAILS_DEFAULT} onResize={setDetailsWidth}>
            {details}
          </Rail>
        )}
      </AnimatePresence>
      {!isWide && (
        <Sheet open={detailsSheet && !!doc} onOpenChange={setDetailsSheet}>
          <SheetContent side="right" className="w-[90vw] max-w-[340px] p-0 pt-[env(safe-area-inset-top)]">
            <SheetHeader className="sr-only"><SheetTitle>Details</SheetTitle></SheetHeader>
            {details}
          </SheetContent>
        </Sheet>
      )}

      <MoveDialog
        open={!!moveTarget}
        title={displayTitle(moveTarget?.title ?? '')}
        folders={folders}
        current={moveTarget?.folder ?? ''}
        onOpenChange={(o) => { if (!o) setMoveTarget(null); }}
        onPick={(path) => {
          if (moveTarget) { void move(moveTarget.id, path); reveal(path); }
          setMoveTarget(null);
        }}
      />
    </div>
  );
}

/** Wide enough for the details rail beside the text (lg). */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setWide(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return wide;
}

function Rail({ side, width, defaultWidth, onResize, className, children }: {
  side: 'left' | 'right';
  width: number;
  /** Where a double-click on the edge goes back to. */
  defaultWidth: number;
  /** Lets the rail's inner edge be dragged (double-click resets). */
  onResize?: (width: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const startDrag = (e: React.PointerEvent) => {
    if (!onResize || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    setDragging(true);
    const move = (ev: PointerEvent) => onResize(clampRail(w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0, transition: { duration: 0.16, ease: EASE } }}
      // Follow the pointer exactly while dragging; ease only on open/close.
      transition={dragging ? { duration: 0 } : { duration: 0.22, ease: EASE }}
      className={cn(
        'relative flex shrink-0 overflow-hidden bg-[hsl(var(--surface-container-low))]',
        side === 'left' ? 'order-first' : 'order-last',
        className,
      )}
    >
      <div className="h-full shrink-0" style={{ width }}>{children}</div>
      {onResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize"
          title="Drag to resize · double-click to reset"
          onPointerDown={startDrag}
          onDoubleClick={() => onResize(defaultWidth)}
          className={cn(
            'group/resize absolute top-0 z-10 h-full w-1.5 cursor-col-resize',
            side === 'left' ? 'right-0' : 'left-0',
          )}
        >
          <span className={cn(
            'absolute inset-y-0 w-0.5 transition-colors',
            side === 'left' ? 'right-0' : 'left-0',
            dragging ? 'bg-[hsl(var(--primary))]' : 'group-hover/resize:bg-[hsl(var(--primary)/0.5)]',
          )}
          />
        </div>
      )}
    </motion.aside>
  );
}

function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  // Reserved slot: the state changes in place, nothing beside it moves.
  return (
    <span className="flex w-16 shrink-0 items-center justify-end gap-1.5 pr-1 text-xs text-muted-foreground" aria-live="polite">
      {status === 'saving' && (<><M3CookieLoader size="xs" tone="primary" /> Saving</>)}
      {status === 'saved' && 'Saved'}
      {status === 'error' && (
        <button type="button" onClick={onRetry} className="font-medium text-destructive hover:underline">Retry save</button>
      )}
    </span>
  );
}

function NothingOpen({ notes, onOpen, onNew, showLibrary, onShowLibrary }: {
  notes: NoteListItem[];
  onOpen: (id: number) => void;
  onNew: () => void;
  showLibrary: boolean;
  onShowLibrary: () => void;
}) {
  const recent = useMemo(
    () => [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8),
    [notes],
  );
  return (
    <div className="stable-scrollbar flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[64rem] px-5 pt-10 pb-24 md:px-8 md:pt-[84px]">
        <div className="flex items-center gap-2">
          {showLibrary && (
            <Button variant="ghost" size="icon-sm" className="-ml-2 rounded-full" onClick={onShowLibrary} title="Show library" aria-label="Show library">
              <PanelLeft className="size-4" />
            </Button>
          )}
          <h1 className="flex-1 font-serif text-[2rem] font-semibold tracking-tight">Notes</h1>
          <Button onClick={onNew} title="New note · Alt+N"><FilePlus className="size-4" /> New note</Button>
        </div>
        {recent.length > 0 && (
          <section className="mt-8" aria-label="Recently edited">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recently edited</h2>
            <div className="-mx-3 flex flex-col">
              {recent.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onOpen(n.id)}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[hsl(var(--surface-container))]"
                >
                  <span className="min-w-0 flex-1 truncate">{displayTitle(n.title)}</span>
                  {n.folder && <span className="max-w-[40%] shrink-0 truncate text-sm text-muted-foreground">{n.folder.split('/').join(' / ')}</span>}
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{relTime(n.updated_at)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
