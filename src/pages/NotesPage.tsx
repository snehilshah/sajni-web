import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

import { notes as notesApi } from '@/api';
import type { BacklinkRef, NoteFolder } from '@/types';
import { useNotes, useNoteFolders } from '@/queries/notes';
import { qk } from '@/queries/keys';
import RichEditor from '@/components/editor/RichEditor';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { PageChrome, PageShellTabs, chromeClearance } from '@/components/PageShell';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import {
  Trash2, Search, Save, Link as LinkIcon, FileText, X,
  ChevronRight, ChevronDown, Folder, FolderPlus, FolderOpen, FilePlus, MoreHorizontal,
  PanelLeftClose, PanelLeft, FolderInput as FolderMoveIcon, Pin, PinOff, ArrowUpRight,
} from '@/components/ui/icons';

function deriveTitle(content: string): string {
  for (const raw of content.split('\n')) {
    let line = raw.trim();
    line = line.replace(/^#+\s*/, '');
    if (line) return line.length > 80 ? line.slice(0, 80) : line;
  }
  return 'Untitled';
}

interface NoteListItem {
  id: number; title: string; folder: string; description: string; pinned: boolean; tags: string[]; created_at: string; updated_at: string;
}

interface TreeNode {
  type: 'folder' | 'note';
  name: string;
  path: string; // folder path; for note, the parent folder
  pinned?: boolean;
  note?: NoteListItem;
  children: TreeNode[];
}

const SIDEBAR_KEY = 'sajni:notes-sidebar';
const EXPANDED_KEY = 'sajni:notes-expanded';

function buildTree(notes: NoteListItem[], folders: NoteFolder[]): TreeNode {
  const root: TreeNode = { type: 'folder', name: '', path: '', children: [] };
  const folderMap = new Map<string, TreeNode>();
  folderMap.set('', root);
  const pinnedFolders = new Set(folders.filter((f) => f.pinned).map((f) => f.path));

  // Ensure all folder paths exist as nodes (including parents)
  const allPaths = new Set<string>(folders.map((f) => f.path));
  for (const f of folders) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) allPaths.add(parts.slice(0, i).join('/'));
  }
  for (const n of notes) {
    if (n.folder) {
      const parts = n.folder.split('/');
      for (let i = 1; i <= parts.length; i++) allPaths.add(parts.slice(0, i).join('/'));
    }
  }

  // Create folder nodes in path order so parents exist before children
  const sortedPaths = Array.from(allPaths).sort((a, b) => a.localeCompare(b));
  for (const p of sortedPaths) {
    if (folderMap.has(p)) continue;
    const idx = p.lastIndexOf('/');
    const parentPath = idx >= 0 ? p.slice(0, idx) : '';
    const name = idx >= 0 ? p.slice(idx + 1) : p;
    const node: TreeNode = { type: 'folder', name, path: p, pinned: pinnedFolders.has(p), children: [] };
    folderMap.set(p, node);
    folderMap.get(parentPath)?.children.push(node);
  }

  // Attach notes
  for (const n of notes) {
    const parent = folderMap.get(n.folder) || root;
    parent.children.push({
      type: 'note',
      name: n.title || 'Untitled',
      path: n.folder,
      pinned: n.pinned,
      note: n,
      children: [],
    });
  }

  // Sort: folders first, then notes; pinned float to the top of each group.
  const sortNode = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) if (c.type === 'folder') sortNode(c);
  };
  sortNode(root);
  return root;
}

