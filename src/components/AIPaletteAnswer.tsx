import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, ArrowRight, AlertCircle,
  CheckSquare, Target, BookOpen, Film, Wallet,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { M3CookieLoader } from '@/components/ui/shapes';

import { ai, type AIEvent } from '@/api';

interface ToolResult {
  name: string;
  ok: boolean;
  error?: string;
  meta?: { kind: string; id?: number; title?: string; route?: string };
}

const ACTION_ICONS: Record<string, typeof CheckSquare> = {
  task_created: CheckSquare,
  task_completed: CheckSquare,
  task_deleted: CheckSquare,
  habit_created: Target,
  habit_logged: Target,
  memo_created: Sparkles,
  journal_created: BookOpen,
  media_added: Film,
  transaction_created: Wallet,
};

const ACTION_LABELS: Record<string, string> = {
  task_created: 'Created task',
  task_completed: 'Completed task',
  task_deleted: 'Deleted task',
  habit_created: 'Created habit',
  habit_logged: 'Logged habit',
  memo_created: 'Saved memo',
  journal_created: 'Saved journal entry',
  media_added: 'Added to library',
  transaction_created: 'Recorded transaction',
};

interface Props {
  query: string;
  onClose: () => void;
}

// AIPaletteAnswer renders one round-trip with the AI inside the palette.
// Single-turn: user types `@sajni <prompt>`, presses Enter, gets a streamed
// answer here. "Continue in chat" hands off to the sidebar Sheet.
export default function AIPaletteAnswer({ query, onClose }: Props) {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState('');
  const [tools, setTools] = useState<ToolResult[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  // Bumped by the "Try again" affordance to force the streaming
  // effect to re-run with the same query.
  const [retryNonce, setRetryNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuery = useRef('');
  // Captured from the SSE `done` event — the genai.Content history of
  // this exchange. Used to seed a real chat session when the user
  // clicks "Continue in chat".
  const historyRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!query) {
      setAnswer('');
      setTools([]);
      setError(null);
      historyRef.current = [];
      return;
    }
    // Bypass the dedupe when retryNonce changes so "Try again" can
    // re-stream the same query.
    if (query === lastQuery.current && retryNonce === 0) return;
    lastQuery.current = query;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setAnswer('');
    setTools([]);
    setError(null);
    setStreaming(true);
    historyRef.current = [];

    const onEvent = (ev: AIEvent) => {
      switch (ev.type) {
        case 'delta':
          if (ev.data?.text) setAnswer((s) => s + ev.data.text);
          break;
        case 'tool_result':
          setTools((arr) => [...arr, ev.data as ToolResult]);
          break;
        case 'error':
          setError(ev.data?.message || 'AI error');
          break;
        case 'done':
          if (Array.isArray(ev.data?.history)) {
            historyRef.current = ev.data.history;
          }
          setStreaming(false);
          break;
      }
    };

    ai.chat({ message: query, mode: 'palette' }, onEvent, ac.signal)
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setError(e?.message || 'AI error');
      })
      .finally(() => setStreaming(false));

    return () => ac.abort();
  }, [query, retryNonce]);

  const continueInChat = async () => {
    if (adopting) return;
    setAdopting(true);
    try {
      const history = historyRef.current;
      if (history.length > 0) {
        const r = await ai.adoptSession(history);
        onClose();
        window.dispatchEvent(new CustomEvent('chat:open', { detail: { sessionId: r.id } }));
      } else {
        // Stream didn't finish or no history — fall back to seeding the
        // chat with the original query so the user can resend.
        onClose();
        window.dispatchEvent(new CustomEvent('chat:open', { detail: { seedMessage: query } }));
      }
    } catch {
      onClose();
      window.dispatchEvent(new CustomEvent('chat:open', { detail: { seedMessage: query } }));
    } finally {
      setAdopting(false);
    }
  };

  const actions = tools.filter((t) => t.ok && t.meta?.kind);

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {!query && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Sparkles className="size-4" />
          Type a question after <kbd className="font-mono text-xs bg-muted px-1 py-0.5 rounded">@sajni</kbd> — try "what's on my plate today?"
        </div>
      )}

      {query && (
        <>
          <div className="flex items-start gap-2">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              {answer ? (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                </div>
              ) : streaming ? (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <M3CookieLoader size="sm" tone="tertiary" /> Thinking…
                </div>
              ) : (
                !error && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>The model didn't return text for this one.</div>
                    <button
                      onClick={() => setRetryNonce((n) => n + 1)}
                      className="text-primary hover:underline text-xs"
                    >
                      Try again
                    </button>
                  </div>
                )
              )}
              {streaming && answer && (
                <span className="inline-block w-1.5 h-3.5 align-baseline bg-primary/70 animate-pulse ml-0.5" />
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-md px-3 py-2">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {actions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {actions.map((a, i) => {
                const Icon = ACTION_ICONS[a.meta!.kind] || Sparkles;
                const label = ACTION_LABELS[a.meta!.kind] || a.meta!.kind;
                const route = a.meta?.route;
                return (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                      if (route) {
                        navigate(route);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2 text-left bg-accent/40 hover:bg-accent rounded-md px-3 py-2 transition-colors"
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="text-sm flex-1 truncate">{a.meta?.title}</span>
                    {route && <ArrowRight className="size-3.5 text-muted-foreground" />}
                  </motion.button>
                );
              })}
            </div>
          )}

          {!streaming && answer && (
            <button
              onClick={continueInChat}
              disabled={adopting}
              className="self-start mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {adopting ? (
                <><M3CookieLoader size="xs" tone="tertiary" /> Opening chat…</>
              ) : (
                <>Continue in chat <ArrowRight className="size-3" /></>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
