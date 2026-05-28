import { Extension } from '@tiptap/core';

/**
 * LinkEntry — a storage slot the `/link` slash command hands off to, the
 * same pattern as TaskChip's onOpen. RichEditor binds `onOpen` to surface
 * the M3 link dialog (title + url) outside the editor, then inserts the
 * link mark. Keeps the slash command free of React/dialog concerns.
 */
export interface LinkEntryStorage {
  onOpen: ((range: { from: number; to: number }) => void) | null;
}

export const LinkEntry = Extension.create<unknown, LinkEntryStorage>({
  name: 'linkEntry',
  addStorage() {
    return { onOpen: null };
  },
});
