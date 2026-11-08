import { useSyncExternalStore } from 'react';

// Vim keys for the Notes and Journal editors. Kept per device: it's for a
// physical keyboard, so phones never get it.
const KEY = 'sajni:vim';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setVimKeys(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/** False on touch-first devices (phones, tablets), where Vim keys make no sense. */
export const hasKeyboardPointer = () => typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;

/** The saved choice (whatever the device). */
export function useVimPref(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Whether an editor should run Vim keys right now. */
export function useVimKeys(): boolean {
  return useVimPref() && hasKeyboardPointer();
}
