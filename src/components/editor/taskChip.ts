import { Node, mergeAttributes } from '@tiptap/core';

/**
 * TaskChip — inline atom rendering a small pill that references an existing
 * task by id. Inserted via the `/task` slash command picker.
 *
 *   Markdown round-trip: `((task:42|Buy milk))`
 *   HTML:                <span data-type="taskchip" data-id="42">Buy milk</span>
 *
 * **Why round-paren syntax**: the editor's WikiLink uses `[[...]]`. Mixing
 * both in the same `[[...]]` namespace caused parser ambiguity (wikilink
 * eats task chips, task chips with empty attrs round-trip to `[[task:|]]`).
 * `((task:…))` is unambiguous, can't be a markdown link (`[t](u)`), and
 * stays human-readable in raw markdown exports.
 *
 * Backwards compatibility: the markdown-it parser still recognises the
 * legacy `[[task:N|T]]` form so journal entries written before this
 * switch continue to load correctly.
 *
 * Clicking the chip dispatches `window.dispatchEvent('task:open', {id})`
 * which TaskDetailProvider listens for — works from any editor instance.
 */

function taskChipMarkdownIt(md: any) {
  if (md.inline.ruler.__find__?.('taskchip') >= 0) {
    return;
  }

  const rule = (state: any, silent: boolean) => {
    const start = state.pos;
    const src = state.src;

    // Match the canonical `((task:NN|Title))` form.
    if (src.charCodeAt(start) === 0x28 /* ( */ && src.charCodeAt(start + 1) === 0x28) {
      if (src.slice(start + 2, start + 7) !== 'task:') return false;
      const end = src.indexOf('))', start + 7);
      if (end < 0) return false;
      const inner = src.slice(start + 7, end); // "id|title"
      if (inner.includes('\n')) return false;
      const [idPart, ...titleParts] = inner.split('|');
      const id = idPart.trim();
      const title = titleParts.join('|').trim() || id;
      if (!id) return false;
      if (!silent) {
        const token = state.push('html_inline', '', 0);
        const safeId = escapeAttr(id);
        const safeTitle = escapeAttr(title);
        token.content = `<span data-type="taskchip" data-id="${safeId}" data-title="${safeTitle}">${safeTitle}</span>`;
      }
      state.pos = end + 2;
      return true;
    }

    // Legacy form `[[task:NN|Title]]` — accepted on parse so older entries
    // hydrate correctly, but new chips always serialize as `((task:…))`.
    if (src.charCodeAt(start) === 0x5b /* [ */ && src.charCodeAt(start + 1) === 0x5b) {
      if (src.slice(start + 2, start + 7) !== 'task:') return false;
      const end = src.indexOf(']]', start + 7);
      if (end < 0) return false;
      const inner = src.slice(start + 7, end);
      if (inner.includes('\n')) return false;
      const [idPart, ...titleParts] = inner.split('|');
      const id = idPart.trim();
      const title = titleParts.join('|').trim() || id;
      if (!id) return false;
      if (!silent) {
        const token = state.push('html_inline', '', 0);
        const safeId = escapeAttr(id);
        const safeTitle = escapeAttr(title);
        token.content = `<span data-type="taskchip" data-id="${safeId}" data-title="${safeTitle}">${safeTitle}</span>`;
      }
      state.pos = end + 2;
      return true;
    }

    return false;
  };

  // Register before `text`: `(` is not a markdown special char, so the
  // default text rule would otherwise consume `((task:...))` first.
  try {
    md.inline.ruler.before('text', 'taskchip', rule);
  } catch {
    md.inline.ruler.push('taskchip', rule);
  }
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
      // RichEditor binds this slot to its picker-open callback. Slash menu
      // /task invokes it with the trigger range so the React side can pop
      // the picker without coupling tiptap to React state.
      onOpen: null as null | ((range: { from: number; to: number }) => void),
      markdown: {
        serialize(state: any, node: any) {
          const id = node.attrs.id ?? '';
          const title = node.attrs.title ?? '';
          // If either attribute is missing we'd produce a malformed
          // `((task:|))` placeholder that round-trips into a broken chip.
          // Drop the node entirely in that case — better to lose the
          // reference than to permanently corrupt the entry.
          if (!String(id).trim()) return;
          state.write(`((task:${id}|${title}))`);
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
      id: {
        default: null,
        // CRITICAL: without parseHTML on each attr, tiptap drops the
        // data-* attributes when re-mounting the node from HTML. Empty
        // attrs then round-trip to `((task:|))` on the next save, which
        // is the "[[task:|]]" / blank-pill bug from the old syntax.
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-id': String(attrs.id) } : {}),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') || el.textContent || '',
        renderHTML: (attrs) => (attrs.title ? { 'data-title': String(attrs.title) } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="taskchip"]',
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const id = node.getAttribute('data-id');
          if (!id) return false; // reject — otherwise we'd hydrate a chip with no id
          return {
            id,
            title: node.getAttribute('data-title') || node.textContent || '',
          };
        },
      },
    ];
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
    return `((task:${node.attrs.id ?? ''}|${node.attrs.title ?? ''}))`;
  },
});
