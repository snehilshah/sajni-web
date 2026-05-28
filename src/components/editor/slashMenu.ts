import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { makePopupRenderer } from './popupRenderer';

export interface SlashCommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  command: (props: { editor: any; range: any }) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'h1', title: 'Heading 1', subtitle: 'Large section heading', icon: 'H₁',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'h2', title: 'Heading 2', subtitle: 'Medium section heading', icon: 'H₂',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'h3', title: 'Heading 3', subtitle: 'Smaller heading', icon: 'H₃',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bullet', title: 'Bullet List', subtitle: '• Unordered list', icon: '•',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered', title: 'Numbered List', subtitle: '1. Ordered list', icon: '1.',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'todo', title: 'To-do List', subtitle: 'Checkboxes', icon: '☑',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'quote', title: 'Quote', subtitle: 'Blockquote', icon: '❝',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'code', title: 'Code Block', subtitle: 'Multi-line code', icon: '</>',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'rule', title: 'Divider', subtitle: 'Horizontal rule', icon: '—',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    // Hands off to the React layer (RichEditor binds editor.storage.linkEntry.onOpen)
    // so the title+url dialog + title-fetch can live outside the editor.
    id: 'link', title: 'Link', subtitle: 'Insert a titled link', icon: '🔗',
    command: ({ editor, range }) => {
      const open = (editor.storage as any)?.linkEntry?.onOpen;
      if (typeof open === 'function') open(range);
      else editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    // Hands off to the React layer (RichEditor binds editor.storage.taskchip.onOpen)
    // so the title dialog and tasksApi.create call can live outside the editor.
    id: 'task', title: 'Task', subtitle: 'Create + reference inline', icon: '☑',
    command: ({ editor, range }) => {
      const open = (editor.storage as any)?.taskchip?.onOpen;
      if (typeof open === 'function') {
        open(range);
      } else {
        // Fallback: at least clear the trigger text so we don't leave "/task" behind.
        editor.chain().focus().deleteRange(range).run();
      }
    },
  },
];

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        pluginKey: new PluginKey('slashCommand'),
        allowSpaces: false,
        items: ({ query }: { query: string }) =>
          SLASH_COMMANDS.filter((c) =>
            c.title.toLowerCase().includes(query.toLowerCase())
          ),
        render: makePopupRenderer('No commands match'),
        command: ({ editor, range, props }: any) => {
          (props as SlashCommandItem).command({ editor, range });
        },
      }),
    ];
  },
});
