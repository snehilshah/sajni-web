import { Facet, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

type VimModule = typeof import('@replit/codemirror-vim');
type Register = ReturnType<VimModule['Vim']['getRegisterController']>['unnamedRegister'];

/** What `:w` does in this editor (save now). */
export const vimSave = Facet.define<() => void, (() => void) | null>({
  combine: (all) => all.at(-1) ?? null,
});

let mod: Promise<VimModule> | null = null;
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

/**
 * The mode as a small coloured pill pinned to the bottom of the window, at
 * the text's left edge (where Notes' control bar sits on the right), with any
 * half-typed command beside it. Shown only while the editor has focus. The
 * ":" and "/" prompts sit next to it (see editor.css).
 */
function modePill(getCM: VimModule['getCM']) {
  return ViewPlugin.fromClass(class {
    view: EditorView;
    pill: HTMLDivElement;
    label: HTMLSpanElement;
    keys: HTMLSpanElement;
    cm: ReturnType<VimModule['getCM']> = null;
    onMode = (e: { mode: string; subMode?: string }) => {
      const key = e.subMode ? `${e.mode} ${e.subMode}` : e.mode;
      this.pill.dataset.mode = e.mode;
      this.label.textContent = MODE_LABEL[key] ?? e.mode.slice(0, 3).toUpperCase();
      this.keys.textContent = '';
    };
    onKey = () => {
      queueMicrotask(() => { this.keys.textContent = (this.cm?.state.vim as { status?: string } | undefined)?.status ?? ''; });
    };
    onDone = () => { this.keys.textContent = ''; };
    onFocus = () => this.sync();
    onResize = () => this.place();

    constructor(view: EditorView) {
      this.view = view;
      this.pill = document.createElement('div');
      this.pill.className = 'sajni-vim-mode';
      this.pill.setAttribute('aria-hidden', 'true');
      this.label = document.createElement('span');
      this.label.className = 'sajni-vim-mode-label';
      this.keys = document.createElement('span');
      this.keys.className = 'sajni-vim-mode-keys';
      this.pill.append(this.label, this.keys);
      view.dom.appendChild(this.pill);
      this.onMode({ mode: 'normal' });
      view.dom.addEventListener('focusin', this.onFocus);
      view.dom.addEventListener('focusout', this.onFocus);
      window.addEventListener('resize', this.onResize);
      this.attach();
      this.place();
      this.sync();
    }
    attach() {
      if (this.cm) return;
      this.cm = getCM(this.view);
      this.cm?.on('vim-mode-change', this.onMode);
      this.cm?.on('vim-keypress', this.onKey);
      this.cm?.on('vim-command-done', this.onDone);
    }
    // Follow the text's left edge (rails open and close, the window resizes).
    place() {
      this.view.requestMeasure({
        read: (v) => v.contentDOM.getBoundingClientRect().left,
        write: (left, v) => { v.dom.style.setProperty('--vim-left', `${Math.round(left)}px`); },
      });
    }
    sync() {
      // focusout fires before focus lands elsewhere; look once it has.
      requestAnimationFrame(() => {
        this.pill.classList.toggle('is-on', this.view.dom.contains(document.activeElement));
      });
    }
    update(u: ViewUpdate) {
      this.attach();
      if (u.geometryChanged) this.place();
    }
    destroy() {
      this.cm?.off('vim-mode-change', this.onMode);
      this.cm?.off('vim-keypress', this.onKey);
      this.cm?.off('vim-command-done', this.onDone);
      this.view.dom.removeEventListener('focusin', this.onFocus);
      this.view.dom.removeEventListener('focusout', this.onFocus);
      window.removeEventListener('resize', this.onResize);
      this.pill.remove();
    }
  });
}

/** The Vim keymap and what it needs; loaded only once someone turns it on. */
export async function vimExtension(onSave: () => void): Promise<Extension> {
  const { vim, Vim, getCM } = await load();
  return [
    vim(),
    modePill(getCM),
    // Vim hides the browser's selection, so draw it (visual mode).
    drawSelection(),
    vimSave.of(onSave),
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
