import { useState, useEffect, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';

import { useMemos, useCreateMemo, useUpdateMemo, useDeleteMemo } from '@/queries/memos';
import { confirmDialog } from '@/lib/confirm';
import type { Memo } from '@/types';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowUp, Pin, PinOff, Pencil, Trash2, Search, Loader2, Sparkles, X, Copy, Check, Calendar as CalendarIcon, Clock } from '@/components/ui/icons';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { useNavigate } from 'react-router-dom';

export default function MemosPage() {
  const navigate = useNavigate();
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
      title="Notes"
      navigation={
        <PageShellTabs
          bare
          ariaLabel="Notes sections"
          value="memos"
          options={[
            { value: 'notes', label: 'Vault' },
            { value: 'memos', label: 'Memos' },
          ]}
          onChange={(v) => { if (v === 'notes') navigate('/notes'); }}
        />
      }
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
          {/* Composer — first entry of the timeline. Shares the exact
              [rail | card] grid of the feed rows so every left edge lines
              up; the rail says "now" where rows say "15s ago". */}
          <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[76px_minmax(0,1fr)] gap-2.5 sm:gap-3 items-start">
            <span className="mono text-xs text-[hsl(var(--primary))] text-right leading-none pt-[15px] select-none">
              now
            </span>
            <div className="flex items-end gap-1 rounded-3xl bg-[hsl(var(--surface-container-low))] border border-[hsl(var(--outline-variant))] focus-within:border-[hsl(var(--outline))] transition-colors p-1.5 pl-2.5">
              <Textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                title="⌘ + Enter to save"
                className="min-h-[36px] max-h-48 text-[14.5px] leading-relaxed resize-none border-0 focus-visible:ring-0 bg-transparent shadow-none px-1 py-2"
              />
              <Button
                onClick={handleCreate}
                disabled={!draft.trim() || creating}
                size="icon-sm"
                className="rounded-full shrink-0 mb-0.5"
                title="Save memo (⌘ + Enter)"
                aria-label="Save memo"
              >
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-4" />}
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
            <div className="flex flex-col gap-7">
              {grouped.map(({ key, label, items }) => (
                <section key={key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 pl-1">
                    <h2 className="serif text-sm font-semibold tracking-tight whitespace-nowrap">
                      {label}
                    </h2>
                    <span className="flex-1 h-px bg-[hsl(var(--outline-variant))]" aria-hidden="true" />
                  </div>
                  <AnimatePresence initial={false}>
                    {items.map((memo) => (
                      <MemoRow
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

// Compact relative age for the timeline rail — "15s ago", "3h ago",
// "3d ago". The day header already carries the calendar date.
function shortAgo(d: Date): string {
  const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d ago`;
  return format(d, 'MMM d');
}

// MemoRow — timeline entry: relative-time rail on the left, one light
// tonal card on the right. New memos drop DOWN from the composer (y: -16
// spring); `layout` lets the rest of the feed slide out of the way.
function MemoRow({ memo, onOpen, onPin }: {
  memo: Memo;
  onOpen: () => void;
  onPin: (m: Memo) => void;
}) {
  const created = new Date(memo.created_at);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: [0.22, 0.61, 0.36, 1] } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[76px_minmax(0,1fr)] gap-2.5 sm:gap-3 items-start"
    >
      <span
        className="mono text-xs text-muted-foreground text-right leading-none pt-[15px] select-none"
        title={created.toLocaleString()}
      >
        {shortAgo(created)}
      </span>

      <motion.div
        onClick={onOpen}
        whileTap={{ scale: 0.99 }}
        className={`group relative cursor-pointer rounded-2xl px-3.5 py-2.5 transition-colors ${
          memo.pinned
            ? 'bg-[hsl(var(--secondary-container)/0.45)] hover:bg-[hsl(var(--secondary-container)/0.65)]'
            : 'bg-[hsl(var(--surface-container-low))] hover:bg-[hsl(var(--surface-container))]'
        }`}
      >
        {/* Trailing-margin kill: markdown's last block otherwise pads the
            card bottom unevenly vs. the top. */}
        <div className="prose-sajni text-[14.5px] leading-relaxed line-clamp-3 [&>:last-child]:!mb-0 [&>:first-child]:!mt-0">
          <Markdown remarkPlugins={[remarkGfm]}>{memo.content}</Markdown>
        </div>

        {memo.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {memo.tags.map((t) => <TagPill key={t} tag={t} />)}
          </div>
        )}

        {/* Pin — pinned shows a quiet corner glyph; hover swaps in the toggle. */}
        <button
          onClick={(e) => { e.stopPropagation(); onPin(memo); }}
          title={memo.pinned ? 'Unpin' : 'Pin'}
          className={`absolute top-2 right-2 size-7 rounded-full flex items-center justify-center transition-opacity ${
            memo.pinned
              ? 'text-[hsl(var(--on-secondary-container))] opacity-70 hover:opacity-100'
              : 'text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] opacity-0 group-hover:opacity-100'
          }`}
        >
          {memo.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      </motion.div>
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
