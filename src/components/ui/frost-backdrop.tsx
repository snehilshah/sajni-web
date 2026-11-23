// A frosted backdrop in the theme's own colours (the phone's FrostBackdrop):
// the primary, tertiary and secondary containers as broad soft swells,
// settling toward the surface at the foot, under a fine grain. Still and
// fixed to the viewport, so scrolling over it costs nothing. Tasks and Media
// (not bookmarks) sit on it; put the page's content in `relative` boxes
// after it so it stays behind.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";

export function FrostBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_12%_0%,hsl(var(--primary-container)/0.5),transparent_70%),radial-gradient(ellipse_55%_60%_at_88%_18%,hsl(var(--tertiary-container)/0.42),transparent_70%),radial-gradient(ellipse_70%_60%_at_40%_95%,hsl(var(--secondary-container)/0.32),transparent_70%)] in-data-[mode=dark]:opacity-80"
    >
      <div className="absolute inset-0 opacity-[0.18] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}
