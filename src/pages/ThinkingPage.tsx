import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Sparkles, Trash2, MessageSquare, Lightbulb, History } from '@/components/ui/icons';
import { formatDistanceToNow } from 'date-fns';

import PageShell, { PageChrome, PageShellTabs } from '@/components/PageShell';
import { ChatPanel, type ChatPanelHandle } from '@/components/AIChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  useThinkingProjects, useCreateThinkingProject, useDeleteThinkingProject,
} from '@/queries/thinking';
import { confirmDialog } from '@/lib/confirm';

const PROJECT_TABS = [
  { key: 'projects', label: 'Projects', icon: Lightbulb },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
] as const;
type ProjectTab = (typeof PROJECT_TABS)[number]['key'];

// Projects (né Thinking) — thought projects + the Sajni chat, one surface.
export default function ThinkingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ProjectTab = searchParams.get('tab') === 'chat' ? 'chat' : 'projects';
  const switchTab = (key: ProjectTab) => setSearchParams(key === 'projects' ? {} : { tab: key }, { replace: true });
  const { data: projects = [], isLoading: loading } = useThinkingProjects();
  const createProject = useCreateThinkingProject();
  const deleteProject = useDeleteThinkingProject();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const chatRef = useRef<ChatPanelHandle>(null);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const r = await createProject.mutateAsync({ title: title.trim(), description: desc.trim() });
      setOpen(false);
      setTitle(''); setDesc('');
      navigate(`/projects/${r.id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await confirmDialog('Delete this thinking project and all its cards?'))) return;
    await deleteProject.mutateAsync(id);
  };

  const navigationEl = (
    <PageShellTabs
      bare
      ariaLabel="Projects sections"
      value={tab}
      options={PROJECT_TABS.map(({ key, label, icon }) => ({ value: key, label, icon }))}
      onChange={switchTab}
    />
  );

  // Chat tab is immersive: no card, no internal chrome — pill owns
  // History/New, the panel fills everything under it edge to edge.
  if (tab === 'chat') {
    return (
      <div className="page-fade-in flex-1 flex flex-col min-h-0">
        <PageChrome
          title="Projects"
          navigation={navigationEl}
          actions={
            <>
              <Button
                variant="ghost" size="icon-sm" className="rounded-full"
                onClick={() => chatRef.current?.toggleHistory()}
                title="Chat history" aria-label="Chat history"
              >
                <History className="size-4" />
              </Button>
              <Button size="sm" onClick={() => chatRef.current?.newChat()} className="gap-1.5" title="New chat">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">New chat</span>
              </Button>
            </>
          }
        />
        <div className="flex-1 min-h-0 flex flex-col w-full max-w-3xl mx-auto">
          <ChatPanel active headerless ref={chatRef} />
        </div>
      </div>
    );
  }

  return (
    <PageShell
      title="Projects"
      navigation={navigationEl}
      actions={
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-3.5" /> New project
        </Button>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-3">
          <Sparkles className="size-8 mx-auto text-primary" />
          <div className="serif text-lg">Start thinking</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">
            Projects hold typed thought-cards — questions, ideas, claims, evidence.
            Sajni enriches each card with meaning, then synthesizes a thesis.
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-1" /> New project</Button>
        </div>
      ) : (
        <div className="sajni-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="group cursor-pointer flex flex-col rounded-2xl border border-border bg-[hsl(var(--surface-container-low))] p-4 hover:bg-[hsl(var(--surface-container))] transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="serif font-semibold truncate">{p.title}</div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 hover:text-rose-500 transition"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {p.thesis && (
                <div className="mt-3 text-xs italic text-foreground/70 line-clamp-3 border-l-2 border-primary/40 pl-2">
                  {p.thesis}
                </div>
              )}
              {/* mt-auto pins the meta bar to the card's bottom edge, so rows
                  of cards keep aligned footers even when description/thesis
                  are absent (grid items stretch to equal height). */}
              <div className="mt-auto pt-3 flex items-center justify-between text-xs mono uppercase tracking-wider text-muted-foreground">
                <span>{p.card_count} {p.card_count === 1 ? 'card' : 'cards'}</span>
                <span>{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Title — what are you thinking about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            />
            <Input
              placeholder="Optional one-line description"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={!title.trim() || creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
