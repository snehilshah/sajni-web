/* eslint-disable react-hooks/immutability, react-hooks/preserve-manual-memoization --
   This file wires TipTap. We mutate editor.storage.<ext>.onOpen to bind the
   slash-command callbacks, and the editor instance drives the manual
   useCallback memoization here. Both are intentional, working integration
   patterns the React Compiler can't model (it flags them as errors). All other
   react-hooks rules stay active for this file. */
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import type { Editor } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { uploads, notes as notesApi, tasks as tasksApi, links as linksApi } from '@/api';
import type { Task } from '@/types';
import { WikiLink, TagSuggest } from './wikilink';
import { SlashCommand } from './slashMenu';
import { TimeChip, TimeChipSuggest } from './timeChip';
import { TaskChip } from './taskChip';
import { LinkEntry } from './linkEntry';
import { LinkFavicon } from './linkFavicon';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import {
  Bold, Italic, Strikethrough, Code, Link2, Unlink, List, ListOrdered, ListChecks,
  Quote, Heading1, Heading2, Heading3, Image as ImageIcon, Minus,
} from 'lucide-react';

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  minHeight?: string;
  /**
   * Reserved hook for future task-creation callers. The /task slash
   * command itself only *references* tasks — creation happens from the
   * surrounding page (e.g. the journal right-rail "+ Add task" row).
   */
  contextDate?: string;
}

