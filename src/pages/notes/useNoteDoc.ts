import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { notes as notesApi } from '@/api';
import type { BacklinkRef, Note } from '@/types';
import { qk } from '@/queries/keys';
import { failureText } from '@/lib/errors';
import { effectiveTitle, type NoteListItem } from './model';

/** The open note (or a draft that isn't saved yet). */
export interface NoteDoc {
  /** Stable per open document: `note:<id>` or `draft:<n>`. */
  key: string;
  id: number | null;
  title: string;
  content: string;
  description: string;
  folder: string;
  tags: string[];
  backlinks: BacklinkRef[];
  created_at?: string;
  updated_at?: string;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Snapshot = { title: string; content: string; description: string };

const SAVE_DELAY = 600;
const LIST_KEY = ['notes', 'list'] as const;

function fromNote(n: Note): NoteDoc {
  return {
    key: `note:${n.id}`, id: n.id, title: n.title, content: n.content ?? '', description: n.description ?? '',
    folder: n.folder ?? '', tags: n.tags ?? [], backlinks: n.backlinks ?? [],
    created_at: n.created_at, updated_at: n.updated_at,
  };
}

/**
 * Loading and saving for the Notes page. Edits land in the UI at once (the
 * library's title, tags and order are patched in the query cache), and the
 * server catches up behind: one save at a time, sending only what changed.
 * Switching notes, closing or hiding the tab saves first.
 */
export function useNoteDoc() {
  const qc = useQueryClient();
  const [doc, setDocState] = useState<NoteDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const docRef = useRef<NoteDoc | null>(null);
  const savedRef = useRef<Snapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const openSeq = useRef(0);
  const draftSeq = useRef(0);

  const apply = useCallback((next: NoteDoc | null) => {
    docRef.current = next;
    setDocState(next);
  }, []);

  const patchList = useCallback((id: number, patch: Partial<NoteListItem>) => {
    qc.setQueriesData<NoteListItem[]>({ queryKey: LIST_KEY }, (old) => old?.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, [qc]);

  const patchDetail = useCallback((id: number, patch: Partial<Note>) => {
    qc.setQueryData<Note>(qk.notes.detail(id), (old) => (old ? { ...old, ...patch } : old));
  }, [qc]);

  const isDirty = useCallback(() => {
    const d = docRef.current;
    if (!d) return false;
    const s = savedRef.current;
    if (!s) return !!(d.title.trim() || d.content.trim());
    return effectiveTitle(d.title, d.content) !== s.title || d.content !== s.content || d.description !== s.description;
  }, []);

  const saveOnce = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    const title = effectiveTitle(d.title, d.content);
    const content = d.content;
    const description = d.description;

    if (d.id == null) {
      if (!title && !content.trim()) return;
      setStatus('saving');
      const res = await notesApi.create(title, content, d.folder, description);
      const item: NoteListItem = {
        id: res.id, title, folder: res.folder, description, pinned: false, tags: res.tags ?? [],
        created_at: res.created_at, updated_at: res.updated_at,
      };
      qc.setQueriesData<NoteListItem[]>({ queryKey: LIST_KEY }, (old) => (old ? [item, ...old.filter((n) => n.id !== res.id)] : old));
      qc.setQueryData<Note>(qk.notes.detail(res.id), { ...item, content, backlinks: [] });
      if (item.tags.length) void qc.invalidateQueries({ queryKey: qk.tags.all });
      const cur = docRef.current;
      if (cur?.key === d.key) {
        savedRef.current = { title, content, description };
        apply({ ...cur, key: `note:${res.id}`, id: res.id, folder: res.folder, tags: item.tags, created_at: res.created_at, updated_at: res.updated_at });
      }
      return;
    }

    const id = d.id;
    // Never save a note whose stored text hasn't loaded: it would overwrite it.
    const s = savedRef.current;
    if (!s) return;
    const body: { title?: string; content?: string; description?: string } = {};
    if (title !== s.title) body.title = title;
    if (content !== s.content) body.content = content;
    if (description !== s.description) body.description = description;
    if (!Object.keys(body).length) return;

    setStatus('saving');
    const res = await notesApi.update(id, body);
    const cur = docRef.current;
    if (cur?.id === id) savedRef.current = { ...s, ...body };
    const patch: Partial<NoteListItem> = { ...(body.title !== undefined && { title }), ...(body.description !== undefined && { description }) };
    if (res.updated_at) patch.updated_at = res.updated_at;
    if (res.tags) patch.tags = res.tags;
    patchList(id, patch);
    patchDetail(id, { ...patch, ...(body.content !== undefined && { content }) });
    if (res.tags && res.tags.join('\n') !== d.tags.join('\n')) void qc.invalidateQueries({ queryKey: qk.tags.all });
    if (cur?.id === id && (res.tags || res.updated_at)) {
      apply({ ...cur, ...(res.tags && { tags: res.tags }), ...(res.updated_at && { updated_at: res.updated_at }) });
    }
  }, [qc, apply, patchList, patchDetail]);

  /** Saves now (after any save already running). Resolves when done. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    chain.current = chain.current.then(async () => {
      if (!isDirty()) return;
      try {
        await saveOnce();
        setStatus('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setStatus((v) => (v === 'saved' ? 'idle' : v)), 1600);
      } catch (err) {
        setStatus('error');
        toast.error(failureText(err, "Couldn't save the note"), { id: 'note-save' });
      }
    });
    return chain.current;
  }, [isDirty, saveOnce]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, SAVE_DELAY);
  }, [flush]);

  /** Applies a local edit; the library title updates on the same frame. */
  const edit = useCallback((patch: Partial<Pick<NoteDoc, 'title' | 'content' | 'description'>>) => {
    const cur = docRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    if (next.title === cur.title && next.content === cur.content && next.description === cur.description) return;
    apply(next);
    if (cur.id != null && (patch.title !== undefined || (!next.title.trim() && patch.content !== undefined))) {
      const t = effectiveTitle(next.title, next.content);
      if (t !== effectiveTitle(cur.title, cur.content)) patchList(cur.id, { title: t });
    }
    schedule();
  }, [apply, patchList, schedule]);

  /** Opens a note; resolves with it (null if it couldn't be opened or another open won). */
  const open = useCallback(async (id: number): Promise<NoteDoc | null> => {
    if (docRef.current?.id === id) return docRef.current;
    const seq = ++openSeq.current;
    await flush();
    if (seq !== openSeq.current) return null;
    const cached = qc.getQueryData<Note>(qk.notes.detail(id));
    if (cached) {
      apply(fromNote(cached));
      savedRef.current = { title: cached.title, content: cached.content ?? '', description: cached.description ?? '' };
    } else {
      const item = qc.getQueryData<NoteListItem[]>(qk.notes.list())?.find((n) => n.id === id);
      apply(item ? { ...fromNote({ ...item, content: '', backlinks: [] }), content: '' } : null);
      savedRef.current = null;
      setLoading(true);
    }
    try {
      const fresh = await notesApi.get(id);
      qc.setQueryData(qk.notes.detail(id), fresh);
      if (seq !== openSeq.current) return null;
      const cur = docRef.current;
      // Don't replace text the user has started typing over.
      if (cached && cur?.id === id && isDirty()) {
        apply({ ...cur, backlinks: fresh.backlinks ?? [], tags: fresh.tags ?? [] });
        return docRef.current;
      }
      apply(fromNote(fresh));
      savedRef.current = { title: fresh.title, content: fresh.content ?? '', description: fresh.description ?? '' };
      return docRef.current;
    } catch (err) {
      if (seq !== openSeq.current) return null;
      if (!cached) apply(null);
      toast.error(failureText(err, "Couldn't open the note"));
      return null;
    } finally {
      if (seq === openSeq.current) setLoading(false);
    }
  }, [qc, apply, flush, isDirty]);

  /** Warms the cache so opening is instant (library hover). */
  const prefetch = useCallback((id: number) => {
    void qc.prefetchQuery({ queryKey: qk.notes.detail(id), queryFn: () => notesApi.get(id), staleTime: 30_000 });
  }, [qc]);

  const newDraft = useCallback(async (folder: string) => {
    const seq = ++openSeq.current;
    await flush();
    if (seq !== openSeq.current) return;
    setLoading(false);
    savedRef.current = null;
    apply({ key: `draft:${++draftSeq.current}`, id: null, title: '', content: '', description: '', folder, tags: [], backlinks: [] });
  }, [apply, flush]);

  const close = useCallback(async () => {
    ++openSeq.current;
    await flush();
    savedRef.current = null;
    setLoading(false);
    apply(null);
  }, [apply, flush]);

  /** Moves a note (or retargets the draft) to a folder. */
  const move = useCallback(async (id: number | null, folder: string) => {
    const cur = docRef.current;
    if (id == null) {
      if (cur && cur.id == null) apply({ ...cur, folder });
      return;
    }
    const list = qc.getQueryData<NoteListItem[]>(qk.notes.list());
    const before = list?.find((n) => n.id === id)?.folder;
    patchList(id, { folder });
    if (cur?.id === id) apply({ ...cur, folder });
    try {
      await notesApi.update(id, { folder });
      patchDetail(id, { folder });
    } catch (err) {
      if (before !== undefined) patchList(id, { folder: before });
      const now = docRef.current;
      if (now?.id === id && before !== undefined) apply({ ...now, folder: before });
      toast.error(failureText(err, "Couldn't move the note"));
    }
  }, [qc, apply, patchList, patchDetail]);

  const setPinned = useCallback(async (id: number, pinned: boolean) => {
    patchList(id, { pinned });
    try {
      await notesApi.update(id, { pinned });
    } catch (err) {
      patchList(id, { pinned: !pinned });
      toast.error(failureText(err, "Couldn't pin the note"));
    }
  }, [patchList]);

  const remove = useCallback(async (id: number) => {
    if (docRef.current?.id === id) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      ++openSeq.current;
      savedRef.current = null;
      apply(null);
    }
    const prev = qc.getQueryData<NoteListItem[]>(qk.notes.list());
    qc.setQueriesData<NoteListItem[]>({ queryKey: LIST_KEY }, (old) => old?.filter((n) => n.id !== id));
    try {
      await notesApi.delete(id);
      qc.removeQueries({ queryKey: qk.notes.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.tags.all });
    } catch (err) {
      if (prev) qc.setQueryData(qk.notes.list(), prev);
      toast.error(failureText(err, "Couldn't delete the note"));
    }
  }, [qc, apply]);

  // Leaving: save on hide, warn if a save can't finish.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      void flush();
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flush, isDirty]);

  // Unmount (route change): save what's pending.
  useEffect(() => () => { void flush(); }, [flush]);

  return { doc, loading, status, edit, open, prefetch, newDraft, close, move, setPinned, remove, flush };
}
