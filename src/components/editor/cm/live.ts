import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

import { parseLegacyTask, parseWiki, timeLabel } from './syntax';
import { chipTask, onChipTask } from './taskStore';

// ── Modes & hooks ─────────────────────────────────────────────────────────

/** live = rendered except the lines being edited · source = plain Markdown · read = rendered, no editing. */
export type EditorMode = 'live' | 'source' | 'read';

export const editorMode = Facet.define<EditorMode, EditorMode>({ combine: (v) => v[0] ?? 'live' });

/** What the rendered pieces do when used; supplied by the React wrapper. */
export interface EditorHooks {
  openWiki: (target: string) => void;
  openTask: (id: number) => void;
  openTag: (tag: string) => void;
  /** Whether a note with this title exists (missing ones render quieter). */
  wikiExists: (target: string) => boolean;
}

export const editorHooks = Facet.define<{ current: EditorHooks }, { current: EditorHooks } | null>({ combine: (v) => v[0] ?? null });

const setFocused = StateEffect.define<boolean>();
const focusField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setFocused) ? e.value : acc), v),
});
const focusTracker = EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing));

/** Re-renders decorations (e.g. after the note list loads, so wikilinks know what exists). */
export const refreshDecorations = StateEffect.define<null>();

// ── Widgets ───────────────────────────────────────────────────────────────

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-bullet';
    s.textContent = '•';
    return s;
  }
}

class CheckboxWidget extends WidgetType {
  readonly checked: boolean;
  constructor(checked: boolean) { super(); this.checked = checked; }
  eq(o: CheckboxWidget) { return o.checked === this.checked; }
  toDOM(view: EditorView) {
    const box = document.createElement('span');
    box.className = 'cm-checkbox' + (this.checked ? ' is-checked' : '');
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(this.checked));
    box.setAttribute('aria-label', this.checked ? 'Done' : 'Not done');
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const line = view.state.doc.lineAt(pos);
      const m = /\[( |x|X)\]/.exec(view.state.sliceDoc(pos, line.to));
      if (!m) return;
      const at = pos + m.index + 1;
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.checked ? ' ' : 'x' }, userEvent: 'input.toggle' });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-hr';
    return s;
  }
}

class ImageWidget extends WidgetType {
  readonly src: string;
  readonly alt: string;
  constructor(src: string, alt: string) { super(); this.src = src; this.alt = alt; }
  eq(o: ImageWidget) { return o.src === this.src && o.alt === this.alt; }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-image';
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  ignoreEvent() { return false; }
}

class WikiWidget extends WidgetType {
  readonly target: string;
  readonly label: string;
  readonly exists: boolean;
  constructor(target: string, label: string, exists: boolean) { super(); this.target = target; this.label = label; this.exists = exists; }
  eq(o: WikiWidget) { return o.target === this.target && o.label === this.label && o.exists === this.exists; }
  toDOM(view: EditorView) {
    const a = document.createElement('span');
    a.className = 'cm-wiki' + (this.exists ? '' : ' is-missing');
    a.textContent = this.label;
    a.title = this.exists ? this.target : `${this.target} (new note)`;
    a.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      view.state.facet(editorHooks)?.current.openWiki(this.target);
    });
    return a;
  }
  ignoreEvent() { return true; }
}

const DUE_FMT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

