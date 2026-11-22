import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowUp,
  Plus,
  Trash2,
  ChevronDown,
  AlertCircle,
  CheckSquare,
  Target,
  BookOpen,
  Film,
  Wallet,
  ArrowRight,
  X,
} from '@/components/ui/icons';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ai, type AIEvent, type AISessionMeta, type AIToolResult } from '@/api';
import { SKILLS } from '@/lib/aiSkills';
import { aborted, msg } from '@/lib/errors';
import { M3CookieLoader } from '@/components/ui/shapes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardOpen } from '@/hooks/use-keyboard-open';
import { useVisualViewportBox } from '@/hooks/use-visual-viewport';
import { cn } from '@/lib/utils';
import { DOCK_DEFAULT, clampDock } from '@/lib/chatDock';

type Message =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      tools: AIToolResult[];
      streaming: boolean;
      error?: string | null;
    };

const ACTION_ICONS: Record<string, typeof CheckSquare> = {
  task_created: CheckSquare,
  task_done: CheckSquare,
  task_completed: CheckSquare, // saved chats from before 2026-11-22
  task_deleted: CheckSquare,
  habit_created: Target,
  habit_logged: Target,
  memo_created: Sparkles,
  journal_created: BookOpen,
  media_added: Film,
  transaction_created: Wallet,
  transaction_updated: Wallet,
  lend_created: Wallet,
  lend_repayment_created: Wallet,
  lend_updated: Wallet,
  theme_created: Sparkles,
  theme_activated: Sparkles,
};

const ACTION_LABELS: Record<string, string> = {
  task_created: 'Created task',
  task_done: 'Marked task done',
  task_completed: 'Marked task done',
  task_deleted: 'Deleted task',
  habit_created: 'Created habit',
  habit_logged: 'Logged habit',
  memo_created: 'Saved memo',
  journal_created: 'Saved journal entry',
  media_added: 'Added to library',
  transaction_created: 'Recorded transaction',
  transaction_updated: 'Updated transaction',
  lend_created: 'Recorded lend',
  lend_repayment_created: 'Recorded repayment',
  lend_updated: 'Updated lend',
  theme_created: 'Created theme',
  theme_activated: 'Activated theme',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openRequest?: ChatOpenRequest | null;
  /** Desktop: dock beside the page instead of a modal sheet. */
  dock?: { mode: 'push' | 'overlay'; width: number; onResize: (width: number) => void };
}

export interface ChatOpenDetail {
  sessionId?: number;
  seedMessage?: string;
}

export interface ChatOpenRequest {
  id: number;
  detail: ChatOpenDetail;
}

