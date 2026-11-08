import type { Note, NoteFolder } from '@/types';

/** A note as the list returns it (no content). */
export type NoteListItem = Omit<Note, 'content' | 'backlinks'>;

export interface TreeNode {
  type: 'folder' | 'note';
  name: string;
  /** Folder path; for a note, its parent folder. */
  path: string;
  pinned?: boolean;
  note?: NoteListItem;
  children: TreeNode[];
  /** Notes anywhere under this folder. */
  count: number;
}

export interface OutlineItem {
  level: number;
  text: string;
  index: number;
}

export interface OutgoingLink {
  ref: string;
  title: string;
  id?: number;
}

/** The title a note is saved under: what the user typed, else its first line. */
export function effectiveTitle(title: string, content: string): string {
  const t = title.trim();
  if (t) return t;
  for (const raw of content.split('\n')) {
    const line = raw.trim().replace(/^#+\s*/, '');
    if (line) return line.length > 80 ? line.slice(0, 80) : line;
  }
  return '';
}

export function displayTitle(title: string): string {
  return title.trim() || 'Untitled';
}

export function folderAncestors(path: string): string[] {
  if (!path) return [];
  const parts = path.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

export function buildTree(notes: NoteListItem[], folders: NoteFolder[]): TreeNode {
  const root: TreeNode = { type: 'folder', name: '', path: '', children: [], count: 0 };
  const byPath = new Map<string, TreeNode>([['', root]]);
  const pinned = new Set(folders.filter((f) => f.pinned).map((f) => f.path));

  const paths = new Set<string>();
  for (const f of folders) folderAncestors(f.path).forEach((p) => paths.add(p));
  for (const n of notes) folderAncestors(n.folder).forEach((p) => paths.add(p));

  for (const p of [...paths].sort((a, b) => a.localeCompare(b))) {
    const cut = p.lastIndexOf('/');
    const node: TreeNode = {
      type: 'folder', name: cut >= 0 ? p.slice(cut + 1) : p, path: p,
      pinned: pinned.has(p), children: [], count: 0,
    };
    byPath.set(p, node);
    byPath.get(cut >= 0 ? p.slice(0, cut) : '')?.children.push(node);
  }

  for (const n of notes) {
    (byPath.get(n.folder) ?? root).children.push({
      type: 'note', name: displayTitle(n.title), path: n.folder, pinned: n.pinned, note: n, children: [], count: 0,
    });
    for (const p of folderAncestors(n.folder)) {
      const f = byPath.get(p);
      if (f) f.count += 1;
    }
  }

  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });
    node.children.forEach((c) => c.type === 'folder' && sort(c));
  };
  sort(root);
  root.count = notes.length;
  return root;
}

const FENCE = /^\s*(```|~~~)/;

export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2]
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`=]/g, '')
      .trim();
    if (text) items.push({ level: m[1].length, text, index: items.length });
  }
  return items;
}

export function extractOutgoing(markdown: string, notes: NoteListItem[], selfId: number | null): OutgoingLink[] {
  const byTitle = new Map(notes.map((n) => [n.title.trim().toLowerCase(), n]));
  const seen = new Set<string>();
  const out: OutgoingLink[] = [];
  for (const m of markdown.matchAll(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g)) {
    const ref = m[1].trim();
    const key = ref.toLowerCase();
    if (!ref || key.startsWith('task:') || /^\d{4}-\d{2}-\d{2}$/.test(ref) || seen.has(key)) continue;
    seen.add(key);
    const note = byTitle.get(key);
    if (note && note.id === selfId) continue;
    out.push({ ref, title: m[2]?.trim() || note?.title || ref, id: note?.id });
  }
  return out;
}

/** Words and characters of the readable text (markup and link targets dropped). */
export function countText(markdown: string): { words: number; characters: number } {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[(?:task:\d+\|)?([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b || a)
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*(?:#{1,6}|>)\s+/gm, '')
    .replace(/[*_~`=|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return { words: 0, characters: 0 };
  return { words: plain.split(' ').length, characters: [...plain].length };
}

export function relTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function fullTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
