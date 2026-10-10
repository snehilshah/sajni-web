import { useState, useEffect, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';

import { useMemos, useCreateMemo, useUpdateMemo, useDeleteMemo, useAutosaveMemo } from '@/queries/memos';
import { confirmDialog } from '@/lib/confirm';
import type { Memo } from '@/types';
import TagPill from '@/components/TagPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowDown, Pin, PinOff, Pencil, Trash2, Search, Loader2, X, Copy, Check, Calendar as CalendarIcon, Clock } from '@/components/ui/icons';
import PageShell from '@/components/PageShell';
import { useEditorAutosave } from '@/hooks/use-autosave';
import { AutosaveStatus, EditActions } from '@/components/autosave';

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
  const memosList = useMemo(() => (data ?? []) as Memo[], [data]);
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

  const grouped = useMemo(() => groupByDay(memosList), [memosList]);

  return (
    <PageShell
      title="Memos"
      // A reading column: the header shares its edges with the feed.
      columnClassName="max-w-3xl px-4 md:px-8"
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
      <div className="w-full flex flex-col gap-6">
          {/* Composer — first entry of the timeline, on the same edges as
              every memo below it. Focus draws the ring; rest is tone only. */}
          <div>
            <div className="flex items-end gap-1 rounded-3xl bg-[hsl(var(--surface-container-highest))] focus-within:shadow-[inset_0_0_0_1px_hsl(var(--outline))] transition-shadow p-1.5 pl-2.5">
              <Textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                title="⌘ + Enter to save"
                className="min-h-[36px] max-h-48 text-[14.5px] leading-relaxed resize-none border-0 focus-visible:ring-0 focus-visible:shadow-none bg-transparent shadow-none px-1 py-2"
              />
              <Button
                onClick={handleCreate}
                disabled={!draft.trim() || creating}
                size="icon-sm"
                className="rounded-full shrink-0 mb-0.5"
                title="Save memo (⌘ + Enter)"
                aria-label="Save memo"
              >
                {creating ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDown className="size-4" />}
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
                  <h2 className="serif text-sm font-semibold tracking-tight">{label}</h2>
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
    <div className="py-2 text-sm text-muted-foreground">
      {search ? (
        <>
          <p>No memos match "{search}"</p>
          <Button variant="link" size="sm" onClick={onClear}>Clear search</Button>
        </>
      ) : (
        <p>No memos yet</p>
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
// tonal card on the right. New memos drop DOWN from the composer; `layout`
// lets the rest of the feed slide out of the way.
//
// Two rules hold this animation together, both learned the hard way:
//
//  1. Motion goes through framer's own `y`/`scale` props, never a raw
//     `transform` string. `layout` drives the element's transform itself to
//     project between measured boxes; a competing transform animation on the
//     same element made the card jump and vanish mid-flight.
//  2. Entry is a decelerating tween, not a spring. The old spring
//     (stiffness 380 / damping 28) sat at damping ratio ~0.72 — underdamped,
//     so every new memo overshot and bounced back.
const MEMO_ENTER = { duration: 0.28, ease: [0.05, 0.7, 0.1, 1] } as const; // m3 emphasized decelerate
const MEMO_EXIT = { duration: 0.18, ease: [0.3, 0, 0.8, 0.15] } as const;  // m3 emphasized accelerate

function MemoRow({ memo, onOpen, onPin }: {
  memo: Memo;
  onOpen: () => void;
  onPin: (m: Memo) => void;
}) {
  const created = new Date(memo.created_at);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: MEMO_EXIT }}
      transition={MEMO_ENTER}
      onClick={onOpen}
      whileTap={{ scale: 0.99 }}
      /* rounded-lg is 16px here, not Tailwind's 8 — index.css remaps the
         whole scale onto M3's (the "large" card shape). */
      className={`group relative flex cursor-pointer items-start gap-3 rounded-lg px-3.5 py-2.5 transition-colors ${
        memo.pinned
          ? 'bg-[hsl(var(--secondary-container)/0.45)] hover:bg-[hsl(var(--secondary-container)/0.65)]'
          : 'bg-card hover:bg-[hsl(var(--surface-container-high))]'
      }`}
    >
      <div className="min-w-0 flex-1">
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
      </div>

      {/* Trailing slot: the age on the card's edge (the day header carries
          the date); hover swaps in the pin toggle in the same place. */}
      <div className="relative -mr-1 flex h-[25px] shrink-0 items-center">
        <span
          className={`text-xs tabular-nums text-muted-foreground select-none group-hover:invisible ${memo.pinned ? 'invisible' : ''}`}
          title={created.toLocaleString()}
        >
          {shortAgo(created)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onPin(memo); }}
          title={memo.pinned ? 'Unpin' : 'Pin'}
          aria-label={memo.pinned ? 'Unpin memo' : 'Pin memo'}
          className={`absolute right-0 top-1/2 -translate-y-1/2 size-7 rounded-full flex items-center justify-center transition-opacity ${
            memo.pinned
              ? 'text-[hsl(var(--on-secondary-container))] opacity-70 hover:opacity-100'
              : 'text-muted-foreground hover:bg-[hsl(var(--on-surface)/0.08)] opacity-0 group-hover:opacity-100'
          }`}
        >
          {memo.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}

function MemoDetailDialog({ memo, onClose, onPin, onDelete }: {
  memo: Memo | null;
  onClose: () => void;
  onPin: (m: Memo) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [copied, setCopied] = useState(false);
  const autosaveMemo = useAutosaveMemo();

  // Editing saves itself; Done (or closing) flushes the last change.
  const autosave = useEditorAutosave({
    key: editing && memo ? memo.id : null,
    value: editContent,
    apply: setEditContent,
    invalid: editContent.trim() ? null : 'a memo needs some text.',
    save: async (content) => {
      if (memo) await autosaveMemo(memo.id, content);
    },
  });

  // A different memo starts in reading mode. Keyed on the id only: an
  // autosave refreshes `memo.content`, which must not end the edit.
  useEffect(() => {
    setEditing(false);
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

  const startEditing = () => {
    setEditContent(memo.content);
    autosave.load(memo.content);
    setEditing(true);
  };
  const finishEditing = () => autosave.close(() => setEditing(false));

  return (
    <Dialog open={!!memo} onOpenChange={(o) => { if (!o) autosave.close(onClose); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {memo.pinned && <Pin className="size-4 text-secondary shrink-0" />}
                Memo
                {editing && <AutosaveStatus status={autosave.status} />}
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

        <DialogFooter className="shrink-0 px-6 py-3 gap-1">
          {editing ? (
            <EditActions changed={autosave.changed} onUndo={autosave.undo} onDone={finishEditing} />
          ) : (
            <>
              <Button variant="destructive-quiet" size="sm" onClick={() => onDelete(memo.id)} className="mr-auto gap-1.5">
                <Trash2 className="size-3.5" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onPin(memo)} className="gap-1.5">
                {memo.pinned ? <><PinOff className="size-3.5" /> Unpin</> : <><Pin className="size-3.5" /> Pin</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
                <Pencil className="size-3.5" /> Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
