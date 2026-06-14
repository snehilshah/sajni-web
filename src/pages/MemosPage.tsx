import { useState, useEffect, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

import { useMemos, useCreateMemo, useUpdateMemo, useDeleteMemo } from '@/queries/memos';
import { confirmDialog } from '@/lib/confirm';
import type { Memo } from '@/types';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pin, PinOff, Pencil, Trash2, Search, Loader2, Sparkles, X, Copy, Check, Calendar as CalendarIcon, Clock } from 'lucide-react';
import PageShell from '@/components/PageShell';

export default function MemosPage() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Debounce search into the query param so each keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading: loading } = useMemos(debounced ? { search: debounced } : undefined);
  const memosList = (data ?? []) as Memo[];
  const createMemo = useCreateMemo();
  const updateMemo = useUpdateMemo();
  const deleteMemo = useDeleteMemo();

  // Derive the open memo from the live list so pin/edit reflect immediately.
  const activeMemo = useMemo(
    () => (activeId != null ? memosList.find((m) => m.id === activeId) ?? null : null),
    [memosList, activeId],
  );

  const handleCreate = async () => {
    if (!draft.trim()) return;
    setCreating(true);
    try {
      await createMemo.mutateAsync({ content: draft });
      setDraft('');
      draftRef.current?.focus();
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCreate();
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog('Delete this memo?'))) return;
    await deleteMemo.mutateAsync(id);
    if (activeId === id) setActiveId(null);
  };
  const handlePin = async (m: Memo) => {
    await updateMemo.mutateAsync({ id: m.id, data: { pinned: !m.pinned } });
  };
  const handleSaveEdit = async (id: number, content: string) => {
    await updateMemo.mutateAsync({ id, data: { content } });
  };

  const grouped = useMemo(() => groupByDay(memosList), [memosList]);

  return (
    <PageShell
      caption={`${memosList.length} ${memosList.length === 1 ? 'memo' : 'memos'}`}
      title="Memos"
      subtitle="Quick thoughts. Use #tags and [[backlinks]]."
      actions={
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 h-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      }
    >
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-6">
          {/* Composer */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind?"
              className="min-h-[88px] text-[15px] leading-relaxed resize-none border-0 focus-visible:ring-0 bg-transparent shadow-none px-4 pt-3"
            />
            <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-border/60">
              <span className="text-xs text-muted-foreground font-mono">⌘ + Enter to save</span>
              <Button onClick={handleCreate} disabled={!draft.trim() || creating} size="sm" className="gap-1.5">
                {creating && <Loader2 className="size-3.5 animate-spin" />}
                Save memo
              </Button>
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : memosList.length === 0 ? (
            <EmptyState
              search={search}
              onClear={() => setSearch('')}
            />
          ) : (
            <div className="flex flex-col gap-8">
              {grouped.map(({ key, label, items }) => (
                <section key={key} className="flex flex-col gap-3">
                  <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground sticky top-[1px] py-1">
                    {label}
                  </h2>
                  <AnimatePresence initial={false}>
                    {items.map((memo) => (
                      <MemoCard
                        key={memo.id}
                        memo={memo}
                        onOpen={() => setActiveId(memo.id)}
                        onPin={handlePin}
                      />
                    ))}
                  </AnimatePresence>
                </section>
              ))}
            </div>
          )}
      </div>

      <MemoDetailDialog
        memo={activeMemo}
        onClose={() => setActiveId(null)}
        onPin={handlePin}
        onDelete={handleDelete}
        onSave={handleSaveEdit}
      />
    </PageShell>
  );
}

