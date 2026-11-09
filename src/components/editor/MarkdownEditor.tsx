import { lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { acceptCompletion, completionKeymap } from '@codemirror/autocomplete';
import { classHighlighter } from '@lezer/highlight';

import { notes as notesApi, tags as tagsApi, tasks as tasksApi, taskLists as listsApi, uploads, links as linksApi } from '@/api';
import type { Note, Task, TaskList as TaskListModel } from '@/types';
import { qk } from '@/queries/keys';
import { msg } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bold, Heading2, Italic, Link2, List, ListChecks, Plus, Image as ImageIcon } from '@/components/ui/icons';
import type { TaskDefaults } from '@/components/tasks/TaskFormDialog';

import { sajniMarkdown } from './cm/syntax';
import { editorHooks, editorMode, livePreview, refreshDecorations, type EditorHooks, type EditorMode } from './cm/live';
import { formattingKeymap, insertText, setLineKind, toggleWrap } from './cm/commands';
import { sajniCompletion } from './cm/complete';
import { vimExtension } from './cm/vim';
import './editor.css';

const TaskFormDialog = lazy(() => import('@/components/tasks/TaskFormDialog'));

export type { EditorMode };

export interface MarkdownEditorHandle {
  focus: (at?: 'start' | 'end') => void;
  /** Scrolls the n-th heading (document order) to the top. */
  revealHeading: (index: number) => void;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** live (default) · source · read. */
  mode?: EditorMode;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  minHeight?: string;
  /** Grow to fill a flex-column parent; the empty space below focuses the end. */
  fill?: boolean;
  /** The day a task created from /task is due by default (journal pages). */
  contextDate?: string;
  /** Formatting buttons above the text: always (`compact`), or only on touch screens (default). */
  toolbar?: 'compact' | 'touch' | 'none';
  /** Pasted or dropped images go here instead of into the text. */
  onImageFiles?: (files: File[]) => void;
  /** Vim keys (Notes and Journal, when turned on in Settings). Off in read mode. */
  vim?: boolean;
  /** Save now; Vim's `:w`. */
  onSave?: () => void;
  /** The page's VimStatusBar element, where Vim shows its mode, prompts and messages. */
  vimStatus?: HTMLElement | null;
  ariaLabel?: string;
  ref?: Ref<MarkdownEditorHandle>;
}

const BARE_URL = /^https?:\/\/\S+$/i;

