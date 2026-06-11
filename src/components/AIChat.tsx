import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Send, Plus, Trash2, ChevronDown, AlertCircle,
  CheckSquare, Target, BookOpen, Film, Wallet, ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ai, type AIEvent, type AISessionMeta } from '@/api';
import { SKILLS } from '@/lib/aiSkills';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useIsMobile } from '@/hooks/use-mobile';

// Tracks the *visual* viewport height while the chat is open so the
// composer stays above the on-screen keyboard. On iOS Safari the
// layout viewport keeps its size when the keyboard appears — dvh units
// don't shrink — so a fixed full-height sheet leaves the input hidden
// behind the keyboard. visualViewport reports the truth on both
// platforms; offsetTop covers iOS pushing the viewport upward.
function useVisualViewportBox(active: boolean) {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) { setBox(null); return; }
    const update = () => setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return box;
}

interface ToolResultMeta {
  kind: string;
  id?: number;
  title?: string;
  route?: string;
}
interface ToolResultEvent {
  name: string;
  ok: boolean;
  error?: string;
  meta?: ToolResultMeta;
}

type Message =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      tools: ToolResultEvent[];
      streaming: boolean;
      error?: string | null;
    };

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
  transaction_updated: Wallet,
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
  transaction_updated: 'Updated transaction',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AIChat({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<AISessionMeta[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load AI status + session list on first open.
  useEffect(() => {
    if (!open || enabled !== null) return;
    ai.status()
      .then((s) => setEnabled(!!s.enabled))
      .catch(() => setEnabled(false));
  }, [open, enabled]);

  useEffect(() => {
    if (!open || !enabled) return;
    ai.listSessions().then(setSessions).catch(() => {});
  }, [open, enabled]);

  // External event opens the panel and optionally:
  //   • adopts an existing session id (palette → "Continue in chat" hands
  //     off the persisted exchange so the chat picks up mid-stream), or
  //   • seeds a message to send immediately (legacy fallback).
  useEffect(() => {
    const onChatOpen = (e: Event) => {
      onOpenChange(true);
      const detail = (e as CustomEvent).detail || {};
      const sid = detail.sessionId as number | undefined;
      const seed = detail.seedMessage as string | undefined;
      if (sid) {
        setTimeout(() => { void loadSession(sid); }, 50);
      } else if (seed) {
        setInput(seed);
        setTimeout(() => { void send(seed); }, 50);
      }
    };
    window.addEventListener('chat:open', onChatOpen);
    return () => window.removeEventListener('chat:open', onChatOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoscroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming]);

  // Focus input when the sheet opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionId) return sessionId;
    try {
      const r = await ai.createSession();
      setSessionId(r.id);
      ai.listSessions().then(setSessions).catch(() => {});
      return r.id;
    } catch {
      return null;
    }
  }, [sessionId]);

  const loadSession = useCallback(async (id: number) => {
    abortRef.current?.abort();
    setShowSessions(false);
    setSessionId(id);
    setMessages([]);
    setError(null);
    try {
      const sess = await ai.getSession(id);
      const msgs: Message[] = [];
      for (const c of sess.messages) {
        if (!c?.parts) continue;
        const text = c.parts.map((p) => p.text || '').filter(Boolean).join('');
        if (!text) continue;
        if (c.role === 'user') msgs.push({ role: 'user', text });
        else msgs.push({ role: 'assistant', text, tools: [], streaming: false });
      }
      setMessages(msgs);
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load session');
    }
  }, []);

  const newChat = () => {
    abortRef.current?.abort();
    setSessionId(null);
    setMessages([]);
    setError(null);
    setShowSessions(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await ai.deleteSession(id).catch(() => {});
    setSessions((s) => s.filter((x) => x.id !== id));
    if (sessionId === id) newChat();
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);
      const sid = await ensureSession();

      // Append user message + a placeholder assistant message.
      setMessages((m) => [
        ...m,
        { role: 'user', text: trimmed },
        { role: 'assistant', text: '', tools: [], streaming: true },
      ]);
      setInput('');
      setStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;

      const onEvent = (ev: AIEvent) => {
        setMessages((arr) => {
          const out = [...arr];
          const last = out[out.length - 1];
          if (!last || last.role !== 'assistant') return out;
          const nextLast = { ...last };
          switch (ev.type) {
            case 'delta':
              if (ev.data?.text) nextLast.text = (nextLast.text || '') + ev.data.text;
              break;
            case 'tool_result':
              nextLast.tools = [...nextLast.tools, ev.data as ToolResultEvent];
              break;
            case 'error':
              nextLast.error = ev.data?.message || 'AI error';
              break;
            case 'done':
              nextLast.streaming = false;
              break;
          }
          out[out.length - 1] = nextLast;
          return out;
        });

        // Hook: when the AI mutates user data, broadcast a refresh ping
        // so any open page can refetch. Pages that don't listen are no-ops.
        if (ev.type === 'tool_result' && (ev.data as ToolResultEvent)?.meta?.kind) {
          window.dispatchEvent(
            new CustomEvent('data:invalidate', {
              detail: (ev.data as ToolResultEvent).meta,
            }),
          );
        }
      };

      try {
        await ai.chat(
          { session_id: sid ?? undefined, message: trimmed, mode: 'chat' },
          onEvent,
          ac.signal,
        );
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setError(e?.message || 'AI error');
        setMessages((arr) => {
          const out = [...arr];
          const last = out[out.length - 1];
          if (last && last.role === 'assistant') {
            out[out.length - 1] = { ...last, streaming: false, error: e?.message || 'AI error' };
          }
          return out;
        });
      } finally {
        setStreaming(false);
        // Refresh session list (title may have changed).
        ai.listSessions().then(setSessions).catch(() => {});
      }
    },
    [ensureSession, streaming],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const showEmptyState = messages.length === 0 && !streaming;

  const isMobile = useIsMobile();
  const vvBox = useVisualViewportBox(open && isMobile);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="md:!max-w-md w-full max-md:!max-w-full max-md:!rounded-none flex flex-col p-0 gap-0"
        style={
          isMobile && vvBox
            ? { height: vvBox.height, top: vvBox.top, bottom: 'auto' }
            : undefined
        }
      >
        <SheetHeader className="p-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="size-4" />
            </div>
            <SheetTitle className="font-serif text-base flex-1">Sajni</SheetTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSessions((v) => !v)}
              className="font-mono text-xs uppercase tracking-wider"
              title="Switch chat"
            >
              History <ChevronDown className={`size-3 ml-1 transition-transform ${showSessions ? 'rotate-180' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={newChat}
              title="Start a new chat"
              className="font-mono text-xs uppercase tracking-wider"
            >
              <Plus className="size-3 mr-1" /> New
            </Button>
          </div>

          {showSessions && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
              {sessions.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No previous chats.</div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`group px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-accent ${s.id === sessionId ? 'bg-accent' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{s.title || 'New chat'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.updated_at?.slice(0, 10)}</div>
                    </div>
                    <button
                      onClick={(e) => removeSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 hover:text-rose-500 transition"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {enabled === false && (
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              AI is not configured on this server. Set <code className="font-mono text-xs">GEMINI_API_KEY</code> in the backend env to enable.
            </div>
          )}

          {showEmptyState && enabled !== false && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Your second brain. Ask anything about your data, or just describe what to capture.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SKILLS.map((sk) => {
                  const Icon = sk.icon;
                  return (
                    <button
                      key={sk.id}
                      onClick={() => send(sk.prompt)}
                      className="flex items-start gap-2 text-left bg-accent/30 hover:bg-accent rounded-md px-3 py-2 transition-colors"
                    >
                      <Icon className="size-3.5 mt-0.5 shrink-0 text-primary" />
                      <span className="text-xs leading-snug">{sk.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap break-words">
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={i}
                msg={m}
                onActionClick={(route) => {
                  navigate(route);
                  onOpenChange(false);
                }}
              />
            ),
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-md px-3 py-2">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={enabled === false ? 'AI disabled' : 'Ask Sajni…  (Shift+Enter for newline)'}
              disabled={enabled === false}
              rows={1}
              className="flex-1 resize-none bg-transparent border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40 max-h-32 disabled:opacity-50"
              style={{ minHeight: 38 }}
            />
            <Button
              size="icon"
              onClick={() => void send(input)}
              disabled={!input.trim() || streaming || enabled === false}
              title="Send"
            >
              {streaming ? <M3CookieLoader size="sm" tone="primary" className="!text-primary-foreground" /> : <Send className="size-4" />}
            </Button>
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mt-2 text-center">
            Sajni can make mistakes. Verify before acting.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AssistantMessage({
  msg,
  onActionClick,
}: {
  msg: Extract<Message, { role: 'assistant' }>;
  onActionClick: (route: string) => void;
}) {
  const actions = msg.tools.filter((t) => t.ok && t.meta?.kind);
  const calls = msg.tools.filter((t) => !t.ok || !t.meta?.kind);

  return (
    <div className="flex items-start gap-2">
      <div className="size-6 rounded-md bg-primary/15 text-primary flex items-center justify-center mt-0.5 shrink-0">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {calls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {calls.map((t, i) => (
              <span
                key={i}
                className={`font-mono text-xs uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  t.ok ? 'bg-muted text-muted-foreground' : 'bg-rose-500/10 text-rose-600'
                }`}
                title={t.error || t.name}
              >
                {t.ok ? 'used' : 'failed'} {t.name}
              </span>
            ))}
          </div>
        )}

        {msg.text ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>
        ) : msg.streaming ? (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <M3CookieLoader size="sm" tone="tertiary" /> Thinking…
          </div>
        ) : null}

        {msg.streaming && msg.text && (
          <span className="inline-block w-1.5 h-3.5 align-baseline bg-primary/70 animate-pulse" />
        )}

        {actions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {actions.map((a, i) => {
              const Icon = ACTION_ICONS[a.meta!.kind] || Sparkles;
              const label = ACTION_LABELS[a.meta!.kind] || a.meta!.kind;
              const route = a.meta?.route;
              return (
                <button
                  key={i}
                  onClick={() => route && onActionClick(route)}
                  className="flex items-center gap-2 text-left bg-accent/40 hover:bg-accent rounded-md px-3 py-2 transition-colors"
                >
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
                  <span className="text-sm flex-1 truncate">{a.meta?.title}</span>
                  {route && <ArrowRight className="size-3.5 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        )}

        {msg.error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded px-2 py-1">
            {msg.error}
          </div>
        )}
      </div>
    </div>
  );
}
