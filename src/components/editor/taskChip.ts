import { Node, mergeAttributes } from '@tiptap/core';
import type { InlineState, Md, MdNode, MdState } from './types';

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

function taskChipMarkdownIt(md: Md) {
  const ruler = md.inline.ruler as Md['inline']['ruler'] & {
    __find__?: (name: string) => number;
  };
  if ((ruler.__find__?.('taskchip') ?? -1) >= 0) {
    return;
  }

  const rule = (state: InlineState, silent: boolean) => {
    const start = state.pos;
    const src = state.src;

    // Match the canonical `((task:NN|Title))` form. `(` is not a
    // markdown-it text terminator, so an inline chip after normal words
    // would otherwise be swallowed by the built-in text rule before this
    // rule ever sees its start.
    const canonicalStart = findTaskChipStart(src, start, state.posMax);
    if (canonicalStart >= 0) {
      if (canonicalStart > start) {
        if (silent) {
          state.pos = canonicalStart;
          return true;
        }
        state.pending += src.slice(start, canonicalStart);
      }
      const parsed = parseTaskChip(src, canonicalStart + 7, '))');
      if (!parsed) return false;
      if (!silent) {
        pushTaskChip(state, parsed.id, parsed.title);
      }
      state.pos = parsed.end + 2;
      return true;
    }

    // Legacy form `[[task:NN|Title]]` — accepted on parse so older entries
    // hydrate correctly, but new chips always serialize as `((task:…))`.
    if (src.charCodeAt(start) === 0x5b /* [ */ && src.charCodeAt(start + 1) === 0x5b) {
      if (src.slice(start + 2, start + 7) !== 'task:') return false;
      const parsed = parseTaskChip(src, start + 7, ']]');
      if (!parsed) return false;
      if (!silent) {
        pushTaskChip(state, parsed.id, parsed.title);
      }
      state.pos = parsed.end + 2;
      return true;
    }

    return false;
  };

  // Register before `text` so we can split plain text just before
  // `((task:...))`; `(` is not one of markdown-it's own terminators.
  try {
    ruler.before('text', 'taskchip', rule);
  } catch {
    ruler.push('taskchip', rule);
  }
}

function findTaskChipStart(src: string, start: number, posMax: number) {
  for (let pos = start; pos < posMax; pos++) {
    if (src.startsWith('((task:', pos)) return pos;
    if (isMarkdownTextTerminator(src.charCodeAt(pos))) return -1;
  }
  return -1;
}

function isMarkdownTextTerminator(ch: number) {
  switch (ch) {
    case 0x0A: // \n
    case 0x21: // !
    case 0x23: // #
    case 0x24: // $
    case 0x25: // %
    case 0x26: // &
    case 0x2A: // *
    case 0x2B: // +
    case 0x2D: // -
    case 0x3A: // :
    case 0x3C: // <
    case 0x3D: // =
    case 0x3E: // >
    case 0x40: // @
    case 0x5B: // [
    case 0x5C: // \
    case 0x5D: // ]
    case 0x5E: // ^
    case 0x5F: // _
    case 0x60: // `
    case 0x7B: // {
    case 0x7D: // }
    case 0x7E: // ~
      return true;
    default:
      return false;
  }
}

function parseTaskChip(src: string, contentStart: number, close: '))' | ']]') {
  const end = src.indexOf(close, contentStart);
  if (end < 0) return null;
  const inner = src.slice(contentStart, end);
  if (inner.includes('\n')) return null;
  const [idPart, ...titleParts] = inner.split('|');
  const id = idPart.trim();
  const title = titleParts.join('|').trim() || id;
  if (!id) return null;
  return { id, title, end };
}

function pushTaskChip(state: InlineState, id: string, title: string) {
  const token = state.push('html_inline', '', 0);
  const safeId = escapeAttr(id);
  const safeTitle = escapeAttr(title);
  token.content = `<span data-type="taskchip" data-id="${safeId}" data-title="${safeTitle}">${safeTitle}</span>`;
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
        serialize(state: MdState, node: MdNode) {
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
          setup(md: Md) {
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
