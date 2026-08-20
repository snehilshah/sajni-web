import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { notes as notesApi } from '@/api';
import type { BacklinkRef, NoteFolder } from '@/types';
import { useNotes, useNoteFolders } from '@/queries/notes';
import { qk } from '@/queries/keys';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { SegmentedButton } from '@/components/ui/segmented-button';

const RichEditor = lazy(() => import('@/components/editor/RichEditor'));
import { M3CookieLoader } from '@/components/ui/shapes';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import {
  Trash2, Search, Save, Link as LinkIcon, FileText, X, ArrowLeft, Calendar, Edit3, Eye, LayoutGrid, StickyNote,
  ChevronRight, Folder, FolderPlus, FolderOpen, FilePlus, MoreHorizontal,
  PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, FolderInput as FolderMoveIcon, Pin, PinOff,
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

interface OutlineItem {
  level: number;
  text: string;
  index: number;
}

interface LinkedNoteRef {
  ref: string;
  title: string;
  id?: number;
}

type EditorMode = 'edit' | 'split' | 'preview';

interface TreeNode {
  type: 'folder' | 'note';
  name: string;
  path: string; // folder path; for note, the parent folder
  pinned?: boolean;
  note?: NoteListItem;
  children: TreeNode[];
}

// This key intentionally differs from the old Notes layout. Reusing the old
// preference could boot the redesigned page with its only library rail hidden
// and no selected note, making existing notes appear to have disappeared.
const SIDEBAR_KEY = 'sajni:notes-library-rail';
const EXPANDED_KEY = 'sajni:notes-expanded';
const EDITOR_MODE_KEY = 'sajni:notes-editor-mode';

function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const text = match[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '').trim();
    if (text) items.push({ level: match[1].length, text, index: items.length });
  }
  return items;
}

function extractLinkedNotes(markdown: string, notes: NoteListItem[], selectedId: number | null): LinkedNoteRef[] {
  const byTitle = new Map(notes.map((note) => [note.title.trim().toLowerCase(), note]));
  const seen = new Set<string>();
  const links: LinkedNoteRef[] = [];
  const pattern = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
  for (const match of markdown.matchAll(pattern)) {
    const ref = match[1].trim();
    const key = ref.toLowerCase();
    if (!ref || key.startsWith('task:') || seen.has(key)) continue;
    seen.add(key);
    const note = byTitle.get(key);
    if (note?.id === selectedId) continue;
    links.push({ ref, title: match[2]?.trim() || note?.title || ref, id: note?.id });
  }
  return links;
}