export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRef[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loadingNote, setLoadingNote] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [showNewFolder, setShowNewFolder] = useState<string | null>(null); // parent path or null for closed
  const [newFolderName, setNewFolderName] = useState('');
  const [moveTarget, setMoveTarget] = useState<NoteListItem | null>(null);

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch {}
  }, [sidebarOpen]);
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expandedFolders))); } catch {}
  }, [expandedFolders]);

  // Debounce search into the query param so each keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const { data: notesData, isLoading: loading } = useNotes(debounced ? { search: debounced } : undefined);
  const { data: foldersData } = useNoteFolders();
  const notesList = (notesData ?? []) as NoteListItem[];
  const folders = (foldersData ?? []) as NoteFolder[];

  // Editor writes go straight through notesApi (single-doc surface); this
  // refreshes the cached list/folders + any other notes view after a write.
  const loadAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.notes.all });
  }, [qc]);

  // Initial select via URL ?id=X
  useEffect(() => {
    const idParam = params.get('id');
    if (idParam) {
      const id = parseInt(idParam, 10);
      if (!Number.isNaN(id)) selectNote(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tree = useMemo(() => buildTree(notesList, folders), [notesList, folders]);

  async function selectNote(id: number) {
    setLoadingNote(true);
    setDrafting(false);
    dirtyRef.current = false;
    try {
      const note = await notesApi.get(id);
      setSelectedId(note.id);
      setTitle(note.title);
      setFolder(note.folder || '');
      setDescription(note.description || '');
      setContent(note.content || '');
      setTags(note.tags || []);
      setBacklinks(note.backlinks || []);
      // Auto-expand ancestors
      if (note.folder) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          const parts = note.folder.split('/');
          for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
          return next;
        });
      }
      const next = new URLSearchParams(params);
      next.set('id', String(note.id));
      setParams(next, { replace: true });
    } finally {
      setLoadingNote(false);
    }
  }

  const handleNew = (parentFolder?: string) => {
    setSelectedId(null);
    setTitle('');
    setFolder(parentFolder || '');
    setDescription('');
    setContent('');
    setTags([]);
    setBacklinks([]);
    dirtyRef.current = false;
    setDrafting(true);
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  };

  const performSave = useCallback(async (silent = false) => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle && !trimmedContent) return;
    const effectiveTitle = trimmedTitle || deriveTitle(content);
    if (effectiveTitle !== title) setTitle(effectiveTitle);
    if (!silent) setSavingState('saving');
    try {
      let id = selectedId;
      if (id) {
        await notesApi.update(id, { title: effectiveTitle, content, description });
      } else {
        const res = await notesApi.create(effectiveTitle, content, folder, description);
        id = res.id;
        setSelectedId(id);
        const next = new URLSearchParams(params);
        next.set('id', String(id));
        setParams(next, { replace: true });
      }
      const note = await notesApi.get(id!);
      setTags(note.tags || []);
      setBacklinks(note.backlinks || []);
      setFolder(note.folder || '');
      setSavingState('saved');
      setTimeout(() => setSavingState((s) => (s === 'saved' ? 'idle' : s)), 1400);
      dirtyRef.current = false;
      setDrafting(false);
      loadAll();
    } catch (err) {
      console.error('[notes] save failed', err);
      toast.error(`Couldn't save note: ${msg(err, 'unknown error')}`);
      setSavingState('idle');
    }
  }, [title, content, description, folder, selectedId, params, setParams, loadAll]);

  // Debounced auto-save — fires once content OR title becomes non-empty.
  useEffect(() => {
    if (loadingNote) return;
    if (!dirtyRef.current) return;
    if (!title.trim() && !content.trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => performSave(true), 1200);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [title, content, description, performSave, loadingNote]);

  // Ctrl/Cmd+S forces an immediate save and swallows the browser's
  // "save page" dialog. Autosave still runs; this is the muscle-memory path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (title.trim() || content.trim()) performSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [performSave, title, content]);

  const handleTitleChange = (v: string) => { dirtyRef.current = true; setTitle(v); };
  const handleContentChange = (v: string) => { dirtyRef.current = true; setContent(v); };
  const handleDescriptionChange = (v: string) => { dirtyRef.current = true; setDescription(v); };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirmDialog(`Delete "${title || 'Untitled'}"?`))) return;
    await notesApi.delete(selectedId);
    handleNew();
    loadAll();
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) { setShowNewFolder(null); return; }
    const parent = showNewFolder ?? '';
    const fullPath = parent ? `${parent}/${trimmed}` : trimmed;
    await notesApi.createFolder(fullPath);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      const parts = fullPath.split('/');
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
      return next;
    });
    setShowNewFolder(null);
    setNewFolderName('');
    loadAll();
  };

  const handleDeleteFolder = async (path: string) => {
    if (!(await confirmDialog({
      title: 'Delete folder?',
      description: `Delete folder "${path}" and all notes inside it? This cannot be undone.`,
      confirmText: 'Delete folder',
    }))) return;
    try {
      await notesApi.deleteFolder(path);
      if (selectedId && (folder === path || folder.startsWith(`${path}/`))) handleNew();
      loadAll();
    } catch (e) {
      toast.error(msg(e, 'Cannot delete folder'));
    }
  };

  const handleMoveNote = async (noteId: number, newFolder: string) => {
    await notesApi.update(noteId, { folder: newFolder });
    if (selectedId === noteId) setFolder(newFolder);
    setMoveTarget(null);
    loadAll();
  };

  const handleTogglePinNote = async (note: NoteListItem) => {
    await notesApi.update(note.id, { pinned: !note.pinned });
    loadAll();
  };

  const handleTogglePinFolder = async (path: string, pinned: boolean) => {
    await notesApi.pinFolder(path, pinned);
    loadAll();
  };

  // Pinned state of the open note, resolved from the cached list so the
  // header button stays honest after tree-side toggles.
  const selectedNote = selectedId ? notesList.find((n) => n.id === selectedId) : undefined;

  const breadcrumb = useMemo(() => {
    if (!folder) return [];
    return folder.split('/');
  }, [folder]);

  const treeBody = (
    <>
      <div className="p-2.5 border-b border-sidebar-border/60 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 pr-7 text-xs"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            onClick={() => { handleNew(''); setMobileTreeOpen(false); }}
            size="xs" variant="ghost"
            className="flex-1 justify-start gap-1.5 font-normal text-xs"
          >
            <FilePlus className="size-3.5" /> New note
          </Button>
          <Button onClick={() => { setShowNewFolder(''); setNewFolderName(''); }} size="xs" variant="ghost" className="flex-1 justify-start gap-1.5 font-normal text-xs">
            <FolderPlus className="size-3.5" /> New folder
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        {loading ? (
          <div className="px-2 py-2 flex flex-col gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : tree.children.length === 0 && showNewFolder !== '' ? (
          <div className="text-center text-xs text-muted-foreground py-12 px-3">
            {search ? 'No notes match' : 'No notes yet — start writing'}
          </div>
        ) : (
          <>
            {showNewFolder === '' && (
              <FolderInput
                depth={0}
                value={newFolderName}
                onChange={setNewFolderName}
                onConfirm={handleCreateFolder}
                onCancel={() => { setShowNewFolder(null); setNewFolderName(''); }}
              />
            )}
            <TreeView
              node={tree}
              depth={0}
              expanded={expandedFolders}
              selectedId={selectedId}
              showNewFolderUnder={showNewFolder}
              newFolderValue={newFolderName}
              onNewFolderChange={setNewFolderName}
              onToggle={toggleFolder}
              onSelectNote={(id) => { selectNote(id); setMobileTreeOpen(false); }}
              onNewNoteIn={(p) => { handleNew(p); setMobileTreeOpen(false); }}
              onNewSubfolder={(p) => { setShowNewFolder(p); setNewFolderName(''); }}
              onDeleteFolder={handleDeleteFolder}
              onMoveNote={(n) => setMoveTarget(n)}
              onTogglePinNote={handleTogglePinNote}
              onTogglePinFolder={handleTogglePinFolder}
              onCreateFolder={handleCreateFolder}
              onCancelNewFolder={() => { setShowNewFolder(null); setNewFolderName(''); }}
            />
          </>
        )}
      </div>
    </>
  );

  // Landing = index ledger, full width: the ledger's folder sections ARE the
  // navigation there, so the vault sidebar (and its toggle) only exist once a
  // note is open or being drafted.
  const onLanding = !selectedId && !drafting && !loadingNote && !title && !content;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden page-fade-in">
      {/* Vault corner island — desktop, editor view only. Sits top-left,
          mirroring the search island top-right, so the pill itself never has
          to host (or move for) the sidebar toggle. */}
      {!onLanding && <button
        type="button"
        onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? 'Hide vault' : 'Show vault'}
        aria-label={sidebarOpen ? 'Hide vault' : 'Show vault'}
        className="fixed z-50 hidden md:inline-flex items-center justify-center size-12 rounded-full bg-[hsl(var(--surface-container-high))] border border-[hsl(var(--outline-variant))] shadow-[var(--m3-elev-2)] text-muted-foreground hover:bg-[hsl(var(--surface-container-highest))] hover:text-foreground transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16 }}
      >
        {sidebarOpen ? <PanelLeftClose className="size-[18px]" /> : <PanelLeft className="size-[18px]" />}
      </button>}

      {/* Islands pill — page-level and viewport-centered, so toggling
          the vault never shifts it. */}
      <PageChrome
        title="Notes"
        navigation={
          <PageShellTabs
            bare
            ariaLabel="Notes sections"
            value="notes"
            options={[
              { value: 'notes', label: 'Vault' },
              { value: 'memos', label: 'Memos' },
            ]}
            onChange={(v) => { if (v === 'memos') setParams({ tab: 'memos' }); }}
          />
        }
        actions={
          <>
            {isMobile && (
              <Button
                variant="ghost" size="icon-sm"
                onClick={() => setMobileTreeOpen(true)}
                className="shrink-0 rounded-full"
                title="Open vault"
              >
                <PanelLeft className="size-4" />
              </Button>
            )}
            <SaveIndicator state={savingState} canSave={!!title.trim() || !!content.trim()} onSave={() => performSave()} />
            {selectedId && (
              <>
                <Button
                  variant="ghost" size="icon-sm"
                  onClick={() => selectedNote && handleTogglePinNote(selectedNote)}
                  className={`rounded-full ${selectedNote?.pinned ? 'text-primary' : ''}`}
                  title={selectedNote?.pinned ? 'Unpin note' : 'Pin note'}
                >
                  {selectedNote?.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setMoveTarget(notesList.find((n) => n.id === selectedId) || null)} title="Move to folder">
                  <FolderMoveIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={handleDelete} className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete">
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => handleNew('')} className="gap-1.5" title="New note">
              <FilePlus className="size-3.5" />
              <span className="hidden sm:inline">New note</span>
            </Button>
          </>
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop vault sidebar */}
        <AnimatePresence initial={false} mode="popLayout">
          {sidebarOpen && !onLanding && (
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="hidden md:flex md:pt-[68px] border-r border-border bg-sidebar/60 flex-col shrink-0 overflow-hidden"
            >
              {treeBody}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile vault — left sheet */}
        <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
          <SheetContent
            side="left"
            className="md:hidden w-[86vw] max-w-[320px] p-0 bg-sidebar text-sidebar-foreground flex flex-col"
          >
            <SheetHeader className="p-3 pt-12">
              <SheetTitle className="serif text-base normal-case tracking-tight">Vault</SheetTitle>
            </SheetHeader>
            {treeBody}
          </SheetContent>
        </Sheet>

        {/* Editor body — fills remaining width; pads below the floating
            pills (primary + Notes pill are fixed islands). */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ paddingTop: chromeClearance(isMobile) }}>
          {/* Index landing — folder-sectioned ledger when no note is open
              and not actively drafting a new one. */}
          {onLanding ? (
            <NotesLedger
              notes={notesList}
              loading={loading}
              onPick={(id) => selectNote(id)}
              onNew={() => handleNew('')}
            />
          ) : (
            <div className="w-full max-w-[88rem] mx-auto px-4 md:px-8 lg:px-10 pt-6 md:pt-8 pb-32 flex flex-col gap-5 min-h-full">
              <AnimatePresence initial={false} mode="wait">
              {loadingNote ? (
                <motion.div
                  key="note-loading"
                  initial={{ opacity: 0, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(2px)' }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-col gap-5"
                >
                  <Skeleton className="h-14 w-3/4" />
                  <Skeleton className="h-64 w-full" />
                </motion.div>
              ) : (
                <motion.div
                  key="note-editor"
                  initial={{ opacity: 0, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(2px)' }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-col gap-5"
                >
                  {/* Folder path — was the header breadcrumb; now sits
                      quietly above the title since the pill owns chrome. */}
                  {breadcrumb.length > 0 && (
                    <div className="mono text-xs tracking-[0.14em] uppercase text-muted-foreground -mb-3 flex items-center gap-1 min-w-0">
                      {breadcrumb.map((seg, i) => (
                        <span key={i} className="flex items-center gap-1 min-w-0">
                          <span className="truncate">{seg}</span>
                          {i < breadcrumb.length - 1 && <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />}
                        </span>
                      ))}
                    </div>
                  )}
                  <Input
                    type="text"
                    placeholder="Untitled"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full h-auto px-0 py-1 bg-transparent border-none outline-none focus-visible:shadow-none text-4xl md:text-5xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/30"
                  />

                  {/* One-line description — surfaces on the Notes home cards. */}
                  <Input
                    type="text"
                    placeholder="Add a description…"
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    className="w-full h-auto -mt-2 px-0 py-0.5 bg-transparent border-none outline-none focus-visible:shadow-none text-base md:text-lg text-muted-foreground placeholder:text-muted-foreground/30"
                  />

                  <RichEditor
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Type / for commands. Use [[ to link to other notes."
                    fill
                  />
                </motion.div>
              )}
              </AnimatePresence>

              {tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap pt-3 border-t border-border/50">
                  {tags.map((tag) => <TagPill key={tag} tag={tag} />)}
                </div>
              )}

              {backlinks.length > 0 && (
                <div className="rounded-lg border border-border bg-card mt-2">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/30">
                    <LinkIcon className="size-3.5 text-primary" />
                    <span className="text-xs font-medium">{backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="p-2">
                    {backlinks.map((bl, i) => (
                      <div key={i} className="text-sm py-1 px-1 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs capitalize shrink-0">{bl.source_type}</Badge>
                        <span className="truncate">{bl.title || 'Untitled'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Move-to-folder dialog (sits at page root, outside the editor scroll) */}
      <Dialog open={!!moveTarget} onOpenChange={(o) => { if (!o) setMoveTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Move note</DialogTitle>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-0.5">{moveTarget?.title || 'Untitled'}</p>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            <FolderRow
              label="(root)"
              path=""
              active={moveTarget?.folder === ''}
              onClick={() => moveTarget && handleMoveNote(moveTarget.id, '')}
            />
            {folders.map((f) => (
              <FolderRow
                key={f.path}
                label={f.path}
                path={f.path}
                active={moveTarget?.folder === f.path}
                onClick={() => moveTarget && handleMoveNote(moveTarget.id, f.path)}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Tree view ---------------- */

interface TreeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: number | null;
  showNewFolderUnder: string | null;
  newFolderValue: string;
  onNewFolderChange: (v: string) => void;
  onToggle: (path: string) => void;
  onSelectNote: (id: number) => void;
  onNewNoteIn: (path: string) => void;
  onNewSubfolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveNote: (n: NoteListItem) => void;
  onTogglePinNote: (n: NoteListItem) => void;
  onTogglePinFolder: (path: string, pinned: boolean) => void;
  onCreateFolder: () => void;
  onCancelNewFolder: () => void;
}

function TreeView(props: TreeViewProps) {
  return (
    <div className="flex flex-col">
      {props.node.children.map((child) => {
        if (child.type === 'folder') {
          const isExpanded = props.expanded.has(child.path);
          return (
            <div key={`f:${child.path}`}>
              <FolderRowItem
                node={child}
                depth={props.depth}
                expanded={isExpanded}
                onToggle={() => props.onToggle(child.path)}
                onNewNote={() => props.onNewNoteIn(child.path)}
                onNewSubfolder={() => props.onNewSubfolder(child.path)}
                onDelete={() => props.onDeleteFolder(child.path)}
                onTogglePin={() => props.onTogglePinFolder(child.path, !child.pinned)}
              />
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {props.showNewFolderUnder === child.path && (
                      <FolderInput
                        depth={props.depth + 1}
                        value={props.newFolderValue}
                        onChange={props.onNewFolderChange}
                        onConfirm={props.onCreateFolder}
                        onCancel={props.onCancelNewFolder}
                      />
                    )}
                    <TreeView {...props} node={child} depth={props.depth + 1} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        }
        return (
          <NoteRowItem
            key={`n:${child.note!.id}`}
            note={child.note!}
            depth={props.depth}
            selected={props.selectedId === child.note!.id}
            onSelect={() => props.onSelectNote(child.note!.id)}
            onMove={() => props.onMoveNote(child.note!)}
            onTogglePin={() => props.onTogglePinNote(child.note!)}
          />
        );
      })}
    </div>
  );
}

function FolderRowItem({
  node, depth, expanded, onToggle, onNewNote, onNewSubfolder, onDelete, onTogglePin,
}: {
  node: TreeNode; depth: number; expanded: boolean;
  onToggle: () => void; onNewNote: () => void; onNewSubfolder: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group flex items-center gap-1 hover:bg-sidebar-accent/40 rounded-md text-sm cursor-pointer transition-colors relative"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={onToggle}
    >
      <button className="size-4 flex items-center justify-center text-muted-foreground shrink-0">
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      {expanded ? (
        <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
      ) : (
        <Folder className="size-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 truncate py-1 text-foreground/90 text-[13px]">{node.name}</span>
      {node.pinned && <Pin className="size-3 text-primary/70 shrink-0" aria-label="Pinned" />}
      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity pr-1">
        <button
          className="size-5 rounded hover:bg-sidebar-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="More"
        >
          <MoreHorizontal className="size-3" />
        </button>
      </div>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div
            className="absolute right-1 top-7 z-40 min-w-[160px] rounded-md border border-border bg-popover shadow-lg p-1 text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { onNewNote(); setMenuOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-accent flex items-center gap-2"
            >
              <FilePlus className="size-3.5" /> New note here
            </button>
            <button
              onClick={() => { onNewSubfolder(); setMenuOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-accent flex items-center gap-2"
            >
              <FolderPlus className="size-3.5" /> New subfolder
            </button>
            <button
              onClick={() => { onTogglePin(); setMenuOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-accent flex items-center gap-2"
            >
              {node.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {node.pinned ? 'Unpin folder' : 'Pin folder'}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => { onDelete(); setMenuOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
            >
              <Trash2 className="size-3.5" /> Delete folder
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NoteRowItem({
  note, depth, selected, onSelect, onMove, onTogglePin,
}: {
  note: NoteListItem; depth: number; selected: boolean;
  onSelect: () => void; onMove: () => void; onTogglePin: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-1.5 rounded-md py-1 cursor-pointer transition-colors text-[13px] ${
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/40 text-foreground/85'
      }`}
      style={{ paddingLeft: `${depth * 12 + 24}px`, paddingRight: '6px' }}
    >
      <FileText className="size-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate">{note.title || 'Untitled'}</span>
      {note.pinned && <Pin className="size-3 text-primary/70 shrink-0 group-hover:hidden" aria-label="Pinned" />}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
        className="opacity-0 group-hover:opacity-100 size-5 rounded hover:bg-sidebar-accent hidden group-hover:flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity"
        title={note.pinned ? 'Unpin' : 'Pin'}
      >
        {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onMove(); }}
        className="opacity-0 group-hover:opacity-100 size-5 rounded hover:bg-sidebar-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity"
        title="Move"
      >
        <FolderMoveIcon className="size-3" />
      </button>
    </div>
  );
}

function FolderInput({
  depth, value, onChange, onConfirm, onCancel,
}: {
  depth: number; value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: `${depth * 12 + 4}px`, paddingRight: '4px' }}
    >
      <FolderPlus className="size-3.5 text-muted-foreground shrink-0 ml-4" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onConfirm}
        placeholder="folder name"
        className="flex-1 h-6 px-1 text-[13px] bg-background border border-input rounded outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40"
      />
    </div>
  );
}

function FolderRow({ label, path, active, onClick }: { label: string; path: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
      }`}
    >
      <Folder className="size-3.5 text-muted-foreground" />
      <span className="font-mono text-xs">{path === '' ? <em className="not-italic text-muted-foreground">{label}</em> : label}</span>
    </button>
  );
}

function SaveIndicator({ state, canSave, onSave }: { state: 'idle' | 'saving' | 'saved'; canSave: boolean; onSave: () => void }) {
  if (state === 'saving') {
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><M3CookieLoader size="xs" tone="primary" />Saving</span>;
  }
  if (state === 'saved') {
    return <span className="flex items-center gap-1.5 text-xs text-primary"><Save className="size-3.5" />Saved</span>;
  }
  return (
    <Button variant="ghost" size="sm" onClick={onSave} disabled={!canSave} className="text-xs gap-1.5">
      <Save className="size-3.5" /> Save
    </Button>
  );
}

// NotesLedger — the landing is an index, not a card wall. Notes render as
// generous rows grouped into folder sections (pinned strip first, unfiled
// last), each section anchored by one oversized ghost initial in the left
// gutter — the atlas idea kept as structure (a book's table of contents)
// instead of per-card decoration. One container role per surface: rows sit
// on the page surface, only the pinned strip carries secondary-container.

function NoteRow({ note: n, pinned, onPick }: {
  note: NoteListItem;
  pinned?: boolean;
  onPick: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(n.id)}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 min-h-11 text-left outline-none transition-colors duration-150 ease-[var(--motion-ease-out)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] active:bg-[hsl(var(--on-surface)/0.1)] tap-highlight-none ${
        pinned
          ? 'hover:bg-[hsl(var(--on-secondary-container)/0.08)]'
          : 'hover:bg-[hsl(var(--surface-container))]'
      }`}
    >
      {pinned && <Pin className="size-3.5 shrink-0 text-[hsl(var(--on-secondary-container))]" aria-label="Pinned" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate serif text-[15px] font-medium tracking-[-0.01em] leading-snug text-foreground">
          {n.title || 'Untitled'}
        </span>
        {n.description && (
          <span className="block truncate text-sm text-muted-foreground leading-snug mt-0.5">
            {n.description}
          </span>
        )}
      </span>
      {(n.tags || []).slice(0, 2).map((t) => (
        <span key={t} className="chip chip-sage hidden sm:inline-flex max-w-[7rem] shrink-0">
          <span className="truncate">#{t}</span>
        </span>
      ))}
      <span className="mono text-xs tabular-nums text-muted-foreground shrink-0 w-14 text-right">
        {fmtRelTime(n.updated_at)}
      </span>
      <ArrowUpRight className="fine-group-hover-arrow size-4 shrink-0 text-foreground/45 opacity-0 -translate-x-1 translate-y-1 transition-[opacity,transform] duration-200 ease-[var(--motion-ease-out)] motion-reduce:transition-none" />
    </button>
  );
}

function NotesLedger({
  notes, loading, onPick, onNew,
}: {
  notes: NoteListItem[];
  loading: boolean;
  onPick: (id: number) => void;
  onNew: () => void;
}) {
  // Pinned strip + folder sections (full path label, unfiled last),
  // recency-ordered inside each.
  const { pinned, sections } = useMemo(() => {
    const pinned = notes.filter((n) => n.pinned)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const byFolder = new Map<string, NoteListItem[]>();
    for (const n of notes) {
      if (n.pinned) continue;
      const key = n.folder || '';
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(n);
    }
    const sections = Array.from(byFolder.entries())
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(([folder, items]) => ({
        folder,
        items: items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      }));
    return { pinned, sections };
  }, [notes]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 pt-5 md:pt-7 pb-16 flex flex-col gap-2.5">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 pt-5 md:pt-7 pb-16">
        <div className="rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <FileText className="size-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notes yet. Start one to fill your index.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onNew}>
            <FilePlus className="size-3.5" /> New note
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 md:px-8 pt-5 md:pt-7 pb-16 flex flex-col gap-7">
      {/* Pinned strip — the one tinted surface on the page. */}
      {pinned.length > 0 && (
        <section aria-label="Pinned notes" className="rounded-2xl bg-[hsl(var(--secondary-container)/0.45)] p-1.5">
          {pinned.map((n) => <NoteRow key={n.id} note={n} pinned onPick={onPick} />)}
        </section>
      )}

      {sections.map(({ folder, items }) => {
        const label = folder ? folder.split('/').join(' / ') : 'Notes';
        const initial = (folder ? folder.split('/').pop()! : 'N').charAt(0).toUpperCase();
        return (
          <section key={folder || '·'} aria-label={label} className="grid grid-cols-[40px_1fr] md:grid-cols-[64px_1fr] gap-x-2 md:gap-x-4">
            {/* Ghost initial gutter — one oversized glyph anchors the section. */}
            <div aria-hidden className="relative select-none pointer-events-none">
              <span className="sticky top-2 block serif text-[44px] md:text-[64px] leading-none font-medium text-foreground/[0.07] text-right">
                {initial}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5 px-3 pb-1.5">
                <h2 className="mono text-xs uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</h2>
                <span className="mono text-xs tabular-nums text-muted-foreground/60">{items.length}</span>
                <span className="flex-1 border-t border-[hsl(var(--outline-variant))] self-center" />
              </div>
              <div className="flex flex-col">
                {items.map((n) => <NoteRow key={n.id} note={n} onPick={onPick} />)}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function fmtRelTime(iso: string): string {
  try {
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
