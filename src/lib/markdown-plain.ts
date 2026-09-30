// Markdown → one plain line for previews. Heading lines are dropped (a
// project's leading "# Overview" is noise in a card), inline syntax removed,
// list/quote markers stripped. Never show raw `#` in a preview (DESIGN.md).
export function markdownPlain(md: string): string {
  return md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('```') && !/^[-*_]{3,}$/.test(l))
    .map((l) =>
      l
        .replace(/^>\s*/, '')
        .replace(/^([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1')
        .replace(/[*_~`]+/g, ''),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
