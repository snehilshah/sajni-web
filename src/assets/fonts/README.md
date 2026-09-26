# Web fonts

Self-host only WOFF2 files used by the site. `src/styles/fonts.css` declares
the faces; `src/index.css` maps semantic roles. Components use roles, never
individual family names.

| Role | Family | Existing aliases |
| --- | --- | --- |
| Headings and display | Chubbo | `font-heading`, `font-serif`, `.serif`, M3 display/title roles, h1–h6 |
| Body and UI labels | Supreme | `font-sans`, `font-mono`, `.mono`, M3 body/label roles |
| Source code | Maple Mono Web | `font-code`, pre/code/samp, Markdown and editor code |

`font-mono` is a legacy metadata role, so UI labels continue to use Supreme.
Use `font-code` for new source-code surfaces. Keyboard hint chips use Supreme.

## Loading

CSS imports these assets through relative URLs, so Vite produces hashed URLs
for cache invalidation. `index.html` preloads only the upright Chubbo and Supreme
variable faces; Vite rewrites those links to the same emitted assets. Italics
and code faces download only when used. All faces use `font-display: swap`.
No external font service, runtime loader, or `local()` lookup is needed.

Chubbo supports weights 200–700; Supreme supports 100–800. Both include genuine
variable italics. Use `font-weight` rather than family-specific variation axes.

## Sources and attribution

- Chubbo: supplied `Chubbo_Complete/Fonts/WEB/fonts`, designed by Rafał Buchner,
  © 2026 Indian Type Foundry. [Fontshare source](https://www.fontshare.com/fonts/chubbo).
- Supreme: supplied `Supreme_Complete/Fonts/WEB/fonts`, designed by Jérémie Hornus
  and Ilya Naumoff, © 2026 Indian Type Foundry.
  [Fontshare source](https://www.fontshare.com/fonts/supreme).
- Fontshare [licensing information](https://www.fontshare.com/licenses).
- Maple Mono: `Maple-Mono-v8.0-beta.3-Web.zip`, verified byte-for-byte against
  `/home/snehilshah/myCodes/maple-font/web-fonts/v8.0-beta.3/default/`.
  Source commit `41afd29452d564a869b77e9f803578582ea883ad`, font version `8.003`.
  Normal-width, hinted web build; no Nerd Font patch or CJK additions.
  Weights 400/700, upright/italic. Frozen features: `cv03`, `cv08`, `ss03` on;
  `ss06` off. CSS keeps `calt` enabled and disables synthetic faces.
  See `maple-mono/OFL.txt` and `maple-mono/BUILD-CONFIG-default.json`.

Keep these assets and their provenance inside this repository so clean checkouts
and deployments do not depend on the sibling font project or downloaded archives.