// Global chat surface: docked beside the page on desktop, a right-side
// sheet on phones. The actual chat UI lives in ChatPanel so the Projects
// page can embed the same panel inline.
export default function AIChat({ open, onOpenChange, openRequest, dock }: Props) {
  const isMobile = useIsMobile();
  const vvBox = useVisualViewportBox(open && isMobile);
  if (dock) {
    return <ChatDock {...dock} openRequest={openRequest} onClose={() => onOpenChange(false)} />;
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-full !max-w-full flex-col gap-0 !rounded-none p-0"
        style={isMobile && vvBox ? { height: vvBox.height, top: vvBox.top, bottom: 'auto' } : undefined}
      >
        <ChatPanel active={open} sheet openRequest={openRequest} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

const DOCK_EASE = [0.2, 0, 0, 1] as const;

// Docked Sajni: no scrim and no blur, so the page stays readable and
// clickable while you ask. `push` narrows the page (wide screens);
// `overlay` sits over its right edge when there's no room to push. It's
// set apart by tone, like the Notes rails. Drag its edge to resize
// (double-click resets); Esc closes it while focus is inside.
function ChatDock({
  mode,
  width,
  onResize,
  onClose,
  openRequest,
}: {
  mode: 'push' | 'overlay';
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
  openRequest?: ChatOpenRequest | null;
}) {
  const [dragging, setDragging] = useState(false);
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    setDragging(true);
    const move = (ev: PointerEvent) => onResize(clampDock(w0 + x0 - ev.clientX));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      delete document.documentElement.dataset.dockDrag;
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Page chrome follows the edge exactly while dragging (index.css).
    document.documentElement.dataset.dockDrag = '';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <motion.aside
      aria-label="Sajni"
      initial={{ width: 0 }}
      animate={{ width }}
      exit={{ width: 0, transition: { duration: 0.2, ease: DOCK_EASE } }}
      // Follow the pointer exactly while dragging; ease only on open/close.
      transition={dragging ? { duration: 0 } : { duration: 0.32, ease: DOCK_EASE }}
      onKeyDown={(e) => {
        // Only keys from inside the panel's own DOM (not portals it opened).
        if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
          e.stopPropagation();
          onClose();
        }
      }}
      className={cn(
        'flex shrink-0 overflow-hidden bg-[hsl(var(--surface-container-low))]',
        // Overlay sits above the nav pill, which it would otherwise run into.
        mode === 'overlay' ? 'absolute inset-y-0 right-0 z-50 shadow-[var(--m3-elev-3)]' : 'relative',
      )}
    >
      <div className="flex h-full shrink-0 flex-col pt-[env(safe-area-inset-top)]" style={{ width }}>
        <ChatPanel active openRequest={openRequest} onClose={onClose} />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Sajni"
        title="Drag to resize · double-click to reset"
        onPointerDown={startDrag}
        onDoubleClick={() => onResize(DOCK_DEFAULT)}
        className="group/resize absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 w-0.5 transition-colors',
            dragging ? 'bg-[hsl(var(--primary))]' : 'group-hover/resize:bg-[hsl(var(--primary)/0.5)]',
          )}
        />
      </div>
    </motion.aside>
  );
}

// Host-side controls for a headerless panel (the Projects page pill owns
// the New-chat / History buttons and drives them through this handle).
export interface ChatPanelHandle {
  newChat: () => void;
  toggleHistory: () => void;
}

