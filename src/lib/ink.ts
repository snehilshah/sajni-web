/** Readable text colour on a solid fill of `hex` (WCAG relative luminance):
 *  near-black on light fills, white on dark ones. Mirrors Android `inkOn`. */
export function inkOn(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim().slice(-7));
  if (!m) return 'hsl(var(--on-primary))';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.36 ? '#1C1B1F' : '#FFFFFF';
}
