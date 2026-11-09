import { Facet, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, ViewPlugin } from '@codemirror/view';

type VimModule = typeof import('@replit/codemirror-vim');
type Register = ReturnType<VimModule['Vim']['getRegisterController']>['unnamedRegister'];

/** What `:w` does in this editor (save now). */
export const vimSave = Facet.define<() => void, (() => void) | null>({
  combine: (all) => all.at(-1) ?? null,
});

let mod: Promise<VimModule> | null = null;
// Set while an x / X command runs, so its delete is kept as a cut.
let cutting = false;
const patched = new WeakSet<Register>();
// The last text that went through the system clipboard, either way.
let lastClip = '';

/**
 * Yanks and deletes land on the system clipboard, and text copied elsewhere
 * is what `p` pastes (Vim's `clipboard=unnamedplus`). Writing happens as the
 * register changes; reading happens when the editor gets focus, because the
 * browser only reads the clipboard asynchronously.
 */
function syncClipboard(Vim: VimModule['Vim']) {
  const reg = Vim.getRegisterController().unnamedRegister;
  if (patched.has(reg)) return reg;
  patched.add(reg);
  const write = () => {
    const text = reg.toString();
    if (!text || text === lastClip) return;
    lastClip = text;
    void navigator.clipboard?.writeText(text).catch(() => { /* not allowed right now */ });
  };
  const setText = reg.setText.bind(reg);
  const pushText = reg.pushText.bind(reg);
  reg.setText = (text, linewise, blockwise) => { setText(text, linewise, blockwise); write(); };
  reg.pushText = (text, linewise) => { pushText(text, linewise); write(); };
  return reg;
}

function setup(Vim: VimModule['Vim']) {
  // Notes wrap: j and k move by the line you see, not the paragraph.
  for (const ctx of ['normal', 'visual']) {
    Vim.noremap('j', 'gj', ctx);
    Vim.noremap('k', 'gk', ctx);
  }
  // Only yanks and cuts reach the registers (and so the clipboard): d, c and
  // s delete without yanking, and x is the cut operator (Vim's d with the
  // yank): xx cuts a line, xw a word, x on a selection cuts it, X to line end.
  // Done by key rather than by mapping d to "_d, which loses a count typed
  // first (3dd). An explicit register ("ad) still works.
  for (const ctx of ['normal', 'visual']) {
    Vim.noremap('x', 'd', ctx);
    Vim.noremap('X', 'D', ctx);
  }
  const rc = Vim.getRegisterController();
  const push = rc.pushText.bind(rc);
  rc.pushText = (name, op, text, linewise, blockwise) => {
    if (!name && (op === 'delete' || op === 'change') && !cutting) return;
    push(name, op, text, linewise, blockwise);
  };
  Vim.defineEx('write', 'w', (cm) => { (cm.cm6 as EditorView).state.facet(vimSave)?.(); });
  syncClipboard(Vim);
}

function load(): Promise<VimModule> {
  mod ??= import('@replit/codemirror-vim').then((m) => { setup(m.Vim); return m; });
  return mod;
}

const MODE_LABEL: Record<string, string> = {
  normal: 'NOR', insert: 'INS', replace: 'REP',
  visual: 'VIS', 'visual linewise': 'V-L', 'visual blockwise': 'V-B',
};

// Operator → the key you pressed for it.
const OP_KEY: Record<string, string> = { delete: 'd', change: 'c', yank: 'y', indent: '>', changeCase: 'g~' };

interface PendingInput {
  prefixRepeat?: string[]; motionRepeat?: string[]; keyBuffer?: string[];
  operator?: string | null; registerName?: string;
}

/**
 * What's typed so far of an unfinished command ("2d", "gU", '"ay'), rebuilt
 * from Vim's state: the d/c/s/x mappings replay keys internally, which wipes
 * Vim's own record of them.
 */
function pendingKeys(vim: unknown): string {
  const st = vim as { inputState?: PendingInput; status?: string } | undefined;
  const i = st?.inputState;
  if (!i) return '';
  let op = '';
  if (i.operator) op = i.operator === 'delete' && cutting ? 'x' : (OP_KEY[i.operator] ?? '');
  const reg = i.registerName ? `"${i.registerName}` : '';
  return reg + (i.prefixRepeat ?? []).join('') + op + (i.motionRepeat ?? []).join('') + (i.keyBuffer ?? []).join('');
}

/** Notes an x / X just before Vim runs it (Vim announces each key first), so its delete is kept as a cut. */
function cutTracker(getCM: VimModule['getCM']) {
  return ViewPlugin.fromClass(class {
    cm: ReturnType<VimModule['getCM']> = null;
    view: EditorView;
    // Per key: on for x / X, kept while that command still waits for its
    // motion (xw, x3j), off for anything else. (Vim reports "done" before it
    // runs the delete, so that can't be the moment to clear it.)
    onInput = (ev: { type?: string; key?: string }) => {
      if (ev.type !== 'handleKey') return;
      const vim = this.cm?.state.vim as { insertMode?: boolean; inputState?: PendingInput } | undefined;
      if (!vim || vim.insertMode) { cutting = false; return; }
      cutting = ev.key === 'x' || ev.key === 'X' || (cutting && !!vim.inputState?.operator);
    };
    constructor(view: EditorView) { this.view = view; this.attach(); }
    attach() {
      if (this.cm) return;
      this.cm = getCM(this.view);
      this.cm?.on('inputEvent', this.onInput);
    }
    update() { this.attach(); }
    destroy() { this.cm?.off('inputEvent', this.onInput); }
  });
}