function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, ref: string, label?: string) => label || ref)
    .replace(/[#>*_~`()]/g, ' ')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function wordCount(markdown: string): number {
  const plain = plainText(markdown);
  return plain ? plain.split(/\s+/u).length : 0;
}

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
  const navigate = useNavigate();
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
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
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
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'outline' | 'backlinks' | 'linked'>('outline');
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    try {
      const stored = localStorage.getItem(EDITOR_MODE_KEY);
      return stored === 'split' || stored === 'preview' ? stored : 'edit';
    } catch { return 'edit'; }
  });
  const [drafting, setDrafting] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch {}
  }, [sidebarOpen]);
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expandedFolders))); } catch {}
  }, [expandedFolders]);
  useEffect(() => {
    try { localStorage.setItem(EDITOR_MODE_KEY, editorMode); } catch {}
  }, [editorMode]);

  // Debounce search into the query param so each keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const { data: notesData, isLoading: loading } = useNotes(debounced ? { search: debounced } : undefined);
  const { data: foldersData } = useNoteFolders();
  const notesList = useMemo(() => (notesData ?? []) as NoteListItem[], [notesData]);
  const folders = useMemo(() => (foldersData ?? []) as NoteFolder[], [foldersData]);
  const outline = useMemo(() => extractOutline(content), [content]);
  const linkedNotes = useMemo(() => extractLinkedNotes(content, notesList, selectedId), [content, notesList, selectedId]);
  const words = useMemo(() => wordCount(content), [content]);
  const characters = useMemo(() => Array.from(plainText(content)).length, [content]);

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
      setActiveFolder(note.folder || '');
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
    const targetFolder = parentFolder ?? activeFolder ?? '';
    setFolder(targetFolder);
    setActiveFolder(targetFolder);
    setDescription('');
    setContent('');
    setTags([]);
    setBacklinks([]);
    setEditorMode('edit');
    dirtyRef.current = false;
    setDrafting(true);
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: true });
  };

  const clearToBrowse = () => {
    setSelectedId(null);
    setTitle('');
    setFolder('');
    setDescription('');
    setContent('');
    setTags([]);
    setBacklinks([]);
    setDrafting(false);
    dirtyRef.current = false;
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
  const handleContentChange = (v: string) => {
    // TipTap can normalize its initial Markdown while constructing the editor.
    // Defer the parent update so that initialization never sets state during
    // RichEditor's render; regular typing still lands in the same microtask.
    queueMicrotask(() => {
      setContent((current) => {
        if (v === current) return current;
        dirtyRef.current = true;
        return v;
      });
    });
  };
  const handleDelete = async () => {
    if (!selectedId) return;
    if (!(await confirmDialog(`Delete "${title || 'Untitled'}"?`))) return;
    await notesApi.delete(selectedId);
    clearToBrowse();
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
      <header className="px-4 py-3.5 border-b border-sidebar-border/60 shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Notes</p>
            <p className="mt-0.5 text-2xl font-medium tracking-tight">Library</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{notesList.length} {notesList.length === 1 ? 'note' : 'notes'}</span>
        </div>
      </header>

      <div className="p-2.5 border-b border-sidebar-border/60 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes…"
            className="h-9 pl-8 pr-8 text-xs bg-[hsl(var(--surface-container))]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Button
            onClick={() => { handleNew(); setMobileTreeOpen(false); }}
            size="xs" variant="ghost"
            className="justify-start gap-1.5 font-normal text-xs"
          >
            <FilePlus className="size-3.5" /> New note
          </Button>
          <Button onClick={() => { setShowNewFolder(''); setNewFolderName(''); }} size="xs" variant="ghost" className="justify-start gap-1.5 font-normal text-xs">
            <FolderPlus className="size-3.5" /> New folder
          </Button>
        </div>
      </div>

      <section className="p-2 border-b border-sidebar-border/60 shrink-0" aria-label="Quick access">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick access</p>
        <button
          type="button"
          onClick={() => { setActiveFolder(null); setMobileTreeOpen(false); }}
          className={cn(
            'w-full min-h-11 md:min-h-9 flex items-center gap-2 rounded-lg px-2.5 text-sm text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
            selectedId === null && activeFolder === null
              ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
              : 'hover:bg-[hsl(var(--surface-container-high))] text-foreground/85',
          )}
        >
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="flex-1">All notes</span>
          <span className="tabular-nums text-muted-foreground">{notesList.length}</span>
        </button>
        <button
          type="button"
          onClick={() => { navigate('/memos'); setMobileTreeOpen(false); }}
          className="w-full min-h-11 md:min-h-9 flex items-center gap-2 rounded-lg px-2.5 text-sm text-left text-foreground/85 outline-none transition-colors hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <StickyNote className="size-3.5 text-muted-foreground" />
          <span>Scratch notes</span>
        </button>
        <button
          type="button"
          onClick={() => { navigate('/journal'); setMobileTreeOpen(false); }}
          className="w-full min-h-11 md:min-h-9 flex items-center gap-2 rounded-lg px-2.5 text-sm text-left text-foreground/85 outline-none transition-colors hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Calendar className="size-3.5 text-muted-foreground" />
          <span>Daily notes</span>
        </button>
      </section>

      <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1 stable-scrollbar">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Folders</p>
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
              onSelectFolder={(path) => { setActiveFolder(path); setMobileTreeOpen(false); }}
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

  const hasOpenNote = selectedId !== null || drafting || loadingNote;

  const scrollToOutline = (item: OutlineItem) => {
    const selector = editorMode === 'preview'
      ? '[aria-label="Rendered Markdown preview"] h1, [aria-label="Rendered Markdown preview"] h2, [aria-label="Rendered Markdown preview"] h3'
      : '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3';
    const headings = editorScrollRef.current?.querySelectorAll(selector);
    headings?.item(item.index)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const openBacklink = (backlink: BacklinkRef) => {
    setMobileInspectorOpen(false);
    if (backlink.source_type === 'note') {
      selectNote(backlink.source_id);
      return;
    }
    if (backlink.source_type === 'journal') {
      navigate(`/journal?date=${encodeURIComponent(backlink.title)}`);
      return;
    }
    if (backlink.source_type === 'memo') {
      navigate(`/memos?id=${backlink.source_id}`);
      return;
    }
    if (backlink.source_type === 'task') {
      window.dispatchEvent(new CustomEvent('task:open', { detail: { id: backlink.source_id } }));
    }
  };

  const inspector = (
    <NoteInspector
      title={title}
      hasOpenNote={hasOpenNote}
      tab={inspectorTab}
      onTabChange={setInspectorTab}
      outline={outline}
      backlinks={backlinks}
      linkedNotes={linkedNotes}
      tags={tags}
      onOutlinePick={scrollToOutline}
      onBacklinkPick={openBacklink}
      onLinkedPick={(link) => {
        if (link.id) selectNote(link.id);
        setMobileInspectorOpen(false);
      }}
    />
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden page-fade-in">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {sidebarOpen && (
            <motion.aside
              key="notebooks"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 264, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="hidden md:flex border-r border-[hsl(var(--outline-variant))] bg-sidebar text-sidebar-foreground flex-col shrink-0 overflow-hidden order-1"
            >
              {treeBody}
            </motion.aside>
          )}
        </AnimatePresence>

        <main
          className="flex flex-1 min-w-0 min-h-0 flex-col bg-background order-2"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isMobile ? 8 : 72}px)` }}
        >
          {!hasOpenNote ? (
            <BrowseEmpty
              showLibraryButton={isMobile || !sidebarOpen}
              onNew={() => handleNew()}
              onOpenLibrary={() => {
                if (isMobile) setMobileTreeOpen(true);
                else setSidebarOpen(true);
              }}
            />
          ) : (
            <>
              <div ref={editorScrollRef} className="flex-1 min-h-0 overflow-y-auto stable-scrollbar">
                <div className={cn(
                  'w-full mx-auto px-4 md:px-8 lg:px-10 pt-4 md:pt-5 pb-16 min-h-full flex flex-col',
                  editorMode === 'split' ? 'max-w-[100rem]' : 'max-w-5xl',
                )}>
                  {loadingNote ? (
                    <div className="flex flex-col gap-5">
                      <Skeleton className="h-12 w-3/4" />
                      <Skeleton className="h-72 w-full rounded-2xl" />
                    </div>
                  ) : (
                    <motion.div
                      key={selectedId ?? 'draft'}
                      initial={{ opacity: 0, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                      className="flex flex-1 min-h-0 flex-col gap-4"
                    >
                      <header className="flex items-start justify-between gap-x-5 gap-y-2 md:gap-y-4 flex-wrap">
                        <div className="flex-1 min-w-[16rem]">
                          <Button
                            variant="ghost" size="sm"
                            onClick={clearToBrowse}
                            className="md:hidden self-start -ml-2 mb-2 gap-1.5 text-muted-foreground"
                          >
                            <ArrowLeft className="size-4" /> Notes
                          </Button>
                          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {breadcrumb.length > 0 ? breadcrumb.map((segment, index) => (
                              <span key={`${segment}:${index}`} className="flex items-center gap-1 min-w-0">
                                <span className="truncate">{segment}</span>
                                {index < breadcrumb.length - 1 && <ChevronRight className="size-3 opacity-60" />}
                              </span>
                            )) : <span>Unfiled</span>}
                            {selectedNote?.updated_at && <span>· Edited {fmtRelTime(selectedNote.updated_at)}</span>}
                          </div>
                          {editorMode === 'preview' ? (
                            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight text-foreground">
                              {title || 'Untitled'}
                            </h1>
                          ) : (
                            <Input
                              type="text"
                              placeholder="Untitled"
                              value={title}
                              autoFocus={drafting}
                              onChange={(event) => handleTitleChange(event.target.value)}
                              className="w-full h-auto px-0 py-1 bg-transparent border-none outline-none focus-visible:shadow-none text-4xl md:text-5xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/30"
                            />
                          )}
                        </div>

                        <div className="flex w-full md:w-auto items-center justify-end gap-0.5 md:gap-1 flex-nowrap">
                          <SaveIndicator state={savingState} canSave={!!title.trim() || !!content.trim()} onSave={() => performSave()} />
                          {selectedId && (
                            <>
                              <Button
                                variant="ghost" size="icon-sm"
                                onClick={() => selectedNote && handleTogglePinNote(selectedNote)}
                                className={cn('rounded-full max-md:size-11', selectedNote?.pinned && 'text-primary')}
                                title={selectedNote?.pinned ? 'Unpin note' : 'Pin note'}
                                aria-label={selectedNote?.pinned ? 'Unpin note' : 'Pin note'}
                              >
                                {selectedNote?.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                              </Button>
                              <Button
                                variant="ghost" size="icon-sm"
                                className="rounded-full max-md:size-11"
                                onClick={() => setMoveTarget(notesList.find((note) => note.id === selectedId) || null)}
                                title="Move to folder" aria-label="Move to folder"
                              >
                                <FolderMoveIcon className="size-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon-sm" onClick={handleDelete}
                                className="rounded-full max-md:size-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete note" aria-label="Delete note"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                          <span className="w-px h-5 mx-0.5 md:mx-1 bg-[hsl(var(--outline-variant))]" aria-hidden />
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => setMobileTreeOpen(true)}
                            className="md:hidden rounded-full max-md:size-11"
                            title="Open library" aria-label="Open library"
                          >
                            <PanelLeft className="size-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => setSidebarOpen((open) => !open)}
                            className="hidden md:inline-flex rounded-full"
                            title={sidebarOpen ? 'Hide library' : 'Show library'}
                            aria-label={sidebarOpen ? 'Hide library' : 'Show library'}
                          >
                            {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => setMobileInspectorOpen(true)}
                            className="lg:hidden rounded-full max-md:size-11"
                            title="Open note context" aria-label="Open note context"
                          >
                            <PanelRight className="size-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon-sm"
                            onClick={() => setInspectorOpen((open) => !open)}
                            className="hidden lg:inline-flex rounded-full"
                            title={inspectorOpen ? 'Hide note context' : 'Show note context'}
                            aria-label={inspectorOpen ? 'Hide note context' : 'Show note context'}
                          >
                            {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRight className="size-4" />}
                          </Button>
                        </div>
                      </header>

                      {editorMode === 'split' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 border-y border-[hsl(var(--outline-variant))]">
                          <section className="min-w-0 py-3 lg:pr-6 lg:border-r border-[hsl(var(--outline-variant))]" aria-label="Edit note">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Edit</p>
                            <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
                              <RichEditor
                                value={content}
                                onChange={handleContentChange}
                                placeholder="Type / for commands. Use [[ to link to other notes."
                                className="[&_.ProseMirror>:first-child]:mt-0"
                                fill
                              />
                            </Suspense>
                          </section>
                          <section className="min-w-0 py-3 lg:pl-6 border-t lg:border-t-0 border-[hsl(var(--outline-variant))]" aria-label="Preview note">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
                            <MarkdownPreview content={content} />
                          </section>
                        </div>
                      ) : editorMode === 'preview' ? (
                        <div className="max-w-3xl w-full pb-12">
                          <MarkdownPreview content={content} empty="Nothing to preview yet." />
                        </div>
                      ) : (
                        <div className="flex flex-1 flex-col min-h-0 max-w-4xl w-full">
                          <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
                            <RichEditor
                              value={content}
                              onChange={handleContentChange}
                              placeholder="Type / for commands. Use [[ to link to other notes."
                              className="[&_.ProseMirror>:first-child]:mt-0"
                              fill
                            />
                          </Suspense>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
              <footer className="h-12 md:h-10 max-md:mb-[calc(env(safe-area-inset-bottom,0px)+76px)] px-2.5 md:px-5 shrink-0 border-t border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="min-w-0 flex items-center gap-1.5 md:gap-2 whitespace-nowrap">
                  <span aria-label={`${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`}>
                    <span className="sm:hidden">{words.toLocaleString()}w</span>
                    <span className="hidden sm:inline">{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
                  </span>
                  <span aria-hidden>·</span>
                  <span aria-label={`${characters.toLocaleString()} ${characters === 1 ? 'character' : 'characters'}`}>
                    <span className="sm:hidden">{characters.toLocaleString()}c</span>
                    <span className="hidden sm:inline">{characters.toLocaleString()} {characters === 1 ? 'character' : 'characters'}</span>
                  </span>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectorTab('backlinks');
                      if (window.matchMedia('(min-width: 1024px)').matches) setInspectorOpen(true);
                      else setMobileInspectorOpen(true);
                    }}
                    aria-label={`${backlinks.length.toLocaleString()} ${backlinks.length === 1 ? 'backlink' : 'backlinks'}`}
                    className="min-h-11 md:min-h-0 rounded px-1 py-0.5 hover:bg-[hsl(var(--surface-container-high))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="sm:hidden">{backlinks.length.toLocaleString()} links</span>
                    <span className="hidden sm:inline">{backlinks.length.toLocaleString()} {backlinks.length === 1 ? 'backlink' : 'backlinks'}</span>
                  </button>
                </div>
                <SegmentedButton
                  value={editorMode}
                  onChange={setEditorMode}
                  showCheck={false}
                  size="sm"
                  aria-label="Editor mode"
                  className="[&>button]:h-11 [&>button]:px-2 [&>button]:text-xs md:[&>button]:h-7"
                  options={[
                    { value: 'edit', label: 'Edit', icon: Edit3 },
                    { value: 'split', label: 'Split', icon: LayoutGrid },
                    { value: 'preview', label: 'Preview', icon: Eye },
                  ]}
                />
              </footer>
            </>
          )}
        </main>

        <AnimatePresence initial={false} mode="popLayout">
          {inspectorOpen && hasOpenNote && (
            <motion.aside
              key="inspector"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="hidden lg:flex shrink-0 overflow-hidden border-l border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-low))] order-3"
            >
              {inspector}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
        <SheetContent side="left" showCloseButton={false} className="md:hidden w-[88vw] max-w-[320px] p-0 pt-[env(safe-area-inset-top)] bg-sidebar text-sidebar-foreground flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Notebooks</SheetTitle></SheetHeader>
          {treeBody}
        </SheetContent>
      </Sheet>

      <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
        <SheetContent side="right" className="lg:hidden w-[90vw] max-w-[360px] p-0 bg-[hsl(var(--surface-container-low))] flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Note details</SheetTitle></SheetHeader>
          {inspector}
        </SheetContent>
      </Sheet>

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

/* ---------------- Workspace panes ---------------- */

function BrowseEmpty({
  showLibraryButton, onNew, onOpenLibrary,
}: {
  showLibraryButton: boolean;
  onNew: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div className="max-w-xs text-muted-foreground">
        <FileText className="size-10 mx-auto mb-3 opacity-25" />
        <p className="text-sm font-medium text-foreground">Choose a note to start writing</p>
        <p className="text-sm mt-1">Open one from your library, or begin a new long-form note.</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          {showLibraryButton && (
            <Button variant="outline" size="sm" onClick={onOpenLibrary}>
              <PanelLeft className="size-3.5" /> Open library
            </Button>
          )}
          <Button size="sm" onClick={onNew}>
            <FilePlus className="size-3.5" /> New note
          </Button>
        </div>
      </div>
    </div>
  );
}

function MarkdownPreview({ content, empty = 'Start writing to see the preview.' }: { content: string; empty?: string }) {
  if (!content.trim()) {
    return <p className="py-12 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <article className="prose prose-sajni dark:prose-invert max-w-none [&>:first-child]:mt-0" aria-label="Rendered Markdown preview">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </article>
  );
}

function NoteInspector({
  title, hasOpenNote, tab, onTabChange, outline, backlinks, linkedNotes, tags,
  onOutlinePick, onBacklinkPick, onLinkedPick,
}: {
  title: string;
  hasOpenNote: boolean;
  tab: 'outline' | 'backlinks' | 'linked';
  onTabChange: (tab: 'outline' | 'backlinks' | 'linked') => void;
  outline: OutlineItem[];
  backlinks: BacklinkRef[];
  linkedNotes: LinkedNoteRef[];
  tags: string[];
  onOutlinePick: (item: OutlineItem) => void;
  onBacklinkPick: (backlink: BacklinkRef) => void;
  onLinkedPick: (link: LinkedNoteRef) => void;
}) {
  const tabs = [
    { value: 'outline' as const, label: 'Outline' },
    { value: 'backlinks' as const, label: 'Backlinks' },
    { value: 'linked' as const, label: 'Linked' },
  ];
  return (
    <div className="w-full min-w-[288px] flex flex-col min-h-0">
      <header className="p-3 border-b border-[hsl(var(--outline-variant))] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="secondary" className="shrink-0">Note</Badge>
          <span className="text-sm font-semibold truncate">{title || (hasOpenNote ? 'Untitled' : 'Note details')}</span>
        </div>
        <nav aria-label="Note details" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[hsl(var(--surface-container))] p-1">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onTabChange(item.value)}
              className={cn(
                'h-8 rounded-lg px-2 text-xs font-medium transition-colors',
                tab === item.value
                  ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-container-high))]',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto stable-scrollbar">
        <section className="p-3" aria-label={tab}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tabs.find((item) => item.value === tab)?.label}</p>
          {tab === 'outline' && (outline.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {outline.map((item) => (
                <button
                  key={`${item.index}:${item.text}`}
                  type="button"
                  onClick={() => onOutlinePick(item)}
                  className="w-full rounded-md py-1.5 pr-2 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-container))] transition-colors truncate"
                  style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))}
            </div>
          ) : <InspectorEmpty>Headings in this note will appear here.</InspectorEmpty>)}

          {tab === 'backlinks' && (backlinks.length > 0 ? (
            <div className="flex flex-col gap-1">
              {backlinks.map((backlink) => (
                <button
                  key={`${backlink.source_type}:${backlink.source_id}`}
                  type="button"
                  onClick={() => onBacklinkPick(backlink)}
                  className="w-full rounded-lg p-2 text-left hover:bg-[hsl(var(--surface-container))] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <LinkIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{backlink.title || 'Untitled'}</span>
                  </span>
                  <span className="block pl-5.5 mt-0.5 text-xs capitalize text-muted-foreground">{backlink.source_type}</span>
                </button>
              ))}
            </div>
          ) : <InspectorEmpty>No other item links to this note yet.</InspectorEmpty>)}

          {tab === 'linked' && (linkedNotes.length > 0 ? (
            <div className="flex flex-col gap-1">
              {linkedNotes.map((link) => (
                <button
                  key={link.ref.toLowerCase()}
                  type="button"
                  onClick={() => onLinkedPick(link)}
                  disabled={!link.id}
                  className="w-full rounded-lg p-2 text-left enabled:hover:bg-[hsl(var(--surface-container))] disabled:opacity-55 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{link.title}</span>
                  </span>
                  {!link.id && <span className="block pl-5.5 mt-0.5 text-xs text-muted-foreground">Not created</span>}
                </button>
              ))}
            </div>
          ) : <InspectorEmpty>Use [[Note title]] to link another note.</InspectorEmpty>)}
        </section>

        <div className="h-px bg-[hsl(var(--outline-variant))]" />
        <section className="p-3" aria-label="Tags">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <TagPill key={tag} tag={tag} />)}</div>
          ) : <InspectorEmpty>Type #tag in the note to add one.</InspectorEmpty>}
        </section>
      </div>

    </div>
  );
}

function InspectorEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[hsl(var(--outline-variant))] px-3 py-4 text-xs leading-relaxed text-muted-foreground">{children}</p>;
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
  onSelectFolder: (path: string) => void;
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
    <div className="flex flex-col" role={props.depth === 0 ? 'tree' : 'group'}>
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
                onSelect={() => props.onSelectFolder(child.path)}
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

function countTreeNotes(node: TreeNode): number {
  return node.children.reduce((count, child) => count + (child.type === 'note' ? 1 : countTreeNotes(child)), 0);
}

function FolderRowItem({
  node, depth, expanded, onToggle, onSelect, onNewNote, onNewSubfolder, onDelete, onTogglePin,
}: {
  node: TreeNode; depth: number; expanded: boolean;
  onToggle: () => void; onSelect: () => void; onNewNote: () => void; onNewSubfolder: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const count = countTreeNotes(node);
  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={expanded}
      className="group relative my-px flex h-7 cursor-pointer items-center gap-1.5 rounded-[3px] pr-1 text-sm outline-none transition-colors hover:bg-[hsl(var(--surface-container-high))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))]"
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
      onClick={() => { onSelect(); onToggle(); }}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
          onToggle();
        }
      }}
    >
      {expanded ? (
        <FolderOpen className="size-4 text-muted-foreground shrink-0" />
      ) : (
        <Folder className="size-4 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 truncate text-foreground/90 text-[13px]">{node.name}</span>
      <span className="text-xs tabular-nums text-muted-foreground group-hover:hidden">{count}</span>
      {node.pinned && <Pin className="size-3 text-primary/70 shrink-0" aria-label="Pinned" />}
      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity pr-1">
        <button
          className="size-6 rounded-[3px] hover:bg-[hsl(var(--surface-container-highest))] flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="More"
          aria-label={`More options for ${node.name}`}
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
      role="treeitem"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group my-px flex h-7 cursor-pointer items-center gap-1.5 rounded-[3px] outline-none transition-colors text-[13px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--primary))] ${
        selected
          ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
          : 'hover:bg-[hsl(var(--surface-container-high))] text-foreground/85'
      }`}
      style={{ paddingLeft: `${depth * 14 + 26}px`, paddingRight: '4px' }}
    >
      <FileText className="size-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate">{note.title || 'Untitled'}</span>
      {note.pinned && <Pin className="size-3 text-primary/70 shrink-0 group-hover:hidden" aria-label="Pinned" />}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
        className="opacity-0 group-hover:opacity-100 size-6 rounded-[3px] hover:bg-[hsl(var(--surface-container-highest))] hidden group-hover:flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
        title={note.pinned ? 'Unpin' : 'Pin'}
        aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title || 'Untitled'}`}
      >
        {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onMove(); }}
        className="opacity-0 group-hover:opacity-100 size-6 rounded-[3px] hover:bg-[hsl(var(--surface-container-highest))] flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
        title="Move"
        aria-label={`Move ${note.title || 'Untitled'}`}
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