function groupByDay(memos: Memo[]) {
  const map = new Map<string, { key: string; label: string; items: Memo[] }>();
  for (const m of memos) {
    const dt = new Date(m.created_at);
    const key = format(dt, 'yyyy-MM-dd');
    let label: string;
    if (isToday(dt)) label = 'Today';
    else if (isYesterday(dt)) label = 'Yesterday';
    else label = format(dt, 'EEEE, MMM d');
    const bucket = map.get(key) || { key, label, items: [] };
    bucket.items.push(m);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

function EmptyState({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
      <Sparkles className="size-9 mx-auto mb-3 opacity-30" />
      {search ? (
        <>
          <p className="text-sm">No memos match "{search}".</p>
          <Button variant="link" size="sm" onClick={onClear}>Clear search</Button>
        </>
      ) : (
        <p className="text-sm">No memos yet. Capture your first thought above.</p>
      )}
    </div>
  );
}

function MemoCard({ memo, onOpen, onPin }: {
  memo: Memo;
  onOpen: () => void;
  onPin: (m: Memo) => void;
}) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: [0.22, 0.61, 0.36, 1] } }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      onClick={onOpen}
      className={`group rounded-xl border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md cursor-pointer relative ${
        memo.pinned ? 'border-secondary/40' : 'border-border'
      }`}
    >
      <div className="p-4 sm:p-5">
        {memo.pinned && (
          <div className="mb-2 inline-flex items-center gap-1 text-secondary">
            <Pin className="size-3" />
            <span className="text-xs font-mono uppercase tracking-wider">Pinned</span>
          </div>
        )}

        <div className="prose-sajni text-[15px] line-clamp-6">
          <Markdown remarkPlugins={[remarkGfm]}>{memo.content}</Markdown>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60 gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span
              className="font-mono text-xs text-muted-foreground shrink-0"
              title={new Date(memo.created_at).toLocaleString()}
            >
              {formatDistanceToNow(new Date(memo.created_at), { addSuffix: true })}
            </span>
            {memo.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {memo.tags.map((t) => <TagPill key={t} tag={t} />)}
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onPin(memo); }}
            title={memo.pinned ? 'Unpin' : 'Pin'}
            className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            {memo.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MemoDetailDialog({ memo, onClose, onPin, onDelete, onSave }: {
  memo: Memo | null;
  onClose: () => void;
  onPin: (m: Memo) => void;
  onDelete: (id: number) => void;
  onSave: (id: number, content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset internal state when memo changes (and on close)
  useEffect(() => {
    setEditing(false);
    setEditContent(memo?.content || '');
    setCopied(false);
  }, [memo?.id]);

  if (!memo) return null;

  const created = new Date(memo.created_at);
  const updated = new Date(memo.updated_at);
  const wasEdited = updated.getTime() - created.getTime() > 1000;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memo.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const handleSaveClick = async () => {
    setSaving(true);
    try {
      await onSave(memo.id, editContent);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!memo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {memo.pinned && <Pin className="size-4 text-secondary shrink-0" />}
                Memo
              </DialogTitle>
              <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="size-3" />
                  {format(created, 'MMM d, yyyy')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {format(created, 'h:mm a')}
                </span>
              </div>
              {wasEdited && (
                <div className="font-mono text-xs text-muted-foreground/70 mt-0.5">
                  edited {format(updated, 'MMM d, yyyy · h:mm a')}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              autoFocus
              className="min-h-[200px] text-[15px] leading-relaxed"
            />
          ) : (
            <div className="prose-sajni text-[15px] leading-relaxed">
              <Markdown remarkPlugins={[remarkGfm]}>{memo.content}</Markdown>
            </div>
          )}

          {memo.tags.length > 0 && !editing && (
            <div className="flex gap-1.5 flex-wrap pt-4 mt-4 border-t border-border/50">
              {memo.tags.map((t) => <TagPill key={t} tag={t} />)}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 py-3 border-t border-border bg-muted/20 gap-1">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setEditContent(memo.content); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveClick} disabled={saving || !editContent.trim()} className="gap-1.5">
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => onDelete(memo.id)} className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5">
                <Trash2 className="size-3.5" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onPin(memo)} className="gap-1.5">
                {memo.pinned ? <><PinOff className="size-3.5" /> Unpin</> : <><Pin className="size-3.5" /> Pin</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                <Pencil className="size-3.5" /> Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
