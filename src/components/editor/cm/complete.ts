import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { insertBlock, setLineKind, toggleWrap, type LineKind } from './commands';

export interface CompletionHooks {
  /** Note titles for [[ (may load on first use). */
  notes: () => Promise<string[]>;
  tags: () => Promise<string[]>;
  openLink: () => void;
  pickImage: () => void;
  openTaskPicker: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowChip = () => { const d = new Date(); return `[time:${pad(d.getHours())}:${pad(d.getMinutes())}]`; };

interface Slash { label: string; detail: string; keys?: string; run: (view: EditorView) => void }

function slashCommands(h: CompletionHooks): Slash[] {
  const kind = (k: LineKind) => (v: EditorView) => { setLineKind(v, k); };
  return [
    { label: 'Heading 1', detail: '#', keys: 'h1 title', run: kind('h1') },
    { label: 'Heading 2', detail: '##', keys: 'h2', run: kind('h2') },
    { label: 'Heading 3', detail: '###', keys: 'h3', run: kind('h3') },
    { label: 'Bulleted list', detail: '-', keys: 'bullet ul', run: kind('bullet') },
    { label: 'Numbered list', detail: '1.', keys: 'ordered ol', run: kind('number') },
    { label: 'Checklist', detail: '- [ ]', keys: 'todo checkbox', run: kind('todo') },
    { label: 'Task', detail: 'Link a task', keys: 'task todo', run: () => h.openTaskPicker() },
    { label: 'Quote', detail: '>', keys: 'blockquote', run: kind('quote') },
    { label: 'Code block', detail: '```', keys: 'code fence', run: (v) => { insertBlock(v, '```\n$0\n```'); } },
    { label: 'Table', detail: '| |', keys: 'grid columns', run: (v) => { insertBlock(v, '| Column 1 | Column 2 |\n| --- | --- |\n| $0 | |'); } },
    { label: 'Divider', detail: '---', keys: 'hr rule line', run: (v) => { insertBlock(v, '---\n$0'); } },
    { label: 'Highlight', detail: '==', keys: 'mark', run: (v) => { toggleWrap(v, '=='); } },
    { label: 'Link', detail: 'Web link', keys: 'url', run: () => h.openLink() },
    { label: 'Image', detail: 'Upload', keys: 'picture photo', run: () => h.pickImage() },
    { label: 'Time', detail: 'Now', keys: 'clock timestamp now', run: (v) => { insertAtCursor(v, nowChip() + ' '); } },
    { label: 'Date', detail: 'Today', keys: 'day journal timestamp today', run: (v) => { insertAtCursor(v, `[[${isoDay(new Date())}]] `); } },
  ];
}

function insertAtCursor(view: EditorView, text: string) {
  const at = view.state.selection.main;
  view.dispatch({ changes: { from: at.from, to: at.to, insert: text }, selection: { anchor: at.from + text.length }, userEvent: 'input' });
}

function slashSource(h: CompletionHooks) {
  const cmds = slashCommands(h);
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/(?:^|\s)\/[\w-]*$/);
    if (!m) return null;
    const slash = m.from + m.text.indexOf('/');
    const q = ctx.state.sliceDoc(slash + 1, ctx.pos).toLowerCase();
    // Rank: label starts with the query, then a word in it does, then an alias.
    const scored = cmds
      .map((c, i) => {
        const label = c.label.toLowerCase();
        const score = !q ? 0
          : label.startsWith(q) ? 3
          : label.split(' ').some((w) => w.startsWith(q)) ? 2
          : (c.keys ?? '').split(' ').some((k) => k.startsWith(q)) ? 1 : -1;
        return { c, i, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.i - b.i);
    if (!scored.length) return null;
    return {
      from: slash + 1,
      filter: false,
      options: scored.map<Completion>(({ c }, i) => ({
        label: c.label,
        detail: c.detail,
        boost: -i,
        type: 'sajni-slash',
        apply: (view) => {
          // Drop the "/query" first, then run the command where it was.
          view.dispatch({ changes: { from: slash, to: view.state.selection.main.head }, selection: { anchor: slash } });
          c.run(view);
        },
      })),
    };
  };
}

function wikiSource(h: CompletionHooks) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const m = ctx.matchBefore(/\[\[[^\]\n|]*$/);
    if (!m) return null;
    const titles = await h.notes();
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const close = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === ']]' ? 2 : 0;
    const apply = (target: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
      const insert = `${target}]]`;
      view.dispatch({ changes: { from, to: to + close, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.complete' });
    };
    return {
      from: m.from + 2,
      validFor: /^[^\]\n|]*$/,
      options: [
        ...titles.map<Completion>((t) => ({ label: t, type: 'sajni-note', apply: apply(t) })),
        { label: isoDay(today), detail: 'Today', type: 'sajni-day', apply: apply(isoDay(today)), boost: -1 },
        { label: isoDay(yesterday), detail: 'Yesterday', type: 'sajni-day', apply: apply(isoDay(yesterday)), boost: -2 },
      ],
    };
  };
}

function tagSource(h: CompletionHooks) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const m = ctx.matchBefore(/(?:^|[\s(])#[\w/-]*$/);
    if (!m) return null;
    const hash = m.from + m.text.indexOf('#');
    if (ctx.state.sliceDoc(hash - 1, hash) === '#') return null;
    // "# " at a line start is a heading, not a tag: wait for a letter.
    if (hash === m.to - 1 && !ctx.explicit) return null;
    const tags = await h.tags();
    return {
      from: hash + 1,
      validFor: /^[\w/-]*$/,
      options: tags.map((t) => ({ label: t, type: 'sajni-tag' })),
    };
  };
}

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(?:-(\d{1,2})(?::(\d{2}))?)?$/;

function timeSource() {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/(?:^|\s)@[\w:-]*$/);
    if (!m) return null;
    const at = m.from + m.text.indexOf('@');
    const typed = m.text.slice(m.text.indexOf('@') + 1);
    const opts: Completion[] = [];
    const chip = (label: string, body: string, detail?: string, boost = 0): Completion => ({
      label, detail, type: 'sajni-time', boost,
      apply: (view, _c, _from, to) => {
        const insert = `[time:${body}] `;
        view.dispatch({ changes: { from: at, to, insert }, selection: { anchor: at + insert.length }, userEvent: 'input.complete' });
      },
    });
    const tm = TIME_RE.exec(typed);
    if (tm) {
      const ok = (h: string, mm?: string) => +h <= 23 && (!mm || +mm <= 59);
      if (ok(tm[1], tm[2]) && (!tm[3] || ok(tm[3], tm[4]))) {
        const body = `${pad(+tm[1])}:${tm[2] ?? '00'}${tm[3] ? `-${pad(+tm[3])}:${tm[4] ?? '00'}` : ''}`;
        opts.push(chip(typed, body, body.replace('-', '–'), 10));
      }
    }
    const d = new Date();
    const now = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    opts.push(chip('now', now, now, 5));
    for (const p of ['09:00', '13:00', '18:00']) opts.push(chip(p.replace(/^0/, ''), p, undefined, -1));
    return { from: at + 1, validFor: /^[\w:-]*$/, options: opts, filter: !tm };
  };
}

export function sajniCompletion(h: CompletionHooks): Extension {
  return autocompletion({
    override: [slashSource(h), wikiSource(h), tagSource(h), timeSource()],
    icons: false,
    closeOnBlur: true,
    activateOnTyping: true,
    maxRenderedOptions: 40,
    tooltipClass: () => 'sajni-complete',
  });
}
