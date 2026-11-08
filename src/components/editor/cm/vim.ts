import { Facet, type Extension } from '@codemirror/state';
import { drawSelection, EditorView } from '@codemirror/view';

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

/** The Vim keymap and what it needs; loaded only once someone turns it on. */
export async function vimExtension(onSave: () => void): Promise<Extension> {
  const { vim, Vim } = await load();
  return [
    vim({ status: true }),
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