// ChatPanel — header + transcript + composer, host-agnostic. `sheet` pads
// the header clear of the sheet's absolute close X. The global sheet receives
// open requests from Layout; embedded panels do not.
// `headerless` drops the in-panel header for immersive embedding — the
// host renders New/History elsewhere and calls them via `ref`.
// `onClose` adds a close button to the header (the docked panel).
export function ChatPanel({
  active,
  sheet = false,
  headerless = false,
  openRequest,
  onNavigate,
  onClose,
  ref,
}: {
  active: boolean;
  sheet?: boolean;
  headerless?: boolean;
  openRequest?: ChatOpenRequest | null;
  onNavigate?: () => void;
  onClose?: () => void;
  ref?: Ref<ChatPanelHandle>;
}) {
  const navigate = useNavigate();
  const isMobilePanel = useIsMobile();
  const keyboardOpen = useKeyboardOpen(headerless && isMobilePanel);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<AISessionMeta[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handledOpenRequestRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const resizeComposer = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    textarea.style.overflowY = 'hidden';
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const chrome =
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    const maxHeight = lineHeight * 4 + chrome;
    const contentHeight =
      textarea.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);
  useEffect(() => {
    window.addEventListener('resize', resizeComposer);
    return () => window.removeEventListener('resize', resizeComposer);
  }, [resizeComposer]);

  // Load AI status + session list on first activation.
  useEffect(() => {
    if (!active || enabled !== null) return;
    ai.status()
      .then((s) => setEnabled(!!s.enabled))
      .catch(() => setEnabled(false));
  }, [active, enabled]);

  useEffect(() => {
    if (!active || !enabled) return;
    ai.listSessions()
      .then(setSessions)
      .catch(() => {});
  }, [active, enabled]);

  // Autoscroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming]);

  // Focus input on activation.
  useEffect(() => {
    if (active) requestAnimationFrame(() => inputRef.current?.focus());
  }, [active]);

  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionId) return sessionId;
    try {
      const r = await ai.createSession();
      setSessionId(r.id);
      ai.listSessions()
        .then(setSessions)
        .catch(() => {});
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
        const text = c.parts
          .map((p) => p.text || '')
          .filter(Boolean)
          .join('');
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

  useImperativeHandle(ref, () => ({
    newChat,
    toggleHistory: () => setShowSessions((v) => !v),
  }));

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
              nextLast.tools = [...nextLast.tools, ev.data];
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
        if (ev.type === 'tool_result' && ev.data.meta?.kind) {
          window.dispatchEvent(
            new CustomEvent('data:invalidate', {
              detail: ev.data.meta,
            }),
          );
        }
      };

      try {
        await ai.chat({ session_id: sid ?? undefined, message: trimmed, mode: 'chat' }, onEvent, ac.signal);
      } catch (e) {
        if (aborted(e)) return;
        const text = msg(e, 'AI error');
        setError(text);
        setMessages((arr) => {
          const out = [...arr];
          const last = out[out.length - 1];
          if (last && last.role === 'assistant') {
            out[out.length - 1] = { ...last, streaming: false, error: text };
          }
          return out;
        });
      } finally {
        setStreaming(false);
        // Refresh session list (title may have changed).
        ai.listSessions()
          .then(setSessions)
          .catch(() => {});
      }
    },
    [ensureSession, streaming],
  );

  // A request from Layout optionally:
  //   • adopts an existing session id (palette → "Continue in chat" hands
  //     off the persisted exchange so the chat picks up mid-stream), or
  //   • seeds a message to send immediately (legacy fallback).
  useEffect(() => {
    if (!openRequest || handledOpenRequestRef.current === openRequest.id) return;
    handledOpenRequestRef.current = openRequest.id;
    const { sessionId, seedMessage } = openRequest.detail;
    if (sessionId) {
      setTimeout(() => {
        void loadSession(sessionId);
      }, 50);
    } else if (seedMessage) {
      setTimeout(() => {
        setInput(seedMessage);
        void send(seedMessage);
      }, 50);
    }
  }, [loadSession, openRequest, send]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const showEmptyState = messages.length === 0 && !streaming;

  const sessionsList = (
    <>
      {sessions.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">No previous chats.</div>
      ) : (
        sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => loadSession(s.id)}
            className={`group flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-accent ${s.id === sessionId ? 'bg-accent' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.title || 'New chat'}</div>
              <div className="font-mono text-xs text-muted-foreground">{s.updated_at?.slice(0, 10)}</div>
            </div>
            <Button
              variant="destructive-ghost"
              size="icon-xs"
              onClick={(e) => removeSession(s.id, e)}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              title="Delete"
              aria-label="Delete chat"
            >
              <Trash2 />
            </Button>
          </div>
        ))
      )}
    </>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!headerless && (
        <div className="border-b border-border p-4 pb-3">
          {/* pr-10 clears the sheet's absolute close X (top-4 right-4) so
                the New button never sits underneath it. */}
          <div className={`flex items-center gap-2 ${sheet ? 'pr-10' : ''}`}>
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="flex-1 font-serif text-base font-semibold">Sajni</div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSessions((v) => !v)}
              className="label-kicker font-mono text-xs"
              title="Switch chat"
            >
              History <ChevronDown className={`ml-1 size-3 transition-transform ${showSessions ? 'rotate-180' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={newChat}
              title="Start a new chat"
              className="label-kicker font-mono text-xs"
            >
              <Plus className="mr-1 size-3" /> New
            </Button>
            {onClose && (
              <Button size="icon-sm" variant="ghost" onClick={onClose} title="Close · Esc" aria-label="Close Sajni">
                <X className="size-4" />
              </Button>
            )}
          </div>

          {showSessions && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
              {sessionsList}
            </div>
          )}
        </div>
      )}

      {/* Headerless history — floats over the transcript; the host's
            pill History button toggles it through the imperative handle. */}
      {headerless && showSessions && (
        <div className="absolute top-2 left-1/2 z-20 max-h-64 w-[min(94%,380px)] -translate-x-1/2 overflow-y-auto rounded-2xl bg-popover shadow-lg">
          {sessionsList}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {enabled === false && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            AI is not configured on this server. Set <code className="font-mono text-xs">GEMINI_API_KEY</code> in the
            backend env to enable.
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
                    className="flex items-start gap-2 rounded-md bg-accent/30 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
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
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground">
                {m.text}
              </div>
            </div>
          ) : (
            <AssistantMessage
              key={i}
              msg={m}
              onActionClick={(route) => {
                navigate(route);
                onNavigate?.();
                const [_, hash] = route.split('#');
                if (hash) {
                  setTimeout(() => {
                    document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  }, 100);
                }
              }}
            />
          ),
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-error-container px-3 py-2 text-sm text-on-error-container">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}
      </div>

      {/* Composer — one floating tonal pill; no hairline, no footer
            text. Headerless-on-mobile pads clear of the bottom dock, and
            drops that padding while the keyboard is up (dock hides). */}
      <div
        className="p-3 pt-1.5"
        style={{
          paddingBottom:
            headerless && isMobilePanel && !keyboardOpen
              ? 'calc(env(safe-area-inset-bottom, 0px) + 82px)'
              : 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-end gap-1 rounded-3xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container))] p-1.5 pl-4 transition-colors focus-within:border-[hsl(var(--outline))]">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={enabled === false ? 'AI disabled' : 'Ask Sajni…'}
            disabled={enabled === false}
            rows={1}
            className="min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-sm leading-6 shadow-none placeholder:text-muted-foreground/70 hover:border-0 focus-visible:border-0 focus-visible:shadow-none"
            title="Shift+Enter for newline"
          />
          <Button
            size="icon-sm"
            onClick={() => void send(input)}
            disabled={!input.trim() || streaming || enabled === false}
            className="mb-0.5 shrink-0 rounded-full"
            title="Send"
            aria-label="Send"
          >
            {streaming ? (
              <M3CookieLoader size="sm" tone="primary" className="!text-primary-foreground" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
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
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {calls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {calls.map((t, i) => (
              <span
                key={i}
                className={`label-kicker rounded px-1.5 py-0.5 font-mono text-xs ${
                  t.ok ? 'bg-muted text-muted-foreground' : 'bg-error-container text-on-error-container'
                }`}
                title={t.error || t.name}
              >
                {t.ok ? 'used' : 'failed'} {t.name}
              </span>
            ))}
          </div>
        )}

        {msg.text ? (
          <div className="prose prose-sm max-w-none break-words dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => {
                  const isInternal = href?.startsWith('/');
                  if (isInternal && href) {
                    return (
                      <a
                        href={href}
                        onClick={(e) => {
                          e.preventDefault();
                          onActionClick(href);
                        }}
                        className="cursor-pointer text-primary hover:underline"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  );
                },
              }}
            >
              {msg.text}
            </ReactMarkdown>
          </div>
        ) : msg.streaming ? (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <M3CookieLoader size="sm" tone="tertiary" /> Thinking…
          </div>
        ) : null}

        {msg.streaming && msg.text && (
          <span className="inline-block h-3.5 w-1.5 animate-pulse bg-primary/70 align-baseline" />
        )}

        {actions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {actions.map((a, i) => {
              const Icon = ACTION_ICONS[a.meta!.kind] || Sparkles;
              const label = ACTION_LABELS[a.meta!.kind] || a.meta!.label || a.meta!.kind;
              const route = a.meta?.route;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => route && onActionClick(route)}
                  className="flex items-center gap-2 rounded-md bg-accent/40 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="label-kicker font-mono text-xs text-muted-foreground">{label}</span>
                  <span className="flex-1 truncate text-sm">{a.meta?.title}</span>
                  {route && <ArrowRight className="size-3.5 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        )}

        {msg.error && (
          <div className="rounded bg-error-container px-2 py-1 text-xs text-on-error-container">{msg.error}</div>
        )}
      </div>
    </div>
  );
}
