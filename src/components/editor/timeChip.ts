import { Extension, Node, InputRule, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { makePopupRenderer } from './popupRenderer';

/**
 * TimeChip — inline atom rendering an M3 Expressive time pill.
 *
 *  Trigger: `@` followed by 24h time.
 *
 *    @9       → 09:00              (point, hour only)
 *    @9:30    → 09:30              (point, minutes)
 *    @9-18    → 09:00 – 18:00      (range)
 *    @9-18:30 → 09:00 – 18:30      (mixed)
 *    @9:30-18:30 → 09:30 – 18:30   (full)
 *
 *  The InputRule fires on trailing space. The Suggestion popup also
 *  surfaces preset times when you press `@` so you can pick instead of
 *  type. Markdown round-trips as plain text (`09:30-18:30`) so exported
 *  entries stay human-readable.
 */

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function fmtPoint(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

function label(start: number, startMin: number, end: number | null, endMin: number | null): string {
  if (end == null) return fmtPoint(start, startMin);
  return `${fmtPoint(start, startMin)}–${fmtPoint(end, endMin ?? 0)}`;
}

function valid(h: number, m: number): boolean {
  return Number.isFinite(h) && h >= 0 && h <= 23 && Number.isFinite(m) && m >= 0 && m <= 59;
}

/** End must be strictly later than start (e.g. block @9-8 / @9:30-9:15). */
function validRange(sH: number, sM: number, eH: number, eM: number): boolean {
  return eH * 60 + eM > sH * 60 + sM;
}

// timeChipMarkdownIt parses `[time:9:30]` or `[time:9:30-18:00]` back
// into a TimeChip node so saved entries round-trip cleanly. Plain
// `09:30-18:00` substrings remain plain text (we don't try to detect
// arbitrary numbers as times).
function timeChipMarkdownIt(md: any) {
  md.inline.ruler.before('link', 'timechip', (state: any, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
    const tag = '[time:';
    if (state.src.slice(start, start + tag.length) !== tag) return false;
    const end = state.src.indexOf(']', start + tag.length);
    if (end < 0) return false;
    const body = state.src.slice(start + tag.length, end);
    const m = body.match(/^(\d{1,2})(?::(\d{1,2}))?(?:-(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!m) return false;
    if (!silent) {
      const sH = parseInt(m[1], 10);
      const sM = m[2] != null ? parseInt(m[2], 10) : 0;
      const eH = m[3] != null ? parseInt(m[3], 10) : null;
      const eM = m[4] != null ? parseInt(m[4], 10) : (eH == null ? null : 0);
      const token = state.push('html_inline', '', 0);
      token.content =
        `<span data-time-chip="" data-start="${sH}" data-start-min="${sM}"` +
        (eH != null ? ` data-end="${eH}" data-end-min="${eM ?? 0}"` : '') +
        `>${pad(sH)}:${pad(sM)}${eH != null ? '-' + pad(eH) + ':' + pad(eM ?? 0) : ''}</span>`;
    }
    state.pos = end + 1;
    return true;
  });
}

export const TimeChip = Node.create({
  name: 'timeChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  // Tiptap-markdown looks for `storage.markdown.serialize` on every node
  // and falls back to `[nodeName]` literal output when missing — which
  // is exactly how "[timeChip]" was leaking into saved entries. Write
  // the chip as `[time:09:30]` / `[time:09:30-18:30]` so we round-trip
  // through the .md blob without losing it.
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { start, startMin, end, endMin } = node.attrs as {
            start: number; startMin: number; end: number | null; endMin: number | null;
          };
          const body = end == null
            ? fmtPoint(start, startMin)
            : `${fmtPoint(start, startMin)}-${fmtPoint(end, endMin ?? 0)}`;
          state.write(`[time:${body}]`);
        },
        parse: {
          setup(md: any) {
            md.use(timeChipMarkdownIt);
          },
        },
      },
    };
  },

  addAttributes() {
    return {
      start:    { default: 0,    parseHTML: (el) => parseInt(el.getAttribute('data-start') || '0', 10),    renderHTML: (a) => ({ 'data-start': String(a.start) }) },
      startMin: { default: 0,    parseHTML: (el) => parseInt(el.getAttribute('data-start-min') || '0', 10), renderHTML: (a) => ({ 'data-start-min': String(a.startMin) }) },
      end:      { default: null, parseHTML: (el) => { const v = el.getAttribute('data-end'); return v ? parseInt(v, 10) : null; }, renderHTML: (a) => (a.end == null ? {} : { 'data-end': String(a.end) }) },
      endMin:   { default: null, parseHTML: (el) => { const v = el.getAttribute('data-end-min'); return v ? parseInt(v, 10) : null; }, renderHTML: (a) => (a.endMin == null ? {} : { 'data-end-min': String(a.endMin) }) },
    };
  },

  parseHTML() { return [{ tag: 'span[data-time-chip]' }]; },

  renderHTML({ node, HTMLAttributes }) {
    const { start, startMin, end, endMin } = node.attrs as { start: number; startMin: number; end: number | null; endMin: number | null };
    const isRange = end != null;
    const text = label(start, startMin, end, endMin);
    const title = isRange
      ? `${fmtPoint(start, startMin)} – ${fmtPoint(end!, endMin ?? 0)}`
      : fmtPoint(start, startMin);
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-time-chip': '',
        class: `time-chip${isRange ? ' range' : ''}`,
        title,
        contenteditable: 'false',
      }),
      text,
    ];
  },

  renderText({ node }) {
    const { start, startMin, end, endMin } = node.attrs as { start: number; startMin: number; end: number | null; endMin: number | null };
    if (end == null) return fmtPoint(start, startMin);
    return `${fmtPoint(start, startMin)}-${fmtPoint(end, endMin ?? 0)}`;
  },

  addInputRules() {
    return [
      new InputRule({
        // @H[:M][-H[:M]] followed by trailing space
        find: /@(\d{1,2})(?::(\d{1,2}))?(?:-(\d{1,2})(?::(\d{1,2}))?)?\s$/,
        handler: ({ range, match, chain }) => {
          const start    = parseInt(match[1], 10);
          const startMin = match[2] != null ? parseInt(match[2], 10) : 0;
          const end      = match[3] != null ? parseInt(match[3], 10) : null;
          const endMin   = match[4] != null ? parseInt(match[4], 10) : (end == null ? null : 0);
          if (!valid(start, startMin)) return null;
          if (end != null) {
            if (!valid(end, endMin ?? 0)) return null;
            if (!validRange(start, startMin, end, endMin ?? 0)) return null;
          }
          chain()
            .deleteRange({ from: range.from, to: range.to })
            .insertContent([
              { type: this.name, attrs: { start, startMin, end, endMin } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
      }),
    ];
  },
});

// ---- Suggestion popup ----
//
// When the user types `@`, surface preset times + a "use what you typed"
// row that mirrors the InputRule's parser. Picking inserts the chip via
// the same node type. The popup auto-closes on space, so the InputRule
// can finish the job for free-form `@9-18:30 ` entries.

interface TimeSuggestItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  start: number;
  startMin: number;
  end: number | null;
  endMin: number | null;
}

const PRESETS: TimeSuggestItem[] = [
  { id: 'morning',  title: 'Morning',  subtitle: '09:00 – 12:00', icon: '☀', start: 9,  startMin: 0, end: 12, endMin: 0 },
  { id: 'lunch',    title: 'Lunch',    subtitle: '12:00 – 13:00', icon: '🍴', start: 12, startMin: 0, end: 13, endMin: 0 },
  { id: 'work',     title: 'Workblock',subtitle: '09:00 – 17:00', icon: '◯',  start: 9,  startMin: 0, end: 17, endMin: 0 },
  { id: 'evening',  title: 'Evening',  subtitle: '18:00 – 21:00', icon: '◐',  start: 18, startMin: 0, end: 21, endMin: 0 },
  { id: 'night',    title: 'Night',    subtitle: '22:00',          icon: '◑',  start: 22, startMin: 0, end: null, endMin: null },
];

function parseQuery(q: string): TimeSuggestItem | null {
  const m = q.match(/^(\d{1,2})(?::(\d{1,2}))?(?:-(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return null;
  const start    = parseInt(m[1], 10);
  const startMin = m[2] != null ? parseInt(m[2], 10) : 0;
  const end      = m[3] != null ? parseInt(m[3], 10) : null;
  const endMin   = m[4] != null ? parseInt(m[4], 10) : (end == null ? null : 0);
  if (!valid(start, startMin)) return null;
  if (end != null) {
    if (!valid(end, endMin ?? 0)) return null;
    if (!validRange(start, startMin, end, endMin ?? 0)) return null;
  }
  return {
    id: 'live',
    title: end == null ? `Insert ${fmtPoint(start, startMin)}` : `Insert ${fmtPoint(start, startMin)} – ${fmtPoint(end, endMin ?? 0)}`,
    subtitle: '24h · press Enter',
    icon: '⏱',
    start, startMin, end, endMin,
  };
}

function nowItem(): TimeSuggestItem {
  const d = new Date();
  return {
    id: 'now',
    title: 'Now',
    subtitle: fmtPoint(d.getHours(), d.getMinutes()),
    icon: '●',
    start: d.getHours(), startMin: d.getMinutes(),
    end: null, endMin: null,
  };
}

export const TimeChipSuggest = Extension.create({
  name: 'timeChipSuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        startOfLine: false,
        pluginKey: new PluginKey('timeChipSuggest'),
        allowSpaces: false,
        items: ({ query }: { query: string }) => {
          const items: TimeSuggestItem[] = [];
          const live = parseQuery(query);
          if (live) items.push(live);
          items.push(nowItem());
          for (const p of PRESETS) {
            if (!query || p.title.toLowerCase().includes(query.toLowerCase())) items.push(p);
          }
          return items;
        },
        render: makePopupRenderer('No time matches — type a 24h time'),
        command: ({ editor, range, props }: any) => {
          const item = props as TimeSuggestItem;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: 'timeChip', attrs: { start: item.start, startMin: item.startMin, end: item.end, endMin: item.endMin } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
      }),
    ];
  },
});
