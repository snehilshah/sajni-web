import { Node, mergeAttributes } from '@tiptap/core';

/**
 * TaskChip — inline atom rendering a small pill that references an existing
 * task by id. Inserted via the `/task` slash command (which opens a title
 * dialog in RichEditor, creates the task, then injects this node).
 *
 *   Markdown round-trip: `[[task:42|Buy milk]]`
 *   HTML:                <span data-type="taskchip" data-id="42">Buy milk</span>
 *
 * Clicking the chip is wired in RichEditor's handleClickOn — it navigates
 * to `/tasks?focus=<id>` so the user can drill into the task.
 *
 * The node also exposes a mutable `onOpen` storage slot. The slash menu
 * calls `editor.storage.taskchip.onOpen(range)` so the React layer can pop
 * its title-input dialog while keeping the editor-side glue in this file.
 */

function taskChipMarkdownIt(md: any) {
  const rule = (state: any, silent: boolean) => {
    const start = state.pos;
    const src = state.src;
    if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5b) return false;
    // Need at least "[[task:"
    if (src.slice(start + 2, start + 7) !== 'task:') return false;
    const end = src.indexOf(']]', start + 7);
    if (end < 0) return false;
    const inner = src.slice(start + 7, end); // "id|title"
    const [idPart, ...titleParts] = inner.split('|');
    const id = idPart.trim();
    const title = titleParts.join('|').trim() || id;
    if (!id) return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      const safeId = id.replace(/"/g, '&quot;');
      const safeTitle = title.replace(/</g, '&lt;');
      token.content = `<span data-type="taskchip" data-id="${safeId}" data-title="${safeTitle}">${safeTitle}</span>`;
    }
    state.pos = end + 2;
    return true;
  };
  // Must run BEFORE the wikilink rule — both match `[[…]]` syntax and
  // wikilink doesn't care about a `task:` prefix, so without this
  // ordering wikilink eats every TaskChip on the round-trip through
  // markdown and turns it into a stray note backlink on save → reload.
  // Fall back to placing before `link` if the wikilink rule isn't
  // registered (e.g. editor in a non-journal context).
  try {
    md.inline.ruler.before('wikilink', 'taskchip', rule);
  } catch {
    md.inline.ruler.before('link', 'taskchip', rule);
  }
}

export const TaskChip = Node.create({
  name: 'taskchip',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return {
      // RichEditor binds this slot to its open-dialog callback. Slash menu
      // /task invokes it with the trigger range so the React side can
      // pop a dialog without coupling tiptap to React state.
      onOpen: null as null | ((range: { from: number; to: number }) => void),
      markdown: {
        serialize(state: any, node: any) {
          const id = node.attrs.id ?? '';
          const title = node.attrs.title ?? '';
          state.write(`[[task:${id}|${title}]]`);
        },
        parse: {
          setup(md: any) {
            md.use(taskChipMarkdownIt);
          },
        },
      },
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="taskchip"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = node.attrs.title || 'Task';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'taskchip',
        'data-id': String(node.attrs.id ?? ''),
        'data-title': title,
        class: 'tiptap-taskchip',
      }),
      `☑ ${title}`,
    ];
  },

  renderText({ node }) {
    return `[[task:${node.attrs.id ?? ''}|${node.attrs.title ?? ''}]]`;
  },
});
