import { useEffect, useRef, useCallback, useMemo } from 'react';
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

import { uploads, notes as notesApi } from '@/api';
import { WikiLink, TagSuggest } from './wikilink';
import { SlashCommand } from './slashMenu';

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
}

export default function RichEditor({
  value, onChange, placeholder, className, autoFocus, minHeight,
}: Props) {
  const navigate = useNavigate();
  const isLocalUpdate = useRef(false);

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
