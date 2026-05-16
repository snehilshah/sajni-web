import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, BookOpen, CheckSquare, Target, FileText, Film,
  Wallet, Hash, Search as SearchIcon, ArrowLeftRight, Loader2, CornerDownLeft, X,
  Sun, Moon, Monitor, Type, LogOut, Settings, ChevronRight,
} from 'lucide-react';

import { search as searchApi, type SearchHit } from '@/api';
import {
  parseQuery, rankHit, highlight,
  SEARCH_TYPE_LABELS, type SearchType,
} from '@/lib/fuzzy';
import AIPaletteAnswer from '@/components/AIPaletteAnswer';
import { useMode, useDensity } from '@/hooks/useThemePrefs';
import { useAuth } from '@/auth/AuthContext';

// AI_PREFIXES committed by space/tab become the AI chip. We keep the
// list small — typing one of these and pressing space flips the
// palette into AI mode and clears the prefix from the input.
const AI_PREFIXES = ['@sajni', '@ai', '@s'];

const TYPE_ICONS: Record<string, typeof SearchIcon> = {
  memo: Sparkles,
  task: CheckSquare,
  note: FileText,
  journal: BookOpen,
  habit: Target,
  media: Film,
  tag: Hash,
  account: Wallet,
  transaction: ArrowLeftRight,
};

const TYPE_COLORS: Record<string, string> = {
  memo: 'text-emerald-600 dark:text-emerald-400',
  task: 'text-rose-600 dark:text-rose-400',
  note: 'text-sky-600 dark:text-sky-400',
  journal: 'text-amber-600 dark:text-amber-400',
  habit: 'text-blue-600 dark:text-blue-400',
  media: 'text-purple-600 dark:text-purple-400',
  tag: 'text-cyan-600 dark:text-cyan-400',
  account: 'text-teal-600 dark:text-teal-400',
  transaction: 'text-indigo-600 dark:text-indigo-400',
};

interface RankedHit extends SearchHit {
  score: number;
}

type Action = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  danger?: boolean;
  run: () => void | Promise<void>;
};