class TaskWidget extends WidgetType {
  private off?: () => void;
  readonly id: number;
  readonly fallback: string;
  constructor(id: number, fallback: string) { super(); this.id = id; this.fallback = fallback; }
  eq(o: TaskWidget) { return o.id === this.id && o.fallback === this.fallback; }
  private paint(el: HTMLElement) {
    const t = chipTask(this.id);
    const status = t?.status ?? 'todo';
    const done = status === 'done';
    el.className = 'cm-task' + (done ? ' is-done' : '') + (status === 'scratched' || t?.missing ? ' is-gone' : '') + (status === 'blocked' ? ' is-blocked' : '');
    el.replaceChildren();
    const ring = document.createElement('span');
    ring.className = 'cm-task-ring';
    ring.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'cm-task-title';
    title.textContent = t?.missing ? `${this.fallback || 'Task'} (deleted)` : (t?.title || this.fallback || `Task ${this.id}`);
    el.append(ring, title);
    if (t?.due_date && !done) {
      const due = document.createElement('span');
      due.className = 'cm-task-due';
      const d = new Date(`${t.due_date.slice(0, 10)}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        due.textContent = DUE_FMT.format(d);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (d < today) due.classList.add('is-overdue');
        el.append(due);
      }
    }
    el.setAttribute('aria-label', `Task: ${title.textContent}${done ? ', done' : ''}`);
  }
  toDOM(view: EditorView) {
    const el = document.createElement('span');
    el.setAttribute('role', 'button');
    this.paint(el);
    this.off = onChipTask(this.id, () => this.paint(el));
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      view.state.facet(editorHooks)?.current.openTask(this.id);
    });
    return el;
  }
  destroy() { this.off?.(); }
  ignoreEvent() { return true; }
}

class TimeWidget extends WidgetType {
  readonly label: string;
  constructor(label: string) { super(); this.label = label; }
  eq(o: TimeWidget) { return o.label === this.label; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-time';
    s.textContent = this.label;
    return s;
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Light inline Markdown for table cells (bold, italic, code, links, wikilinks). */
function inlineHtml(src: string) {
  let s = escapeHtml(src);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '<span class="cm-wiki">$1</span>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

class TableWidget extends WidgetType {
  readonly source: string;
  constructor(source: string) { super(); this.source = source; }
  eq(o: TableWidget) { return o.source === this.source; }
  toDOM(view: EditorView) {
    const lines = this.source.split('\n');
    const head = splitRow(lines[0] ?? '');
    const aligns = splitRow(lines[1] ?? '').map((c) => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : 'left'));
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    head.forEach((c, i) => {
      const th = document.createElement('th');
      th.style.textAlign = aligns[i] ?? 'left';
      th.innerHTML = inlineHtml(c);
      tr.append(th);
    });
    thead.append(tr);
    const tbody = document.createElement('tbody');
    for (const line of lines.slice(2)) {
      if (!line.trim()) continue;
      const row = document.createElement('tr');
      const cells = splitRow(line);
      head.forEach((_, i) => {
        const td = document.createElement('td');
        td.style.textAlign = aligns[i] ?? 'left';
        td.innerHTML = inlineHtml(cells[i] ?? '');
        row.append(td);
      });
      tbody.append(row);
    }
    table.append(thead, tbody);
    wrap.append(table);
    // Clicking a table (when editing is allowed) opens its source.
    wrap.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('a')) return;
      if (view.state.facet(editorMode) === 'read') return;
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() { return true; }
}

// ── Decorations ───────────────────────────────────────────────────────────

const hide = Decoration.replace({});
const mark = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs });
const lineDeco = (cls: string) => Decoration.line({ class: cls });

const SKIP_TAGS = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'URL', 'Autolink', 'WikiLink', 'LegacyTask', 'TimeChip', 'HTMLTag', 'HTMLBlock', 'Image', 'LinkMark']);
const TAG_RE = /(^|[\s(])#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;

function build(state: EditorState): DecorationSet {
  const mode = state.facet(editorMode);
  const render = mode !== 'source';
  const focused = state.field(focusField, false) ?? false;
  const doc = state.doc;

  // Lines the cursor or selection touches show their Markdown (Live only).
  const active = new Set<number>();
  if (mode === 'live' && focused) {
    for (const r of state.selection.ranges) {
      const a = doc.lineAt(r.from).number;
      const b = doc.lineAt(r.to).number;
      for (let n = a; n <= b; n++) active.add(n);
    }
  }
  const lineActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const rangeActive = (from: number, to: number) => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  const shown = (pos: number) => render && !lineActive(pos);
  const hooks = state.facet(editorHooks)?.current;

  const out: Range<Decoration>[] = [];
  const skip: [number, number][] = [];
  const hideWithSpace = (n: SyntaxNodeRef) => {
    const end = state.sliceDoc(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to;
    out.push(hide.range(n.from, end));
  };
  const linesOf = (from: number, to: number, cls: (i: number, count: number) => string) => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let n = a; n <= b; n++) out.push(lineDeco(cls(n - a, b - a + 1)).range(doc.line(n).from));
  };

  syntaxTree(state).iterate({
    enter(n) {
      const name = n.name;
      if (SKIP_TAGS.has(name)) skip.push([n.from, n.to]);
      switch (name) {
        case 'ATXHeading1': case 'ATXHeading2': case 'ATXHeading3':
        case 'ATXHeading4': case 'ATXHeading5': case 'ATXHeading6': {
          out.push(lineDeco(`cm-h cm-h${name.slice(-1)}`).range(doc.lineAt(n.from).from));
          return;
        }
        case 'SetextHeading1': case 'SetextHeading2':
          linesOf(n.from, n.to, (i, c) => (i === c - 1 ? 'cm-setext-mark' : `cm-h cm-h${name.slice(-1)}`));
          return;
        case 'HeaderMark':
          if (shown(n.from)) {
            if (n.node.parent?.name.startsWith('Setext')) out.push(hide.range(n.from, n.to));
            else hideWithSpace(n);
          } else out.push(mark('cm-md-mark').range(n.from, n.to));
          return;
        case 'Emphasis': out.push(mark('cm-em').range(n.from, n.to)); return;
        case 'StrongEmphasis': out.push(mark('cm-strong').range(n.from, n.to)); return;
        case 'Strikethrough': out.push(mark('cm-strike').range(n.from, n.to)); return;
        case 'Highlight': out.push(mark('cm-highlight').range(n.from, n.to)); return;
        case 'InlineCode': out.push(mark('cm-inline-code').range(n.from, n.to)); return;
        case 'EmphasisMark': case 'StrikethroughMark': case 'HighlightMark':
          out.push((shown(n.from) ? hide : mark('cm-md-mark')).range(n.from, n.to));
          return;
        case 'CodeMark': {
          const parent = n.node.parent?.name;
          if (parent === 'InlineCode') out.push((shown(n.from) ? hide : mark('cm-md-mark')).range(n.from, n.to));
          return;
        }
        case 'Escape':
          if (shown(n.from)) out.push(hide.range(n.from, n.from + 1));
          return;
        case 'HardBreak':
          if (shown(n.from) && state.sliceDoc(n.from, n.from + 1) === '\\') out.push(hide.range(n.from, n.from + 1));
          return;
        case 'Link': case 'Autolink': {
          const node = n.node;
          const url = node.getChild('URL');
          const href = url ? state.sliceDoc(url.from, url.to) : '';
          const marks = node.getChildren('LinkMark');
          if (name === 'Autolink' || !marks.length) {
            if (href) out.push(mark('cm-link', { 'data-href': href }).range(n.from, n.to));
            if (shown(n.from)) marks.forEach((m) => out.push(hide.range(m.from, m.to)));
            return false;
          }
          const textEnd = marks[1]?.from ?? n.to;
          if (textEnd > marks[0].to) out.push(mark('cm-link', href ? { 'data-href': href } : undefined).range(marks[0].to, textEnd));
          if (shown(n.from) && href) {
            out.push(hide.range(marks[0].from, marks[0].to));
            out.push(hide.range(textEnd, n.to));
          } else {
            out.push(mark('cm-md-mark').range(textEnd, n.to));
            out.push(mark('cm-md-mark').range(marks[0].from, marks[0].to));
          }
          return;
        }
        case 'URL': {
          const p = n.node.parent?.name;
          if (p === 'Link' || p === 'Image' || p === 'Autolink') return;
          out.push(mark('cm-link', { 'data-href': state.sliceDoc(n.from, n.to) }).range(n.from, n.to));
          return;
        }
        case 'Image': {
          if (!shown(n.from)) { out.push(mark('cm-md-src').range(n.from, n.to)); return false; }
          const node = n.node;
          const url = node.getChild('URL');
          if (!url) return false;
          const raw = state.sliceDoc(n.from, n.to);
          const alt = /^!\[([^\]]*)\]/.exec(raw)?.[1] ?? '';
          out.push(Decoration.replace({ widget: new ImageWidget(state.sliceDoc(url.from, url.to), alt) }).range(n.from, n.to));
          return false;
        }
        case 'WikiLink': {
          const raw = state.sliceDoc(n.from, n.to);
          const w = parseWiki(raw);
          if (!shown(n.from)) { out.push(mark(w.taskId ? 'cm-task-src' : 'cm-wiki-src').range(n.from, n.to)); return false; }
          const widget = w.taskId != null
            ? new TaskWidget(w.taskId, w.label === w.target ? '' : w.label)
            : new WikiWidget(w.target, w.label, /^\d{4}-\d{2}-\d{2}$/.test(w.target) || (hooks?.wikiExists(w.target) ?? true));
          out.push(Decoration.replace({ widget }).range(n.from, n.to));
          return false;
        }
        case 'LegacyTask': {
          const t = parseLegacyTask(state.sliceDoc(n.from, n.to));
          if (!t) return false;
          if (!shown(n.from)) { out.push(mark('cm-task-src').range(n.from, n.to)); return false; }
          out.push(Decoration.replace({ widget: new TaskWidget(t.id, t.title) }).range(n.from, n.to));
          return false;
        }
        case 'TimeChip': {
          if (!shown(n.from)) { out.push(mark('cm-task-src').range(n.from, n.to)); return false; }
          out.push(Decoration.replace({ widget: new TimeWidget(timeLabel(state.sliceDoc(n.from, n.to))) }).range(n.from, n.to));
          return false;
        }
        case 'ListMark': {
          const item = n.node.parent;
          const list = item?.parent?.name;
          const task = item?.getChild('Task');
          const marker = task?.getChild('TaskMarker');
          if (marker && marker.from >= n.to) {
            const checked = /x/i.test(state.sliceDoc(marker.from, marker.to));
            if (checked) out.push(lineDeco('cm-task-done').range(doc.lineAt(n.from).from));
            if (shown(n.from)) {
              const end = state.sliceDoc(marker.to, marker.to + 1) === ' ' ? marker.to + 1 : marker.to;
              out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(n.from, end));
            } else out.push(mark('cm-md-mark').range(n.from, marker.to));
            return;
          }
          if (list === 'BulletList' && shown(n.from)) out.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to));
          else out.push(mark('cm-list-mark').range(n.from, n.to));
          return;
        }
        case 'TaskMarker': return;
        case 'Blockquote':
          linesOf(n.from, n.to, () => 'cm-quote');
          return;
        case 'QuoteMark':
          if (shown(n.from)) hideWithSpace(n);
          else out.push(mark('cm-md-mark').range(n.from, n.to));
          return;
        case 'HorizontalRule':
          if (shown(n.from)) out.push(Decoration.replace({ widget: new HrWidget() }).range(n.from, n.to));
          else out.push(mark('cm-md-mark').range(n.from, n.to));
          return;
        case 'FencedCode': case 'CodeBlock': {
          const open = render && !rangeActive(n.from, n.to);
          linesOf(n.from, n.to, (i, c) => {
            const fence = name === 'FencedCode' && (i === 0 || (i === c - 1 && /^\s*(`{3,}|~{3,})\s*$/.test(doc.lineAt(n.to).text)));
            return ['cm-codeblock', i === 0 && 'is-first', i === c - 1 && 'is-last', fence && 'cm-fence', fence && open && 'is-folded'].filter(Boolean).join(' ');
          });
          if (open && name === 'FencedCode') {
            const first = doc.lineAt(n.from);
            const last = doc.lineAt(n.to);
            const lang = /^\s*(?:`{3,}|~{3,})\s*([\w+#.-]*)/.exec(first.text)?.[1] ?? '';
            out.push(Decoration.replace({ widget: new CodeLabelWidget(lang) }).range(first.from, first.to));
            if (last.number !== first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text)) out.push(hide.range(last.from, last.to));
          }
          return false;
        }
        case 'Table': {
          if (render && !rangeActive(n.from, n.to)) {
            const from = doc.lineAt(n.from).from;
            const to = doc.lineAt(n.to).to;
            out.push(Decoration.replace({ widget: new TableWidget(state.sliceDoc(from, to)), block: true }).range(from, to));
          } else linesOf(n.from, n.to, () => 'cm-table-src');
          return false;
        }
        default:
          return;
      }
    },
  });

  // #tags (outside code, links and chips).
  const inSkip = (from: number, to: number) => skip.some(([a, b]) => from < b && to > a);
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (!line.text.includes('#')) continue;
    TAG_RE.lastIndex = 0;
    for (let m = TAG_RE.exec(line.text); m; m = TAG_RE.exec(line.text)) {
      const from = line.from + m.index + m[1].length;
      const to = from + 1 + m[2].length;
      if (/^\d+$/.test(m[2]) || inSkip(from, to)) continue;
      out.push(mark('cm-tag', { 'data-tag': m[2] }).range(from, to));
    }
  }

  return Decoration.set(out, true);
}

class CodeLabelWidget extends WidgetType {
  readonly lang: string;
  constructor(lang: string) { super(); this.lang = lang; }
  eq(o: CodeLabelWidget) { return o.lang === this.lang; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-code-lang';
    s.textContent = this.lang;
    return s;
  }
}

const decorations = StateField.define<DecorationSet>({
  create: (state) => build(state),
  update(deco, tr) {
    if (
      tr.docChanged || tr.selection
      || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      || tr.startState.facet(editorMode) !== tr.state.facet(editorMode)
      || tr.effects.some((e) => e.is(setFocused) || e.is(refreshDecorations))
    ) return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Opens links/tags: plain click in Read mode, Ctrl/Cmd-click while editing. */
const clicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement;
    const reading = view.state.facet(editorMode) === 'read';
    if (event.button !== 0 || !(reading || event.metaKey || event.ctrlKey)) return false;
    const link = target.closest<HTMLElement>('[data-href]');
    if (link) {
      event.preventDefault();
      const href = link.dataset.href!;
      window.open(/^[a-z]+:/i.test(href) ? href : `https://${href}`, '_blank', 'noopener,noreferrer');
      return true;
    }
    const tag = target.closest<HTMLElement>('[data-tag]');
    if (tag) {
      event.preventDefault();
      view.state.facet(editorHooks)?.current.openTag(tag.dataset.tag!);
      return true;
    }
    return false;
  },
});

export function livePreview(): Extension {
  return [focusField, focusTracker, decorations, clicks];
}