/** The page's status line (see VimStatusBar): Vim draws its mode, keys, prompts and messages there. */
export const vimStatusHost = Facet.define<HTMLElement | null, HTMLElement | null>({
  combine: (all) => all.at(-1) ?? null,
});

/**
 * Fills the status line's left slot (mode chip, half-typed keys, the ":" and
 * "/" prompts) and its message slot ("3 lines yanked", errors). Vim's own
 * bottom panel stays hidden; its prompt and messages are moved here.
 */
function statusLine(getCM: VimModule['getCM']) {
  return ViewPlugin.fromClass(class {
    view: EditorView;
    host: HTMLElement | null;
    mode: HTMLSpanElement;
    keys: HTMLSpanElement;
    prompt: HTMLSpanElement;
    msg: HTMLElement | null;
    cm: ReturnType<VimModule['getCM']> = null;
    onMode = (e: { mode: string; subMode?: string }) => {
      const key = e.subMode ? `${e.mode} ${e.subMode}` : e.mode;
      this.mode.dataset.mode = e.mode;
      this.mode.textContent = MODE_LABEL[key] ?? e.mode.slice(0, 3).toUpperCase();
      this.keys.textContent = '';
    };
    onKey = () => { queueMicrotask(() => { this.keys.textContent = pendingKeys(this.cm?.state.vim); }); };
    onDone = () => { this.keys.textContent = ''; };
    onDialog = () => {
      const d = (this.cm?.state as { dialog?: HTMLElement | null } | undefined)?.dialog;
      if (!d) { this.prompt.replaceChildren(); this.keys.hidden = false; return; }
      if (d.querySelector('input')) {
        this.keys.hidden = true;
        if (d.parentElement !== this.prompt) this.prompt.replaceChildren(d);
      } else if (this.msg && d.parentElement !== this.msg) {
        this.prompt.replaceChildren();
        this.keys.hidden = false;
        this.msg.replaceChildren(d);
      }
    };
    onFocus = () => requestAnimationFrame(() => {
      const a = document.activeElement;
      this.mode.classList.toggle('is-idle', !(this.view.dom.contains(a) || this.host?.contains(a)));
    });

    constructor(view: EditorView) {
      this.view = view;
      this.host = view.state.facet(vimStatusHost);
      const make = (cls: string) => { const el = document.createElement('span'); el.className = cls; return el; };
      this.mode = make('sajni-vim-mode');
      this.keys = make('sajni-vim-keys');
      this.prompt = make('sajni-vim-prompt');
      this.msg = this.host?.querySelector<HTMLElement>('[data-vim-msg]') ?? null;
      this.host?.querySelector('[data-vim-left]')?.replaceChildren(this.mode, this.keys, this.prompt);
      this.onMode({ mode: 'normal' });
      view.dom.addEventListener('focusin', this.onFocus);
      view.dom.addEventListener('focusout', this.onFocus);
      this.attach();
      this.onFocus();
    }
    attach() {
      if (this.cm) return;
      this.cm = getCM(this.view);
      this.cm?.on('vim-mode-change', this.onMode);
      this.cm?.on('vim-keypress', this.onKey);
      this.cm?.on('vim-command-done', this.onDone);
      this.cm?.on('dialog', this.onDialog);
    }
    update() { this.attach(); }
    destroy() {
      this.cm?.off('vim-mode-change', this.onMode);
      this.cm?.off('vim-keypress', this.onKey);
      this.cm?.off('vim-command-done', this.onDone);
      this.cm?.off('dialog', this.onDialog);
      this.view.dom.removeEventListener('focusin', this.onFocus);
      this.view.dom.removeEventListener('focusout', this.onFocus);
      this.mode.remove(); this.keys.remove(); this.prompt.remove();
      this.msg?.replaceChildren();
    }
  });
}

/** The Vim keymap and what it needs; loaded only once someone turns it on. */
export async function vimExtension(onSave: () => void, statusHost: HTMLElement | null): Promise<Extension> {
  const { vim, Vim, getCM } = await load();
  return [
    vim(),
    vimStatusHost.of(statusHost),
    statusLine(getCM),
    // Vim hides the browser's selection, so draw it (visual mode).
    drawSelection(),
    vimSave.of(onSave),
    cutTracker(getCM),
    EditorView.domEventHandlers({
      focus: () => {
        const reg = syncClipboard(Vim);
        navigator.clipboard?.readText().then((text) => {
          if (!text || text === lastClip) return;
          lastClip = text;
          reg.setText(text, text.endsWith('\n'));
        }).catch(() => { /* permission refused: Vim's own register still works */ });
        return false;
      },
    }),
  ];
}
