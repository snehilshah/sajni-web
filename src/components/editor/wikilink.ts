import Mention from '@tiptap/extension-mention';
import { Extension, type Editor, type Range } from '@tiptap/core';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { tags as tagsApi, notes as notesApi, journal as journalApi } from '@/api';
import { makePopupRenderer } from './popupRenderer';
import type { InlineState, Item, Md, MdNode, MdState } from './types';

const PREFIXES = [' ', '\n', '\t', null] as unknown as string[];

// markdown-it inline plugin: parses `[[Title]]` (and `[[Title|Display]]`) into a custom token
// that renders as <span data-type="wikilink" data-id="..." data-label="...">...</span>.
function wikilinkMarkdownIt(md: Md) {
  md.inline.ruler.before('link', 'wikilink', (state: InlineState, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */ || state.src.charCodeAt(start + 1) !== 0x5b) return false;

    const end = state.src.indexOf(']]', start + 2);
    if (end < 0) return false;
    const inner = state.src.slice(start + 2, end);
    if (!inner || inner.includes('\n')) return false;
    // Reserve the `[[task:…]]` syntax for the TaskChip extension so a
    // round-trip through markdown doesn't downgrade task chips into
    // wikilinks (which would otherwise spawn a new note on click).
    if (inner.startsWith('task:')) return false;

    if (!silent) {
      const [target, alias] = inner.split('|').map((s: string) => s.trim());
      const label = alias || target;
      const token = state.push('html_inline', '', 0);
      const safeTarget = String(target).replace(/"/g, '&quot;');
      const safeLabel = String(label).replace(/</g, '&lt;');
      token.content = `<span data-type="wikilink" data-id="${safeTarget}" data-label="${safeTarget}">${safeLabel}</span>`;
    }
    state.pos = end + 2;
    return true;
  });
}

export const WikiLink = Mention.extend({
  name: 'wikilink',

  addStorage() {
    return {
      markdown: {
        serialize(state: MdState, node: MdNode) {
          state.write(`[[${node.attrs.label || node.attrs.id || ''}]]`);
        },
        parse: {
          setup(md: Md) {
            md.use(wikilinkMarkdownIt);
          },
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-type="wikilink"]' },
      { tag: 'a.wikilink' },
    ];
  },
}).configure({
  HTMLAttributes: { class: 'wikilink' },
  renderText({ node }: { node: MdNode }) {
    return `[[${node.attrs.label || node.attrs.id || ''}]]`;
  },
  renderHTML({ node }: { node: MdNode }) {
    return [
      'a',
      {
        class: 'wikilink',
        href: '#',
        'data-target': node.attrs.id,
      },
      node.attrs.label || node.attrs.id || '',
    ];
  },
  deleteTriggerWithBackspace: true,
  suggestion: {
    char: '[[',
    startOfLine: false,
    allowSpaces: true,
    pluginKey: new PluginKey('wikilinkSuggest'),
    items: async ({ query }: { query: string }) => {
      try {
        const [notesList, journalList] = await Promise.all([
          notesApi.list(query ? { search: query } : undefined).catch(() => []),
          journalApi.list().catch(() => []),
        ]);
        const noteItems: Item[] = notesList.slice(0, 6).map((n) => ({
          id: n.title,
          title: n.title || 'Untitled',
          subtitle: 'Note',
          icon: '📝',
        }));
        const q = query.toLowerCase();
        const journalMatches: Item[] = journalList
          .filter((j) => !q || j.date.includes(q))
          .slice(0, 4)
          .map((j) => ({
            id: j.date,
            title: j.date,
            subtitle: 'Journal',
            icon: '📅',
          }));
        const merged = [...noteItems, ...journalMatches];
        if (query.trim() && !merged.some((m) => m.id.toLowerCase() === q)) {
          merged.unshift({
            id: query.trim(),
            title: query.trim(),
            subtitle: 'New link (creates on first save)',
            icon: '+',
          });
        }
        return merged;
      } catch {
        return [];
      }
    },
    render: makePopupRenderer<Item>('Type to search notes & journal'),
    command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionNodeAttrs }) => {
      const label = String(props.id || props.label || '');
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'wikilink', attrs: { id: label, label } },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
  },
});

export const TagSuggest = Extension.create({
  name: 'tagsuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '#',
        startOfLine: false,
        allowSpaces: false,
        // Restrict to whitespace / start-of-text prefixes so the suggestion
        // only ever fires for genuine new tags. Without this, a `#` inside
        // existing content (e.g. when opening a journal entry that already
        // mentions `#happy`) would be treated as an active tag query.
        allowedPrefixes: PREFIXES,
        pluginKey: new PluginKey('tagSuggest'),
        items: async ({ query, editor }: { query: string; editor: Editor }) => {
          // Bail unless the editor is actually focused. This blocks the
          // popup from auto-opening on initial page load when the cursor
          // (placed programmatically) lands inside an existing `#tag`.
          if (!editor?.isFocused) return [];
          try {
            const list = await tagsApi.list();
            const filtered = list
              .filter((t) => t.tag.includes(query.toLowerCase()))
              .slice(0, 8);
            const seen = new Set(filtered.map((t) => t.tag));
            const items = filtered.map((t) => ({
              id: t.tag,
              title: '#' + t.tag,
              subtitle: `${t.count} item${t.count === 1 ? '' : 's'}`,
              icon: '#',
            }));
            const q = query.trim().toLowerCase();
            if (q && !seen.has(q) && /^[\p{L}\p{N}_\-/]+$/u.test(q)) {
              items.unshift({ id: q, title: '#' + q, subtitle: 'Create new tag', icon: '+' });
            }
            return items;
          } catch {
            return [];
          }
        },
        render: makePopupRenderer<Item>('Type to search tags'),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: Item }) => {
          editor.chain().focus().insertContentAt(range, `#${props.id} `).run();
        },
      }),
    ];
  },
});
