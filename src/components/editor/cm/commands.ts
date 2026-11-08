import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';

/** Wraps the selection in `mark` (or unwraps it); with no selection, inserts a pair. */
export function toggleWrap(view: EditorView, mark: string, close = mark): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - mark.length, range.from);
    const after = state.sliceDoc(range.to, range.to + close.length);
    if (before === mark && after === close) {
      return {
        changes: [{ from: range.from - mark.length, to: range.from }, { from: range.to, to: range.to + close.length }],
        range: EditorSelection.range(range.from - mark.length, range.to - mark.length),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    if (text.startsWith(mark) && text.endsWith(close) && text.length >= mark.length + close.length) {
      return {
        changes: { from: range.from, to: range.to, insert: text.slice(mark.length, text.length - close.length) },
        range: EditorSelection.range(range.from, range.to - mark.length - close.length),
      };
    }
    return {
      changes: [{ from: range.from, insert: mark }, { from: range.to, insert: close }],
      range: EditorSelection.range(range.from + mark.length, range.to + mark.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
  view.focus();
  return true;
}

const BLOCK_PREFIX = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

export type LineKind = 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'quote' | 'paragraph';

const PREFIX: Record<LineKind, string> = {
  h1: '# ', h2: '## ', h3: '### ', bullet: '- ', number: '1. ', todo: '- [ ] ', quote: '> ', paragraph: '',
};

/** Turns the selected lines into a heading/list/quote; again turns them back to text. */
export function setLineKind(view: EditorView, kind: LineKind): boolean {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const want = PREFIX[kind];
  const all = [...lines].map((n) => state.doc.line(n));
  const already = kind !== 'paragraph' && all.every((l) => {
    const m = BLOCK_PREFIX.exec(l.text);
    const p = (m?.[2] ?? '').replace(/\d+/, '1');
    return p.trimEnd() === want.trimEnd();
  });
  const changes: ChangeSpec[] = [];
  let i = 0;
  for (const line of all) {
    const m = BLOCK_PREFIX.exec(line.text)!;
    const indent = m[1] ?? '';
    const old = m[2] ?? '';
    const next = already ? '' : kind === 'number' ? `${++i}. ` : want;
    changes.push({ from: line.from + indent.length, to: line.from + indent.length + old.length, insert: next });
  }
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' });
  view.focus();
  return true;
}

/** Inserts text on its own line(s) at the cursor; `$0` marks where the cursor lands. */
export function insertBlock(view: EditorView, text: string): boolean {
  const { state } = view;
  const at = state.selection.main;
  const line = state.doc.lineAt(at.from);
  const lead = line.text.trim() ? (at.from === line.to ? '\n' : '\n\n') : '';
  const cursor = text.indexOf('$0');
  const body = text.replace('$0', '');
  const insert = lead + body;
  const from = line.text.trim() ? at.from : line.from;
  const to = line.text.trim() ? at.to : line.to;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + lead.length + (cursor >= 0 ? cursor : body.length) },
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}

/** Inserts inline text at the cursor (replacing the selection). */
export function insertText(view: EditorView, text: string, from?: number, to?: number): void {
  const sel = view.state.selection.main;
  const a = from ?? sel.from;
  const b = to ?? sel.to;
  view.dispatch({ changes: { from: a, to: b, insert: text }, selection: { anchor: a + text.length }, scrollIntoView: true, userEvent: 'input' });
}

/** Mod-k: wrap the selection as a link and put the cursor in the URL. */
export function linkSelection(view: EditorView, openDialog: () => void): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) { openDialog(); return true; }
  const text = view.state.sliceDoc(sel.from, sel.to);
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `[${text}]()` },
    selection: { anchor: sel.from + text.length + 3 },
    userEvent: 'input',
  });
  return true;
}

export function formattingKeymap(openLink: () => void): KeyBinding[] {
  return [
    { key: 'Mod-b', run: (v) => toggleWrap(v, '**') },
    { key: 'Mod-i', run: (v) => toggleWrap(v, '*') },
    { key: 'Mod-Shift-x', run: (v) => toggleWrap(v, '~~') },
    { key: 'Mod-Shift-h', run: (v) => toggleWrap(v, '==') },
    { key: 'Mod-`', run: (v) => toggleWrap(v, '`') },
    { key: 'Mod-k', run: (v) => linkSelection(v, openLink) },
    { key: 'Mod-Alt-1', run: (v) => setLineKind(v, 'h1') },
    { key: 'Mod-Alt-2', run: (v) => setLineKind(v, 'h2') },
    { key: 'Mod-Alt-3', run: (v) => setLineKind(v, 'h3') },
    { key: 'Mod-Alt-0', run: (v) => setLineKind(v, 'paragraph') },
    { key: 'Mod-Shift-7', run: (v) => setLineKind(v, 'number') },
    { key: 'Mod-Shift-8', run: (v) => setLineKind(v, 'bullet') },
    { key: 'Mod-Shift-c', run: (v) => setLineKind(v, 'todo') },
    { key: 'Mod-Shift-9', run: (v) => setLineKind(v, 'todo') },
  ];
}
