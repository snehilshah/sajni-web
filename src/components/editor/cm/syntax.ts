import type { MarkdownConfig, InlineContext } from '@lezer/markdown';
import { Strikethrough, Table, TaskList, Autolink } from '@lezer/markdown';

// Sajni's additions to GitHub-flavoured Markdown, as Lezer inline parsers.
//
//   [[Title]] · [[Title|label]]   WikiLink (a note, or a journal day YYYY-MM-DD)
//   [[task:42|Title]]             WikiLink whose target is a task (a task chip)
//   ((task:42|Title))             LegacyTask, the old web chip form (read only)
//   [time:9:30] · [time:9-18:30]  TimeChip
//   ==text==                      Highlight

const BRACKET = 91; // [
const PAREN = 40; // (
const EQUALS = 61; // =

const WikiLink: MarkdownConfig = {
  defineNodes: ['WikiLink', 'WikiMark', 'LegacyTask', 'TimeChip'],
  parseInline: [
    {
      name: 'WikiLink',
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== BRACKET || cx.char(pos + 1) !== BRACKET) return -1;
        const rest = cx.slice(pos + 2, cx.end);
        const close = rest.indexOf(']]');
        if (close <= 0) return -1;
        const inner = rest.slice(0, close);
        if (inner.includes('[') || !inner.trim()) return -1;
        const end = pos + 2 + close + 2;
        return cx.addElement(cx.elt('WikiLink', pos, end, [cx.elt('WikiMark', pos, pos + 2), cx.elt('WikiMark', end - 2, end)]));
      },
    },
    {
      name: 'TimeChip',
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== BRACKET) return -1;
        const m = /^\[time:(\d{1,2})(?::(\d{2}))?(?:-(\d{1,2})(?::(\d{2}))?)?\]/.exec(cx.slice(pos, Math.min(cx.end, pos + 24)));
        if (!m) return -1;
        return cx.addElement(cx.elt('TimeChip', pos, pos + m[0].length));
      },
    },
    {
      name: 'LegacyTask',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== PAREN || cx.char(pos + 1) !== PAREN) return -1;
        const m = /^\(\(task:(\d+)\|([^)\n]*)\)\)/.exec(cx.slice(pos, Math.min(cx.end, pos + 400)));
        if (!m) return -1;
        return cx.addElement(cx.elt('LegacyTask', pos, pos + m[0].length));
      },
    },
  ],
};

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };

const Highlight: MarkdownConfig = {
  defineNodes: ['Highlight', 'HighlightMark'],
  parseInline: [{
    name: 'Highlight',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) return -1;
      const before = pos > cx.offset ? cx.slice(pos - 1, pos) : ' ';
      const after = cx.slice(pos + 2, pos + 3) || ' ';
      const spaceBefore = /\s/.test(before);
      const spaceAfter = /\s/.test(after);
      return cx.addDelimiter(HighlightDelim, pos, pos + 2, !spaceAfter, !spaceBefore);
    },
    after: 'Emphasis',
  }],
};

export const sajniMarkdown = [Table, TaskList, Strikethrough, Autolink, WikiLink, Highlight];

/** `[[target|label]]` → parts. A task target is `task:<id>`. */
export function parseWiki(raw: string): { target: string; label: string; taskId: number | null } {
  const inner = raw.slice(2, -2);
  const bar = inner.indexOf('|');
  const target = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
  const label = (bar >= 0 ? inner.slice(bar + 1) : '').trim();
  const m = /^task:(\d+)$/.exec(target);
  return { target, label: label || target, taskId: m ? Number(m[1]) : null };
}

export function parseLegacyTask(raw: string): { id: number; title: string } | null {
  const m = /^\(\(task:(\d+)\|([^)\n]*)\)\)$/.exec(raw);
  return m ? { id: Number(m[1]), title: m[2] } : null;
}

/** `[time:9:30-18:00]` → "09:30–18:00". */
export function timeLabel(raw: string): string {
  const m = /^\[time:(\d{1,2})(?::(\d{2}))?(?:-(\d{1,2})(?::(\d{2}))?)?\]$/.exec(raw);
  if (!m) return raw;
  const pad = (n: string | undefined) => (n ?? '0').padStart(2, '0');
  const start = `${pad(m[1])}:${pad(m[2])}`;
  return m[3] ? `${start}–${pad(m[3])}:${pad(m[4])}` : start;
}
