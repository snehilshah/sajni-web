import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, Plus, Sparkles, Trash2, RefreshCw, ChevronRight, X,
  Edit3, Save, Link2,
} from '@/components/ui/icons';

import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import {
  thinking, type ThinkingCard, type ThinkingKind,
  type ThinkingConnection, type ThinkingRelation, type ThinkingEnrichment,
} from '@/api';
import { useThinkingProject } from '@/queries/thinking';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';

const KINDS: ThinkingKind[] = [
  'note', 'entity', 'question', 'idea', 'reflection',
  'claim', 'fact', 'hypothesis', 'evidence',
  'contradiction', 'decision', 'todo',
];

const RELATIONS: ThinkingRelation[] = [
  'supports', 'contradicts', 'extends', 'depends_on', 'refines',
  'fixes', 'refs', 'points', 'questions',
  'exemplifies', 'generalizes', 'related',
];

// Tonal background per kind — exclusively M3 container tokens so the
// palette tracks the active theme. No raw hex.
const KIND_TONE: Record<ThinkingKind, string> = {
  note:          'bg-[hsl(var(--surface-container-high))] text-foreground/80',
  entity:        'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
  question:      'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]',
  idea:          'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
  reflection:    'bg-[hsl(var(--surface-container-highest))] text-foreground/80',
  claim:         'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
  fact:          'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]',
  hypothesis:    'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
  evidence:      'bg-[hsl(var(--tertiary-container))] text-[hsl(var(--on-tertiary-container))]',
  contradiction: 'bg-[hsl(var(--error-container))] text-[hsl(var(--on-error-container))]',
  decision:      'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
  todo:          'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]',
};

const CARD_SURFACE =
  'rounded-2xl border border-border bg-[hsl(var(--surface-container-low))]';

// Local cache of stale-banner dismissals so reloading doesn't keep
// nagging the user about the same un-synthesized cards.
const STALE_DISMISS_KEY = (pid: number) => `sajni:thinking:stale-dismissed:${pid}`;
const STALE_THRESHOLD = 5;