export default function MarkdownEditor({
  value, onChange, mode = 'live', placeholder, className, autoFocus, minHeight, fill, contextDate,
  toolbar = 'touch', onImageFiles, ariaLabel, vim = false, onSave, vimStatus = null, ref,
}: MarkdownEditorProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modeComp = useRef(new Compartment());
  const placeholderComp = useRef(new Compartment());
  // Vim sits ahead of every other keymap; it's loaded the first time it's on.
  const vimComp = useRef(new Compartment());
  const vimExtRef = useRef<Extension>([]);
  const [focused, setFocused] = useState(false);
  const extensionsRef = useRef<Extension[]>([]);
  const modeRef = useRef(mode);
  const placeholderRef = useRef(placeholder);
  useLayoutEffect(() => { modeRef.current = mode; placeholderRef.current = placeholder; });

  // Latest props, read from CodeMirror callbacks that are bound once.
  const onChangeRef = useRef(onChange);
  const onImageFilesRef = useRef(onImageFiles);
  const onSaveRef = useRef(onSave);
  useLayoutEffect(() => { onChangeRef.current = onChange; onImageFilesRef.current = onImageFiles; onSaveRef.current = onSave; });

  // /task picker + create dialog
  const [taskPicker, setTaskPicker] = useState(false);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskQuery, setTaskQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createLists, setCreateLists] = useState<TaskListModel[]>([]);
  const [createDefaults, setCreateDefaults] = useState<TaskDefaults>({});
  // /link dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkFetching, setLinkFetching] = useState(false);

  const noteTitles = useCallback(() => {
    const list = qc.getQueryData<Note[]>(qk.notes.list());
    return list ? list.map((n) => n.title).filter(Boolean) : null;
  }, [qc]);

  const openWiki = useCallback(async (target: string) => {
    const t = target.trim();
    if (!t) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { navigate(`/journal?date=${t}`); return; }
    try {
      const list = await qc.fetchQuery({ queryKey: qk.notes.list(), queryFn: () => notesApi.list(), staleTime: 30_000 });
      const hit = list.find((n) => (n.title || '').toLowerCase() === t.toLowerCase());
      if (hit) { navigate(`/notes?id=${hit.id}`); return; }
      const created = await notesApi.create(t, '');
      void qc.invalidateQueries({ queryKey: qk.notes.all });
      navigate(`/notes?id=${created.id}`);
    } catch (err) {
      toast.error(msg(err, `Couldn't open “${t}”`));
    }
  }, [navigate, qc]);

  // ── Hooks the rendered pieces call ──────────────────────────────────────
  const hooks = useRef<EditorHooks>({} as EditorHooks);
  useLayoutEffect(() => {
   hooks.current = {
    openWiki: (target) => { void openWiki(target); },
    openTask: (id) => window.dispatchEvent(new CustomEvent('task:open', { detail: { id } })),
    openTag: (tag) => navigate(`/analytics?tab=tags&tag=${encodeURIComponent(tag)}`),
    wikiExists: (target) => {
      const titles = noteTitles();
      if (!titles) return true;
      const t = target.toLowerCase();
      return titles.some((x) => x.toLowerCase() === t);
    },
   };
  });

  const uploadImages = useCallback(async (files: File[]) => {
    const view = viewRef.current;
    if (!view || !files.length) return;
    const id = toast.loading(files.length > 1 ? 'Adding images…' : 'Adding image…');
    try {
      const parts: string[] = [];
      for (const f of files) {
        const res = await uploads.upload(f);
        parts.push(`![](${res.url})`);
      }
      const v = viewRef.current;
      if (v) {
        const at = v.state.selection.main;
        const line = v.state.doc.lineAt(at.from);
        const lead = line.text.trim() && at.from > line.from ? '\n' : '';
        insertText(v, `${lead}${parts.join('\n')}\n`);
      }
      toast.dismiss(id);
    } catch (err) {
      toast.error(msg(err, "Couldn't add the image"), { id });
    }
  }, []);

  const pickImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      if (!files.length) return;
      if (onImageFilesRef.current) onImageFilesRef.current(files);
      else void uploadImages(files);
    };
    input.click();
  }, [uploadImages]);

  const openTaskPicker = useCallback(() => {
    setTaskList([]);
    setTaskQuery('');
    setTaskPicker(true);
    setTaskLoading(true);
    qc.fetchQuery({ queryKey: qk.tasks.list({ smart: 'all' }), queryFn: () => tasksApi.list({ smart: 'all' }) })
      .then((list) => setTaskList(list.filter((t) => t.status !== 'done' && t.status !== 'scratched')))
      .catch(() => setTaskList([]))
      .finally(() => setTaskLoading(false));
  }, [qc]);

  const openLink = useCallback(() => {
    const view = viewRef.current;
    const sel = view?.state.selection.main;
    setLinkTitle(sel && !sel.empty ? view!.state.sliceDoc(sel.from, sel.to) : '');
    setLinkUrl('');
    setLinkOpen(true);
  }, []);

  const insertTaskChip = useCallback((t: Pick<Task, 'id' | 'title'>) => {
    const view = viewRef.current;
    setTaskPicker(false);
    if (!view) return;
    const title = t.title.replace(/[[\]|\n]/g, ' ').trim();
    insertText(view, `[[task:${t.id}|${title}]] `);
    view.focus();
  }, []);

  const commitLink = useCallback(() => {
    const view = viewRef.current;
    let url = linkUrl.trim();
    if (!view || !url) return;
    if (!/^[a-z]+:/i.test(url)) url = `https://${url}`;
    const label = (linkTitle.trim() || url).replace(/[[\]]/g, '');
    insertText(view, `[${label}](${url})`);
    setLinkOpen(false);
    view.focus();
  }, [linkTitle, linkUrl]);

  const fetchLinkTitle = useCallback(async () => {
    const u = linkUrl.trim();
    if (!u) return;
    setLinkFetching(true);
    try {
      const res = await linksApi.preview(/^https?:\/\//i.test(u) ? u : `https://${u}`);
      if (res?.title && res.title !== res.host) setLinkTitle(res.title);
    } catch { /* type a title instead */ } finally {
      setLinkFetching(false);
    }
  }, [linkUrl]);

  // Completion data (refetched at most once a minute).
  const tagCache = useRef<{ at: number; tags: string[] }>({ at: 0, tags: [] });
  const completionHooks = useRef({
    notes: async () => {
      const cached = noteTitles();
      if (cached) return cached;
      const list = await qc.fetchQuery({ queryKey: qk.notes.list(), queryFn: () => notesApi.list() }).catch(() => []);
      return list.map((n) => n.title).filter(Boolean);
    },
    tags: async () => {
      if (Date.now() - tagCache.current.at < 60_000) return tagCache.current.tags;
      const list = await tagsApi.list().catch(() => []);
      tagCache.current = { at: Date.now(), tags: list.map((t) => t.tag) };
      return tagCache.current.tags;
    },
    openLink: () => openLinkRef.current(),
    pickImage: () => pickImageRef.current(),
    openTaskPicker: () => openTaskPickerRef.current(),
  });
  const openLinkRef = useRef(openLink);
  const pickImageRef = useRef(pickImage);
  const openTaskPickerRef = useRef(openTaskPicker);
  useLayoutEffect(() => { openLinkRef.current = openLink; pickImageRef.current = pickImage; openTaskPickerRef.current = openTaskPicker; });

  const modeExtension = (m: EditorMode): Extension => [
    editorMode.of(m),
    EditorState.readOnly.of(m === 'read'),
    EditorView.editable.of(m !== 'read'),
  ];

  // ── Create the view once ───────────────────────────────────────────────
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const paste = EditorView.domEventHandlers({
      paste(event, view) {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) {
          event.preventDefault();
          if (onImageFilesRef.current) onImageFilesRef.current(files);
          else void uploadImages(files);
          return true;
        }
        const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
        if (!BARE_URL.test(text)) return false;
        const sel = view.state.selection.main;
        event.preventDefault();
        if (!sel.empty) {
          const label = view.state.sliceDoc(sel.from, sel.to);
          insertText(view, `[${label}](${text})`);
          return true;
        }
        insertText(view, text);
        linksApi.preview(text).then((res) => {
          if (!res?.title || res.title === text || res.title === res.host) return;
          toast('Found the page title', {
            description: res.title,
            action: {
              label: 'Use title',
              onClick: () => {
                const v = viewRef.current;
                if (!v) return;
                const doc = v.state.doc.toString();
                const at = doc.indexOf(text);
                if (at < 0) return;
                const label = res.title.replace(/[[\]]/g, '');
                v.dispatch({ changes: { from: at, to: at + text.length, insert: `[${label}](${text})` }, userEvent: 'input' });
              },
            },
          });
        }).catch(() => { /* keep the raw URL */ });
        return true;
      },
      drop(event, view) {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos != null) view.dispatch({ selection: { anchor: pos } });
        if (onImageFilesRef.current) onImageFilesRef.current(files);
        else void uploadImages(files);
        return true;
      },
    });

    const extensions: Extension[] = [
        markdown({ base: markdownLanguage, codeLanguages: languages, extensions: sajniMarkdown, addKeymap: true }),
        history(),
        keymap.of([
          ...formattingKeymap(() => openLinkRef.current()),
          ...completionKeymap,
          // Tab takes an open suggestion (like Enter); otherwise it indents.
          { key: 'Tab', run: acceptCompletion },
          { key: 'Tab', run: indentMore, shift: indentLess },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        syntaxHighlighting(classHighlighter),
        livePreview(),
        sajniCompletion(completionHooks.current),
        editorHooks.of(hooks),
        paste,
        EditorView.contentAttributes.of({
          'aria-label': ariaLabel ?? 'Text',
          spellcheck: 'true',
          autocorrect: 'on',
          autocapitalize: 'sentences',
        }),
        EditorView.updateListener.of((u) => {
          if (u.focusChanged) setFocused(u.view.hasFocus);
          if (!u.docChanged) return;
          onChangeRef.current(u.state.doc.toString());
        }),
    ];
    extensionsRef.current = extensions;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [vimComp.current.of(vimExtRef.current), ...extensions, modeComp.current.of(modeExtension(mode)), placeholderComp.current.of(placeholder ? cmPlaceholder(placeholder) : [])],
      }),
      parent,
    });
    viewRef.current = view;
    if (autoFocus) {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
    // Wikilinks learn which notes exist once the list loads or changes.
    const unsub = qc.getQueryCache().subscribe((e) => {
      const key = e.query.queryKey;
      if (e.type === 'updated' && key[0] === 'notes' && key[1] === 'list') {
        viewRef.current?.dispatch({ effects: refreshDecorations.of(null) });
      }
    });
    return () => {
      unsub();
      view.destroy();
      viewRef.current = null;
    };
    // Created once per mount; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new value from outside (another day, another task) starts a fresh
  // document: undo must never reach back into the previous one.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    const hadFocus = view.hasFocus;
    view.setState(EditorState.create({ doc: value, extensions: [vimComp.current.of(vimExtRef.current), ...extensionsRef.current, modeComp.current.of(modeExtension(modeRef.current)), placeholderComp.current.of(placeholderRef.current ? cmPlaceholder(placeholderRef.current) : [])] }));
    if (hadFocus) view.focus();
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: modeComp.current.reconfigure(modeExtension(mode)) });
  }, [mode]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: placeholderComp.current.reconfigure(placeholder ? cmPlaceholder(placeholder) : []) });
  }, [placeholder]);

  const vimOn = vim && mode !== 'read';
  useEffect(() => {
    let live = true;
    const apply = (ext: Extension) => {
      if (!live) return;
      vimExtRef.current = ext;
      viewRef.current?.dispatch({ effects: vimComp.current.reconfigure(ext) });
    };
    if (vimOn) {
      vimExtension(() => onSaveRef.current?.(), vimStatus).then(apply).catch(() => toast.error("Couldn't load Vim keys"));
    } else apply([]);
    return () => { live = false; };
  }, [vimOn, vimStatus]);

  useImperativeHandle(ref, () => ({
    focus: (at = 'end') => {
      const view = viewRef.current;
      if (!view) return;
      view.focus();
      view.dispatch({ selection: { anchor: at === 'start' ? 0 : view.state.doc.length }, scrollIntoView: at === 'end' });
    },
    revealHeading: (index) => {
      const view = viewRef.current;
      if (!view) return;
      let i = 0;
      let pos = -1;
      syntaxTree(view.state).iterate({
        enter(n) {
          if (pos >= 0) return false;
          if (/^(ATX|Setext)Heading\d$/.test(n.name)) {
            if (i === index) pos = n.from;
            i += 1;
            return false;
          }
          return undefined;
        },
      });
      if (pos >= 0) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }) });
    },
  }), []);

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const showToolbar = mode !== 'read' && (toolbar === 'compact' || (toolbar === 'touch' && coarse && focused));

  const toolbarRow = showToolbar && (
    <div
      className={cn(
        'flex items-center gap-0.5 py-1',
        toolbar === 'compact'
          ? 'mb-1 border-b border-[hsl(var(--outline-variant)/0.65)]'
          : 'sticky bottom-0 z-10 -mx-2 mt-2 rounded-xl bg-[hsl(var(--surface-container-high))] px-1 shadow-[var(--m3-elev-1)]',
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolButton label="Heading" view={viewRef} action={(v) => setLineKind(v, 'h2')}><Heading2 className="size-4" /></ToolButton>
      <ToolButton label="Bold" view={viewRef} action={(v) => toggleWrap(v, '**')}><Bold className="size-4" /></ToolButton>
      <ToolButton label="Italic" view={viewRef} action={(v) => toggleWrap(v, '*')}><Italic className="size-4" /></ToolButton>
      <ToolButton label="List" view={viewRef} action={(v) => setLineKind(v, 'bullet')}><List className="size-4" /></ToolButton>
      <ToolButton label="Checklist" view={viewRef} action={(v) => setLineKind(v, 'todo')}><ListChecks className="size-4" /></ToolButton>
      <ToolButton label="Link" view={viewRef} action={() => openLink()}><Link2 className="size-4" /></ToolButton>
      <ToolButton label="Image" view={viewRef} action={() => pickImage()}><ImageIcon className="size-4" /></ToolButton>
    </div>
  );

  return (
    <div
      className={cn('sajni-editor relative w-full', fill && 'is-fill', className)}
      style={minHeight ? ({ '--editor-min-height': minHeight } as React.CSSProperties) : undefined}
      onMouseDown={(e) => {
        // Empty space below the text puts the cursor at the end.
        if (e.target !== e.currentTarget || mode === 'read') return;
        e.preventDefault();
        const v = viewRef.current;
        if (!v) return;
        v.focus();
        v.dispatch({ selection: { anchor: v.state.doc.length } });
      }}
    >
      {toolbar === 'compact' && toolbarRow}
      <div ref={host} data-mode={mode} className={cn(fill && 'flex flex-1 flex-col min-h-0')} />
      {toolbar === 'touch' && toolbarRow}

      <CommandDialog
        open={taskPicker}
        onOpenChange={setTaskPicker}
        modal={false}
        showOverlay={false}
        title="Link a task"
        description="Pick an open task to show in the text, or create one."
      >
        <CommandInput placeholder="Find a task" value={taskQuery} onValueChange={setTaskQuery} />
        <CommandList>
          {taskLoading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <CommandEmpty>No matching tasks</CommandEmpty>
              <CommandGroup heading="Open tasks">
                {taskList.map((t) => (
                  <CommandItem key={t.id} value={`${t.title}__${t.id}`} onSelect={() => insertTaskChip(t)}>
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.due_date && <span className="text-xs tabular-nums text-muted-foreground">{t.due_date.slice(0, 10)}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="border-t border-[hsl(var(--outline-variant))] p-2">
          <button
            type="button"
            onClick={() => {
              setTaskPicker(false);
              setCreateDefaults({ title: taskQuery.trim(), ...(contextDate ? { due_date: contextDate } : {}) });
              setCreateOpen(true);
              qc.fetchQuery({ queryKey: qk.taskLists.list(), queryFn: () => listsApi.list() }).then(setCreateLists).catch(() => setCreateLists([]));
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[hsl(var(--secondary-container))] hover:text-[hsl(var(--on-secondary-container))]"
          >
            <span className="grid size-5 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Plus className="size-3.5" /></span>
            <span className="flex-1 truncate">{taskQuery.trim() ? <>Create “<span className="font-medium">{taskQuery.trim()}</span>”</> : 'Create a task'}</span>
          </button>
        </div>
      </CommandDialog>

      {createOpen && (
        <Suspense fallback={null}>
          <TaskFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            editing={null}
            defaults={createDefaults}
            lists={createLists}
            onSaved={() => {}}
            onCreated={(t) => insertTaskChip({ id: t.id, title: t.title })}
          />
        </Suspense>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add a link</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="md-link-url" className="text-xs text-muted-foreground">Address</Label>
              <div className="flex gap-2">
                <Input
                  id="md-link-url"
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLink(); } }}
                  placeholder="https://"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => { void fetchLinkTitle(); }} disabled={!linkUrl.trim() || linkFetching} className="h-11 shrink-0">
                  {linkFetching ? 'Fetching…' : 'Get title'}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="md-link-title" className="text-xs text-muted-foreground">Text</Label>
              <Input
                id="md-link-title"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLink(); } }}
                placeholder="Shown instead of the address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={commitLink} disabled={!linkUrl.trim()}>Add link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolButton({ label, view, action, children }: {
  label: string;
  view: React.RefObject<EditorView | null>;
  action: (v: EditorView) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => {
        // Keep the editor's focus and selection.
        e.preventDefault();
        if (view.current) action(view.current);
      }}
      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground"
    >
      {children}
    </button>
  );
}
