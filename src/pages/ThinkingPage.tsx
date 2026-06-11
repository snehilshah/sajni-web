import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { thinking, type ThinkingProject } from '@/api';
import { confirmDialog } from '@/lib/confirm';

export default function ThinkingPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ThinkingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const data = await thinking.listProjects();
      setProjects(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const r = await thinking.createProject({ title: title.trim(), description: desc.trim() });
      setOpen(false);
      setTitle(''); setDesc('');
      navigate(`/thinking/${r.id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await confirmDialog('Delete this thinking project and all its cards?'))) return;
    await thinking.deleteProject(id);
    load();
  };

  return (
    <PageShell
      caption={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
      title="Thinking (Beta)"
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1" /> New
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/thinking/${p.id}`)}
              className="group cursor-pointer rounded-2xl border border-border bg-[hsl(var(--surface-container-low))] p-4 hover:bg-[hsl(var(--surface-container))] transition-colors"
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
              <div className="mt-3 flex items-center justify-between text-xs mono uppercase tracking-wider text-muted-foreground">
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
            <DialogTitle>New thinking project</DialogTitle>
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
