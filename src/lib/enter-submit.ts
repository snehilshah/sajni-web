import type { KeyboardEvent } from 'react';

// Single-line fields where Enter means "done". Textareas and the rich editor
// keep Enter for new lines; ⌘/Ctrl+Enter submits from those too.
const SINGLE_LINE = new Set(['text', 'email', 'number', 'url', 'search', 'tel', 'password']);

/**
 * Dialog keyboard contract (DialogContent, MorphingDialog): Enter in a
 * single-line field, or ⌘/Ctrl+Enter anywhere, presses the dialog's primary
 * action: a button marked `data-dialog-submit`, else its one filled Button
 * (DESIGN: at most one filled primary in view). A disabled primary does
 * nothing. Fields that own Enter themselves (inline add rows, renames) must
 * call `preventDefault()` so the dialog doesn't submit as well.
 */
export function submitOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing || e.shiftKey || e.altKey) return;
  const target = e.target as HTMLElement;
  const scope = e.currentTarget;
  // React bubbles through portals: a popover opened from this dialog isn't ours.
  if (!scope.contains(target)) return;
  if (!(e.metaKey || e.ctrlKey)) {
    if (!(target instanceof HTMLInputElement) || !SINGLE_LINE.has(target.type)) return;
    if (target.getAttribute('aria-expanded') === 'true') return;
  }
  const button = scope.querySelector<HTMLButtonElement>('[data-dialog-submit]')
    ?? [...scope.querySelectorAll<HTMLButtonElement>('button[data-variant="default"]')].at(-1);
  if (!button || button.disabled) return;
  e.preventDefault();
  button.click();
}