export default function RichEditor({
  value, onChange, placeholder, className, autoFocus, minHeight,
}: Props) {
  const navigate = useNavigate();
  const isLocalUpdate = useRef(false);

  // Picker for /task — search-and-pick over existing tasks. No create UI
  // here per design: /task references only, creation lives outside the
  // editor (journal right rail, /tasks page, etc).
  const [taskPicker, setTaskPicker] = useState(false);
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);

  // /link dialog state.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkFetching, setLinkFetching] = useState(false);

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { class: 'tiptap-code-block' } },
      // openOnClick stays false so a plain click places the cursor; we
      // open links on cmd/ctrl-click instead (see handleClick). autolink +
      // linkOnPaste turn bare URLs (typed or pasted) into real links.
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: 'tiptap-link', rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    Markdown.configure({ html: false, breaks: true, transformPastedText: true, linkify: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'tiptap-image' } }),
    WikiLink,
    TagSuggest,
    SlashCommand,
    TimeChip,
    TimeChipSuggest,
    TaskChip,
    LinkEntry,
    LinkFavicon,
    Placeholder.configure({
      placeholder: ({ node, editor: ed, pos }) => {
        // Show only on the first empty paragraph
        if (pos === 0 && node.type.name === 'paragraph' && !ed?.isFocused) {
          return placeholder || 'Type / for commands, [[ to link, # for tags…';
        }
        if (node.type.name === 'paragraph' && ed?.isEmpty) {
          return placeholder || 'Type / for commands, [[ to link, # for tags…';
        }
        return '';
      },
      includeChildren: false,
      emptyEditorClass: 'is-editor-empty',
    }),
  ], [placeholder]);

  const editor = useEditor({
    extensions,
    content: value,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'prose prose-sajni dark:prose-invert max-w-none focus:outline-none',
      },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name === 'wikilink') {
          event.preventDefault();
          const target = String(node.attrs.id || '');
          handleWikiLinkClick(target);
          return true;
        }
        if (node.type.name === 'taskchip') {
          event.preventDefault();
          const raw = String(node.attrs.id || '');
          const id = Number(raw);
          if (Number.isFinite(id) && id > 0) {
            // Dispatch a global event picked up by TaskDetailProvider.
            // Avoids coupling the editor extension to React context.
            window.dispatchEvent(new CustomEvent('task:open', { detail: { id } }));
          }
          return true;
        }
        return false;
      },
      handleClick: (view, pos, event) => {
        // Cmd/Ctrl-click opens a link without hijacking normal click-to-edit.
        if (!(event.metaKey || event.ctrlKey)) return false;
        const link = view.state.doc.resolve(pos).marks().find((m) => m.type.name === 'link');
        if (link?.attrs.href) {
          window.open(link.attrs.href as string, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const blob = item.getAsFile();
              if (blob) uploadAndInsertImage(blob);
              return true;
            }
          }
        }
        // Bare URL pasted onto a collapsed selection → insert a real link
        // immediately (clickable + favicon), then fetch its title and offer
        // to swap the raw URL for it. Selection-paste keeps tiptap's default
        // linkOnPaste (wraps the highlighted text).
        const text = event.clipboardData?.getData('text/plain')?.trim();
        if (text && BARE_URL.test(text) && view.state.selection.empty && editor) {
          event.preventDefault();
          editor.chain().focus().insertContent([
            { type: 'text', text, marks: [{ type: 'link', attrs: { href: text } }] },
            { type: 'text', text: ' ' },
          ]).run();
          linksApi.preview(text).then((res) => {
            if (!res?.title || res.title === text || res.title === res.host) return;
            toast('Found the page title', {
              description: res.title,
              action: { label: 'Use title', onClick: () => editor && upgradeLink(editor, text, res.title) },
            });
          }).catch(() => { /* offline / blocked — keep the raw URL */ });
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        const dt = event.dataTransfer;
        if (!dt || dt.files.length === 0) return false;
        const file = dt.files[0];
        if (!file.type.startsWith('image/')) return false;
        event.preventDefault();
        uploadAndInsertImage(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      isLocalUpdate.current = true;
      const md = (ed.storage as any).markdown.getMarkdown();
      onChange(md);
      queueMicrotask(() => { isLocalUpdate.current = false; });
    },
  });

  const uploadAndInsertImage = useCallback(async (file: File | Blob) => {
    if (!editor) return;
    try {
      const result = await uploads.upload(file);
      editor.chain().focus().setImage({ src: result.url, alt: '' }).run();
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  }, [editor]);

  const handleWikiLinkClick = useCallback(async (target: string) => {
    const t = target.trim();
    if (!t) return;
    // YYYY-MM-DD => journal entry
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      navigate(`/journal?date=${t}`);
      return;
    }
    // Try to find a note with that title
    try {
      const list = await notesApi.list({ search: t });
      const exact = list.find((n: any) => (n.title || '').toLowerCase() === t.toLowerCase());
      if (exact) {
        navigate(`/notes?id=${exact.id}`);
        return;
      }
      // Otherwise create a new note with that title and open it
      const created = await notesApi.create(t, '');
      navigate(`/notes?id=${created.id}`);
    } catch (err) {
      console.error('wikilink navigate failed', err);
    }
  }, [navigate]);

  // Sync external value changes (e.g. selecting a different note)
  useEffect(() => {
    if (!editor) return;
    if (isLocalUpdate.current) return;
    const current = (editor.storage as any).markdown.getMarkdown();
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false } as any);
    }
  }, [editor, value]);

  // Bind the TaskChip extension's onOpen slot — the /task slash command
  // calls it. We strip the trigger range *here* (not in the slash command
  // file) so the slash menu's popup is fully cleaned up before our picker
  // dialog opens, otherwise both popups overlap.
  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as any).taskchip;
    if (!storage) return;
    storage.onOpen = (range: { from: number; to: number }) => {
      // Drop the "/task" trigger immediately. This forces the underlying
      // Suggestion plugin to dismiss its popup and parks the cursor at
      // the insertion point.
      editor.chain().focus().deleteRange(range).run();
      setTaskList([]);
      setTaskPicker(true);
      // Fetch lazily so users who never invoke /task never pay the cost.
      setTaskLoading(true);
      tasksApi
        .list({ smart: 'all' })
        .then((list) => setTaskList(list.filter((t) => t.status !== 'done')))
        .catch(() => setTaskList([]))
        .finally(() => setTaskLoading(false));
    };
    return () => {
      if (storage) storage.onOpen = null;
    };
  }, [editor]);

  const insertTaskChip = useCallback((t: Task) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'taskchip', attrs: { id: t.id, title: t.title } },
        { type: 'text', text: ' ' },
      ])
      .run();
    setTaskPicker(false);
  }, [editor]);

  // Bind the /link slash command → M3 link dialog (title + url).
  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as any).linkEntry;
    if (!storage) return;
    storage.onOpen = (range: { from: number; to: number }) => {
      editor.chain().focus().deleteRange(range).run();
      const existing = editor.getAttributes('link').href as string | undefined;
      setLinkUrl(existing || '');
      setLinkTitle('');
      setLinkOpen(true);
    };
    return () => { if (storage) storage.onOpen = null; };
  }, [editor]);

  const fetchLinkTitle = useCallback(async () => {
    const u = linkUrl.trim();
    if (!u) return;
    setLinkFetching(true);
    try {
      const res = await linksApi.preview(/^https?:\/\//i.test(u) ? u : 'https://' + u);
      if (res?.title && res.title !== res.host) setLinkTitle(res.title);
    } catch { /* ignore — user can type a title */ } finally {
      setLinkFetching(false);
    }
  }, [linkUrl]);

  const commitLink = useCallback(() => {
    if (!editor) return;
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const label = linkTitle.trim() || url;
    editor.chain().focus().insertContent([
      { type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] },
      { type: 'text', text: ' ' },
    ]).run();
    setLinkOpen(false);
    setLinkUrl('');
    setLinkTitle('');
  }, [editor, linkUrl, linkTitle]);

  return (
    <div className={`relative w-full ${className || ''}`}>
      {editor && (
        <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 } as any}>
          <Toolbar editor={editor} onImage={() => imagePicker(uploadAndInsertImage)} />
        </BubbleMenu>
      )}
      <div style={minHeight ? { minHeight } : undefined}>
        <EditorContent editor={editor} />
      </div>
      <CommandDialog
        open={taskPicker}
        onOpenChange={setTaskPicker}
        modal={false}
        showOverlay={false}
        title="Reference a task"
        description="Pick an existing task to insert as an inline chip. Create new tasks from the right rail or the Tasks page."
      >
        <CommandInput placeholder="Search tasks…" />
        <CommandList>
          {taskLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : (
            <>
              <CommandEmpty>No matching tasks. Create one from the right rail or /tasks.</CommandEmpty>
              <CommandGroup heading="Open tasks">
                {taskList.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.title}__${t.id}`}
                    onSelect={() => insertTaskChip(t)}
                  >
                    <span className={`size-2 rounded-full shrink-0 ${
                      t.priority === 'high' ? 'bg-destructive'
                      : t.priority === 'medium' ? 'bg-amber-500'
                      : 'bg-muted-foreground/40'
                    }`} />
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.due_date && (
                      <span className="mono text-[10px] tracking-wider text-muted-foreground">
                        {t.due_date}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">URL</Label>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLink(); } }}
                  placeholder="https://…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchLinkTitle}
                  disabled={!linkUrl.trim() || linkFetching}
                  className="shrink-0"
                >
                  {linkFetching ? 'Fetching…' : 'Fetch title'}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Title</Label>
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLink(); } }}
                placeholder="Link text (defaults to the URL)"
              />
            </div>
          </div>
          <DialogFooter className="mt-3">
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={commitLink} disabled={!linkUrl.trim()}>Insert link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Bare URL = single token, no whitespace, http(s).
const BARE_URL = /^https?:\/\/\S+$/i;

// upgradeLink swaps a freshly-pasted raw-URL link for one labelled with the
// fetched page title, found by scanning for the link whose text is still
// the URL (robust to cursor movement after paste).
function upgradeLink(editor: Editor, href: string, title: string) {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (found) return false;
    if (node.isText && node.text === href && node.marks.some((m: any) => m.type.name === 'link' && m.attrs.href === href)) {
      found = { from: pos, to: pos + node.nodeSize };
    }
    return undefined;
  });
  if (found) {
    editor.chain().focus().insertContentAt(found, {
      type: 'text', text: title, marks: [{ type: 'link', attrs: { href } }],
    }).run();
  }
}

function imagePicker(insert: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) insert(f);
  };
  input.click();
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const btn = (active: boolean, onClick: () => void, Icon: any, title: string) => (
    <button
      key={title}
      type="button"
      onClick={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-md transition-colors hover:bg-accent ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
    >
      <Icon className="size-3.5" />
    </button>
  );
  return (
    <div className="flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg p-1">
      {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1, 'Heading 1')}
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2, 'Heading 2')}
      {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3, 'Heading 3')}
      <span className="w-px h-4 bg-border mx-0.5" />
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic, 'Italic')}
      {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), Strikethrough, 'Strike')}
      {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), Code, 'Inline code')}
      <span className="w-px h-4 bg-border mx-0.5" />
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List, 'Bullet list')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered, 'Ordered list')}
      {btn(editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), ListChecks, 'Todo list')}
      {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), Quote, 'Quote')}
      <span className="w-px h-4 bg-border mx-0.5" />
      {btn(editor.isActive('link'), () => {
        const prev = (editor.getAttributes('link').href as string) || '';
        const url = window.prompt('Link URL', prev);
        if (url === null) return;                 // cancelled
        const chain = editor.chain().focus().extendMarkRange('link');
        if (url.trim() === '') chain.unsetLink().run();
        else chain.setLink({ href: url.trim() }).run();
      }, Link2, editor.isActive('link') ? 'Edit link' : 'Link')}
      {editor.isActive('link') && btn(false, () => editor.chain().focus().extendMarkRange('link').unsetLink().run(), Unlink, 'Remove link')}
      {btn(false, onImage, ImageIcon, 'Image')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), Minus, 'Divider')}
    </div>
  );
}