export default function CommandPalette() {
  const navigate = useNavigate();
  const { setMode } = useMode();
  const { setDensity } = useDensity();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fetchSeq = useRef(0);

  const actions = useMemo<Action[]>(() => [
    { id: 'theme-system',  label: 'Theme: System', Icon: Monitor, run: () => setMode('system') },
    { id: 'theme-light',   label: 'Theme: Light',  Icon: Sun,     run: () => setMode('light') },
    { id: 'theme-dark',    label: 'Theme: Dark',   Icon: Moon,    run: () => setMode('dark') },
    { id: 'density-comf',  label: 'Density: Comfortable', Icon: Type, run: () => setDensity('comfortable') },
    { id: 'density-comp',  label: 'Density: Compact',     Icon: Type, run: () => setDensity('compact') },
    { id: 'density-cozy',  label: 'Density: Cozy',        Icon: Type, run: () => setDensity('cozy') },
    { id: 'go-settings',   label: 'Open Settings',  Icon: Settings, hint: '/settings', run: () => navigate('/settings') },
    { id: 'sign-out',      label: 'Sign out',       Icon: LogOut,   danger: true, run: () => logout() },
  ], [setMode, setDensity, navigate, logout]);
  // aiQuery is set on Enter in AI mode; AIPaletteAnswer reads from it.
  // Empty string means AI mode is active but no question yet.
  const [aiQuery, setAiQuery] = useState<string>('');
  // aiChip is the explicit "AI mode active" state once the user
  // commits @sajni with space/tab. We need this separately from input
  // so the chip stays visible while the input holds only the question.
  const [aiChip, setAiChip] = useState(false);

  // Global Ctrl/Cmd+K toggle. Esc closes. Also responds to a custom
  // `palette:open` event so a UI button can trigger it without faking keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('palette:open', onCustom);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('palette:open', onCustom);
    };
  }, [open]);

  // Focus input + reset state on open.
  useEffect(() => {
    if (open) {
      setInput('');
      setResults([]);
      setActiveIndex(0);
      setAiQuery('');
      setAiChip(false);
      // Defer to after the dialog has mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset the AI answer whenever the user keeps editing — only fires on Enter.
  useEffect(() => {
    setAiQuery('');
  }, [input]);

  // Action mode: input starts with '>'. Lists app-level commands
  // (theme/density/settings/sign-out) instead of search hits.
  const actionMode = input.startsWith('>');
  const actionQuery = actionMode ? input.slice(1).trim().toLowerCase() : '';
  const actionResults = useMemo<Action[]>(
    () => actionMode
      ? (actionQuery === ''
          ? actions
          : actions.filter((a) => a.label.toLowerCase().includes(actionQuery)))
      : [],
    [actions, actionMode, actionQuery],
  );

  // When the chip is committed, treat input as the raw question (no
  // re-parsing for type prefixes). Otherwise parseQuery handles
  // type prefixes and detects an *uncommitted* @sajni so we still
  // light up the AI affordance the moment the user starts typing.
  const parsed = useMemo(
    () => (aiChip
      ? { typeBoost: null, query: input.trim(), raw: input, aiMode: true }
      : parseQuery(input)),
    [input, aiChip],
  );

  // Debounced fetch as the user types. Skipped in AI mode — the palette
  // doesn't need search results when @sajni is the active lane.
  useEffect(() => {
    if (!open) return;
    if (parsed.aiMode) {
      setResults([]);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchApi.query(parsed.query);
        if (fetchSeq.current === seq) {
          setResults(res.results || []);
          setActiveIndex(0);
        }
      } catch {
        if (fetchSeq.current === seq) setResults([]);
      } finally {
        if (fetchSeq.current === seq) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [open, parsed.query, parsed.aiMode]);

  // Score + sort + cap.
  const ranked = useMemo<RankedHit[]>(() => {
    const out = results.map<RankedHit>((r) => ({
      ...r,
      score: rankHit(r.title, r.subtitle, r.type, parsed),
    }));
    out.sort((a, b) => b.score - a.score);
    // Drop hits with no signal once a query is entered.
    const filtered = parsed.query ? out.filter((h) => h.score > 0.05) : out;
    return filtered.slice(0, 50);
  }, [results, parsed]);

  const open_hit = useCallback((hit: SearchHit) => {
    setOpen(false);
    if (hit.route) navigate(hit.route);
    else navigate('/');
  }, [navigate]);

  // Keyboard navigation.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Commit the @sajni chip on space/tab once the user has typed
    // exactly an AI prefix and nothing else. Tab is intercepted to
    // stop the focus from moving away — this is the primary feedback
    // the user is asking for: the prefix becomes a pill, and the
    // input clears for the actual question.
    if (!aiChip && (e.key === ' ' || e.key === 'Tab')) {
      const v = input.trim().toLowerCase();
      if (AI_PREFIXES.includes(v)) {
        e.preventDefault();
        setAiChip(true);
        setInput('');
        return;
      }
    }
    // Backspace at the start of an empty question removes the chip
    // and lets the user fall back to plain search.
    if (aiChip && e.key === 'Backspace' && input === '') {
      e.preventDefault();
      setAiChip(false);
      return;
    }

    // Action mode: navigate + Enter runs the action.
    if (actionMode) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, actionResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const a = actionResults[activeIndex];
        if (a) {
          setOpen(false);
          Promise.resolve(a.run()).catch(() => {});
        }
      }
      return;
    }

    // AI mode: Enter submits the question to the agent. Arrow keys are no-ops.
    if (parsed.aiMode) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (parsed.query.trim()) setAiQuery(parsed.query.trim());
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ranked.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = ranked[activeIndex];
      if (hit) open_hit(hit);
    }
  };

  // Keep active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, ranked.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-3"
          onClick={() => setOpen(false)}
        >
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-full max-w-xl rounded-xl bg-popover text-popover-foreground border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-border ${aiChip ? 'bg-primary/5' : ''}`}>
              {aiChip ? (
                <Sparkles className="size-4 text-primary shrink-0" />
              ) : (
                <SearchIcon className="size-4 text-muted-foreground shrink-0" />
              )}

              {/* The committed AI chip — pill that sits before the input.
                  Click X (or backspace from start of empty input) to drop
                  it and return to plain search. */}
              {aiChip && (
                <span className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-primary/15 text-primary mono text-[11px] font-medium">
                  @sajni
                  <button
                    type="button"
                    onClick={() => { setAiChip(false); inputRef.current?.focus(); }}
                    className="ml-0.5 size-4 inline-flex items-center justify-center rounded hover:bg-primary/20"
                    aria-label="Remove AI mode"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={aiChip
                  ? 'Ask Sajni anything…  (Enter to send)'
                  : parsed.aiMode
                    ? 'Press space or tab to lock in @sajni'
                    : 'Search everything…   try "task grocery", or "@sajni" to ask the AI'}
                className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
              />

              {loading && !parsed.aiMode && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

              {/* Hint shown while the user has typed @sajni but not yet
                  committed it — confirms the chip is one keystroke away. */}
              {parsed.aiMode && !aiChip && (
                <span className="mono text-[10px] uppercase tracking-wider text-primary/80 hidden sm:inline">
                  press space →
                </span>
              )}

              {!parsed.aiMode && parsed.typeBoost && (
                <span className="mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {SEARCH_TYPE_LABELS[parsed.typeBoost as SearchType]}
                </span>
              )}
              <kbd className="hidden sm:inline-flex mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
              {actionMode ? (
                actionResults.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">No matching action.</div>
                ) : (
                  actionResults.map((a, i) => (
                    <button
                      key={a.id}
                      data-idx={i}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => { setOpen(false); Promise.resolve(a.run()).catch(() => {}); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === activeIndex ? 'bg-accent' : 'hover:bg-accent/50'
                      } ${a.danger ? 'text-destructive' : 'text-foreground'}`}
                    >
                      <a.Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">{a.label}</span>
                      {a.hint && <span className="mono text-[10px] text-muted-foreground">{a.hint}</span>}
                      <ChevronRight className="size-3 text-muted-foreground/60" />
                    </button>
                  ))
                )
              ) : parsed.aiMode ? (
                <AIPaletteAnswer query={aiQuery} onClose={() => setOpen(false)} />
              ) : ranked.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {loading ? 'Searching…' : input ? 'No results.' : 'Start typing to search — or use @sajni to ask the AI, or > for actions.'}
                </div>
              ) : (
                ranked.map((hit, i) => (
                  <PaletteRow
                    key={`${hit.type}-${hit.id}-${i}`}
                    hit={hit}
                    active={i === activeIndex}
                    queryText={parsed.query}
                    index={i}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => open_hit(hit)}
                  />
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-muted/30 font-mono text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3">
                {parsed.aiMode ? (
                  <span className="inline-flex items-center gap-1">
                    <kbd className="border border-border rounded px-1 inline-flex items-center"><CornerDownLeft className="size-2.5" /></kbd>
                    ask Sajni
                  </span>
                ) : (
                  <>
                <span className="inline-flex items-center gap-1">
                  <kbd className="border border-border rounded px-1">↑</kbd>
                  <kbd className="border border-border rounded px-1">↓</kbd>
                  navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="border border-border rounded px-1 inline-flex items-center"><CornerDownLeft className="size-2.5" /></kbd>
                  open
                </span>
                  </>
                )}
              </div>
              <span>
                {parsed.aiMode
                  ? 'press Enter to ask'
                  : `${ranked.length} result${ranked.length === 1 ? '' : 's'}`}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteRow({
  hit, active, queryText, index, onMouseEnter, onClick,
}: {
  hit: RankedHit;
  active: boolean;
  queryText: string;
  index: number;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const Icon = TYPE_ICONS[hit.type] || SearchIcon;
  const color = TYPE_COLORS[hit.type] || 'text-foreground';
  const label = SEARCH_TYPE_LABELS[hit.type as SearchType] || hit.type;

  return (
    <button
      data-idx={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
        active ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
    >
      <Icon className={`size-4 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">
          {highlight(hit.title, queryText).map((seg, i) =>
            seg.hit ? (
              <mark key={i} className="bg-primary/25 text-foreground rounded-[2px] px-0.5">{seg.text}</mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
        {hit.subtitle && (
          <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
            {hit.subtitle}
          </div>
        )}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
    </button>
  );
}
