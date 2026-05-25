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

import { uploads, notes as notesApi, tasks as tasksApi } from '@/api';
import type { Task } from '@/types';
import { WikiLink, TagSuggest } from './wikilink';
import { SlashCommand } from './slashMenu';
import { TimeChip, TimeChipSuggest } from './timeChip';
import { TaskChip } from './taskChip';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';

import {
  Bold, Italic, Strikethrough, Code, Link2, List, ListOrdered, ListChecks,
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

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { class: 'tiptap-code-block' } },
      link: { openOnClick: false, HTMLAttributes: { class: 'tiptap-link' } },
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
      handlePaste(_view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const blob = item.getAsFile();
            if (blob) uploadAndInsertImage(blob);
            return true;
          }
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
    </div>
  );
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
      {btn(false, () => {
        const url = window.prompt('URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, Link2, 'Link')}
      {btn(false, onImage, ImageIcon, 'Image')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), Minus, 'Divider')}
    </div>
  );
}