export default function ThinkingProjectPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: projectData, isLoading: loading } = useThinkingProject(pid, Number.isFinite(pid));
  const project = projectData?.project ?? null;
  const cards = projectData?.cards ?? [];
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<ThinkingKind>('note');
  // Tracks whether the user has manually chosen the kind for the
  // current draft. If false, auto-categorize is free to silently flip
  // the Select to its latest suggestion as the user types.
  const userPickedKind = useRef(false);
  // Render-time mirror of userPickedKind (the "auto" hint reads it in JSX, and
  // the React Compiler forbids reading a ref during render). The ref stays the
  // source of truth for the async classify guards which need the live value.
  const [userPickedKindState, setUserPickedKindState] = useState(false);
  // Latest AI suggestion + a deferred promise. addCard awaits this
  // (up to 3s) if it hasn't resolved by the time the user hits Add.
  const pendingClassify = useRef<Promise<ThinkingKind | null> | null>(null);
  const [activeKinds, setActiveKinds] = useState<Set<ThinkingKind>>(new Set());
  const [adding, setAdding] = useState(false);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState<boolean>(false);

  // Card writes go through thinkingApi (project-scoped editor); this refreshes
  // the cached project + cards after each mutation, including the delayed poll
  // for async server-side enrichment.
  const load = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.thinking.project(pid) });
  }, [qc, pid]);

  useEffect(() => {
    try {
      setStaleDismissed(localStorage.getItem(STALE_DISMISS_KEY(pid)) === '1');
    } catch { /* noop */ }
  }, [pid]);

  // Auto-categorize: debounce draft text, hit the classifier, silently
  // flip Select unless the user manually changed it. Skip empty drafts
  // and very short ones (< 12 chars) to save tokens.
  useEffect(() => {
    if (userPickedKind.current) return;
    if (draft.trim().length < 12) return;
    const t = setTimeout(() => {
      const p = thinking.classify(draft).then((r) => r.kind).catch(() => null);
      pendingClassify.current = p;
      p.then((k) => {
        if (k && !userPickedKind.current) setKind(k);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [draft]);

  const onUserPickKind = (v: ThinkingKind) => {
    userPickedKind.current = true;
    setUserPickedKindState(true);
    setKind(v);
  };

  const addCard = async () => {
    const text = draft.trim();
    if (!text) return;
    setAdding(true);
    // If the classifier is still in flight, wait up to 3s for it; if
    // it returns in time AND user hasn't manually picked, use it.
    let finalKind = kind;
    if (!userPickedKind.current && pendingClassify.current) {
      const guess = await Promise.race<ThinkingKind | null>([
        pendingClassify.current,
        new Promise<null>((res) => setTimeout(() => res(null), 3000)),
      ]);
      if (guess && !userPickedKind.current) finalKind = guess;
    }
    try {
      await thinking.addCard(pid, { kind: finalKind, content: text });
      setDraft('');
      setKind('note');
      userPickedKind.current = false;
      setUserPickedKindState(false);
      pendingClassify.current = null;
      await load();
    } finally {
      setAdding(false);
      // Async enrichment runs server-side; poll once for the result.
      setTimeout(load, 4000);
    }
  };

  const removeCard = async (cid: number) => {
    if (!(await confirmDialog('Delete this card?'))) return;
    await thinking.deleteCard(cid);
    if (openCardId === cid) setOpenCardId(null);
    load();
  };

  const reEnrich = async (cid: number) => {
    await thinking.enrichCard(cid);
    load();
  };

  const saveEnrichment = async (cid: number, next: ThinkingEnrichment) => {
    await thinking.saveEnrichment(cid, next);
    load();
  };

  const synthesize = async () => {
    setSynthesizing(true);
    try {
      await thinking.synthesize(pid);
      await load();
      try { localStorage.removeItem(STALE_DISMISS_KEY(pid)); } catch { /* noop */ }
      setStaleDismissed(false);
    } finally {
      setSynthesizing(false);
    }
  };

  const updateCardKind = async (cid: number, newKind: ThinkingKind) => {
    await thinking.updateCard(cid, { kind: newKind });
    load();
  };

  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) m[c.kind] = (m[c.kind] ?? 0) + 1;
    return m;
  }, [cards]);

  const visibleCards = useMemo(() => {
    if (activeKinds.size === 0) return cards;
    return cards.filter((c) => activeKinds.has(c.kind));
  }, [cards, activeKinds]);

  const openCard = cards.find((c) => c.id === openCardId) || null;

  // Stale = cards added since synthesized_at > threshold.
  const synthAt = project?.synthesized_at;
  const cardsSinceSynth = useMemo(() => {
    if (!synthAt) return cards.length;
    const t = new Date(synthAt).getTime();
    return cards.filter((c) => new Date(c.created_at).getTime() > t).length;
  }, [cards, synthAt]);
  const showStaleBanner =
    project?.thesis &&
    cardsSinceSynth > STALE_THRESHOLD &&
    !staleDismissed &&
    !synthesizing;

  const dismissStale = () => {
    setStaleDismissed(true);
    try { localStorage.setItem(STALE_DISMISS_KEY(pid), '1'); } catch { /* noop */ }
  };

  const toggleKind = (k: ThinkingKind) => {
    setActiveKinds((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  if (loading) return <PageShell title="Projects">Loading…</PageShell>;
  if (!project) return <PageShell title="Not found">Project not found.</PageShell>;

  return (
    <PageShell
      title={
        <span className="inline-flex items-center gap-2">
          <button onClick={() => navigate('/projects')} className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
          {project.title}
        </span>
      }
      actions={
        <Button size="sm" onClick={synthesize} disabled={synthesizing || cards.length < 2}>
          <Sparkles className="size-4 mr-1" />
          {synthesizing ? 'Synthesizing…' : project.thesis ? 'Re-synthesize' : 'Synthesize'}
        </Button>
      }
    >
      {project.description && (
        <div className="text-sm text-muted-foreground">{project.description}</div>
      )}

      {showStaleBanner && (
        <div className="rounded-xl border border-primary/40 bg-[hsl(var(--primary-container)/0.5)] text-[hsl(var(--on-primary-container))] px-4 py-3 flex items-start gap-3">
          <Sparkles className="size-4 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <strong>{cardsSinceSynth} new cards</strong> added since the last synthesis — the thesis may be stale.
          </div>
          <Button size="sm" onClick={synthesize} disabled={synthesizing}>
            Re-synthesize
          </Button>
          <button onClick={dismissStale} className="p-1 rounded hover:bg-foreground/10" title="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {(project.thesis || (project.gap_questions && project.gap_questions.length > 0)) && (
        <div className={`${CARD_SURFACE} p-5 space-y-4`}>
          {project.thesis && (
            <div>
              <SectionLabel>Thesis</SectionLabel>
              <div className="prose prose-sm dark:prose-invert max-w-none mt-2 prose-headings:font-serif prose-headings:tracking-tight prose-h1:text-base prose-h1:mb-2 prose-h2:text-sm prose-h2:mt-4 prose-h2:mb-1 prose-p:leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>{project.thesis}</Markdown>
              </div>
            </div>
          )}
          {project.thesis && project.gap_questions?.length > 0 && <Separator />}
          {project.gap_questions && project.gap_questions.length > 0 && (
            <div>
              <SectionLabel>Gap questions</SectionLabel>
              <ul className="space-y-1.5 mt-2">
                {project.gap_questions.map((q, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Composer */}
      <div className={`${CARD_SURFACE} p-3 space-y-3`}>
        <Textarea
          placeholder="What's on your mind? Sajni picks a kind automatically; override below."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addCard();
            }
          }}
          rows={3}
          className="min-h-[88px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => onUserPickKind(v as ThinkingKind)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${KIND_TONE[k].split(' ')[0]}`} />
                    {k}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!userPickedKindState && draft.trim().length >= 12 && (
            <span className="mono text-xs uppercase tracking-wider text-muted-foreground">auto</span>
          )}
          <span className="mono text-xs uppercase tracking-wider text-muted-foreground">⌘+Enter to add</span>
          <div className="flex-1" />
          <Button size="sm" onClick={addCard} disabled={!draft.trim() || adding}>
            <Plus className="size-4 mr-1" /> {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>

      {/* Filter chips — equal width grid */}
      {cards.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Filter</SectionLabel>
            {activeKinds.size > 0 && (
              <button
                onClick={() => setActiveKinds(new Set())}
                className="text-xs mono uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="size-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
            {KINDS.filter((k) => (kindCounts[k] ?? 0) > 0).map((k) => {
              const on = activeKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={`h-8 px-2 rounded-full border text-xs mono uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
                    on
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-[hsl(var(--on-surface))]'
                  }`}
                >
                  <span className="truncate">{k}</span>
                  <span className="opacity-70">{kindCounts[k]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cards list */}
      {visibleCards.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No cards yet — drop a thought above.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleCards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenCardId(c.id)}
              className={`${CARD_SURFACE} text-left p-3 hover:bg-[hsl(var(--surface-container))] transition-colors group`}
            >
              <div className="flex items-start gap-2">
                <span className={`shrink-0 inline-flex items-center justify-center w-24 text-xs mono uppercase tracking-wider px-2 py-0.5 rounded-full ${KIND_TONE[c.kind]}`}>
                  {c.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <Markdown remarkPlugins={[remarkGfm]}>{c.content}</Markdown>
                  </div>
                  {c.ai_enrichment?.summary && (
                    <div className="mt-1.5 text-xs italic text-foreground/60 border-l-2 border-primary/40 pl-2">
                      {c.ai_enrichment.summary}
                    </div>
                  )}
                  {c.ai_enrichment?.connections && c.ai_enrichment.connections.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs mono uppercase tracking-wider text-muted-foreground">
                      <Link2 className="size-3" />
                      {c.ai_enrichment.connections.length} connection{c.ai_enrichment.connections.length === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeCard(c.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))] transition"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs mono uppercase tracking-wider text-muted-foreground">
                <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                <ChevronRight className="size-3" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={openCardId !== null} onOpenChange={(o) => !o && setOpenCardId(null)}>
        <SheetContent side="right" className="!max-w-md w-full flex flex-col p-0 gap-0">
          {openCard && (
            <CardDetail
              key={openCard.id /* remount on jump so edit drafts reset */}
              card={openCard}
              siblings={cards}
              onJump={setOpenCardId}
              onReEnrich={() => reEnrich(openCard.id)}
              onDelete={() => removeCard(openCard.id)}
              onSaveEnrichment={(next) => saveEnrichment(openCard.id, next)}
              onChangeKind={(k) => updateCardKind(openCard.id, k)}
            />
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-xs uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Section({
  title, action, children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        {action}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function CardDetail({
  card, siblings, onJump, onReEnrich, onDelete, onSaveEnrichment, onChangeKind,
}: {
  card: ThinkingCard;
  siblings: ThinkingCard[];
  onJump: (id: number) => void;
  onReEnrich: () => void;
  onDelete: () => void;
  onSaveEnrichment: (next: ThinkingEnrichment) => void;
  onChangeKind: (k: ThinkingKind) => void;
}) {
  const e: ThinkingEnrichment = card.ai_enrichment || {};
  const hasAny =
    !!e.summary ||
    (e.implications?.length ?? 0) > 0 ||
    (e.questions_raised?.length ?? 0) > 0 ||
    (e.connections?.length ?? 0) > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ThinkingEnrichment>(e);

  const startEdit = () => {
    setDraft({
      summary: e.summary ?? '',
      implications: [...(e.implications ?? [])],
      questions_raised: [...(e.questions_raised ?? [])],
      connections: [...(e.connections ?? [])],
      confidence: e.confidence,
    });
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    onSaveEnrichment(draft);
    setEditing(false);
  };

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-2 pr-12">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={card.kind} onValueChange={(v) => onChangeKind(v as ThinkingKind)}>
            <SelectTrigger className="h-7 w-auto text-xs mono uppercase tracking-wider rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="mono text-xs uppercase tracking-wider text-muted-foreground">
            {formatDistanceToNow(new Date(card.created_at), { addSuffix: true })}
          </span>
        </div>
        <SheetTitle className="serif text-base font-semibold leading-tight">
          {card.content.split('\n')[0].slice(0, 80) || 'Card detail'}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Thought card detail with AI enrichment
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <Section title="Content">
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <Markdown remarkPlugins={[remarkGfm]}>{card.content}</Markdown>
          </div>
        </Section>

        <Separator />

        {/* Enrichment block — read mode OR edit mode */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Enrichment</SectionLabel>
            <div className="flex items-center gap-2">
              {typeof e.confidence === 'number' && e.confidence > 0 && !editing && (
                <span className="mono text-xs uppercase tracking-wider text-muted-foreground">
                  confidence {Math.round((e.confidence ?? 0) * 100)}%
                </span>
              )}
              {!editing ? (
                <Button size="sm" variant="ghost" onClick={startEdit}>
                  <Edit3 className="size-3.5 mr-1" /> Edit
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <Button size="sm" onClick={saveEdit}>
                    <Save className="size-3.5 mr-1" /> Save
                  </Button>
                </>
              )}
            </div>
          </div>

          {!editing ? (
            <>
              {!hasAny && (
                <p className="text-sm text-muted-foreground italic">
                  Sajni hasn't enriched this card yet. Hit <em>Re-enrich</em> below.
                </p>
              )}
              {e.summary && (
                <Section title="Summary"><p>{e.summary}</p></Section>
              )}
              {e.implications && e.implications.length > 0 && (
                <Section title="Implications">
                  <ul className="space-y-1.5">
                    {e.implications.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 shrink-0">→</span><span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {e.questions_raised && e.questions_raised.length > 0 && (
                <Section title="Questions raised">
                  <ul className="space-y-1.5">
                    {e.questions_raised.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 shrink-0">?</span><span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {e.connections && e.connections.length > 0 && (
                <Section title="Connections">
                  <ul className="space-y-1.5">
                    {e.connections.map((c, i) => {
                      const target = siblings.find((x) => x.id === c.card_id);
                      const preview = target
                        ? (target.content.split('\n')[0].slice(0, 50) || `card #${c.card_id}`)
                        : `(deleted card)`;
                      return (
                        <li key={i}>
                          <button
                            disabled={!target}
                            onClick={() => target && onJump(c.card_id)}
                            className="w-full text-left rounded-lg border border-border bg-[hsl(var(--surface-container))] hover:bg-[hsl(var(--surface-container-high))] transition-colors px-3 py-2 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="mono text-xs uppercase tracking-wider text-muted-foreground shrink-0">
                              {c.relation.replace('_', ' ')}
                            </span>
                            {target && (
                              <span className={`shrink-0 text-xs mono uppercase tracking-wider px-1.5 py-0.5 rounded-full ${KIND_TONE[target.kind]}`}>
                                {target.kind}
                              </span>
                            )}
                            <span className="text-sm truncate">{preview}</span>
                            <ChevronRight className="size-3.5 text-muted-foreground ml-auto shrink-0" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            <EnrichmentEditor draft={draft} setDraft={setDraft} siblings={siblings.filter((x) => x.id !== card.id)} />
          )}
        </div>
      </div>

      <div className="border-t border-border px-5 py-3 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onReEnrich}>
          <RefreshCw className="size-3.5 mr-1.5" /> Re-enrich
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))]">
          <Trash2 className="size-3.5 mr-1.5" /> Delete
        </Button>
      </div>
    </>
  );
}

function EnrichmentEditor({
  draft, setDraft, siblings,
}: {
  draft: ThinkingEnrichment;
  setDraft: (next: ThinkingEnrichment) => void;
  siblings: ThinkingCard[];
}) {
  const setList = (key: 'implications' | 'questions_raised', next: string[]) =>
    setDraft({ ...draft, [key]: next });

  const updateConn = (i: number, patch: Partial<ThinkingConnection>) => {
    const next = [...(draft.connections ?? [])];
    next[i] = { ...next[i], ...patch };
    setDraft({ ...draft, connections: next });
  };
  const removeConn = (i: number) => {
    const next = [...(draft.connections ?? [])];
    next.splice(i, 1);
    setDraft({ ...draft, connections: next });
  };
  const addConn = () => {
    const first = siblings[0];
    if (!first) return;
    setDraft({
      ...draft,
      connections: [...(draft.connections ?? []), { card_id: first.id, relation: 'related' }],
    });
  };

  return (
    <div className="space-y-4">
      <Section title="Summary">
        <Textarea
          rows={2}
          value={draft.summary ?? ''}
          onChange={(ev) => setDraft({ ...draft, summary: ev.target.value })}
          placeholder="One-sentence summary"
        />
      </Section>

      <ListEditor
        title="Implications"
        items={draft.implications ?? []}
        onChange={(next) => setList('implications', next)}
        placeholder="An implication"
      />

      <ListEditor
        title="Questions raised"
        items={draft.questions_raised ?? []}
        onChange={(next) => setList('questions_raised', next)}
        placeholder="An open question"
      />

      <Section
        title="Connections"
        action={
          <Button size="sm" variant="ghost" onClick={addConn} disabled={siblings.length === 0}>
            <Plus className="size-3.5 mr-1" /> Add
          </Button>
        }
      >
        {(draft.connections ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No connections.</p>
        ) : (
          <ul className="space-y-2">
            {(draft.connections ?? []).map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <Select value={c.relation} onValueChange={(v) => updateConn(i, { relation: v as ThinkingRelation })}
                  items={RELATIONS.map((r) => ({ value: r, label: r.replace('_', ' ') }))}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(c.card_id)} onValueChange={(v) => updateConn(i, { card_id: Number(v) })}
                  items={siblings.map((s) => ({ value: String(s.id), label: s.content.split('\n')[0].slice(0, 40) || `card #${s.id}` }))}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {siblings.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className="truncate">
                          {s.content.split('\n')[0].slice(0, 40) || `card #${s.id}`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button onClick={() => removeConn(i)} className="p-1 rounded hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))]" title="Remove">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ListEditor({
  title, items, onChange, placeholder,
}: {
  title: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };
  return (
    <Section title={title}>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input
              value={s}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="h-8 text-sm"
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="p-1 rounded hover:bg-[hsl(var(--error-container))] hover:text-[hsl(var(--on-error-container))]"
              title="Remove"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 mt-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="ghost" onClick={add} disabled={!draft.trim()}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </Section>
  );
}
