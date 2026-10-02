# Sajni organic bloom

`bloom.json` is the shared vector source, traced from the approved October 2026
logo: eight oblique petals rooted beneath a vermilion heart, eight clusters of
three mehendi dots, and transparent vein/separation cutouts. The raster concept's
paper background and shading are deliberately absent from production artwork.

Regenerate from `sajni-web` with Node and ImageMagick 7 installed:

```sh
npm run brand:generate
npm run brand:generate -- --android ../sajni-android
```

The second command explicitly updates the sibling Android repository. No npm
image library or runtime dependency is needed. Review both repositories' diffs.

## Web

- `.sajni-logo` uses `logo-monochrome.svg` and `logo-center.svg` as separate CSS
  masks. Petals inherit `currentColor`, including custom themes and reversed
  surfaces; the centre retains the brand pigment. Cutouts stay transparent.
- Existing filenames are preserved: `logo.svg` has cream ink; `logo-dark.svg`
  has dark ink. `logo-auto.svg` follows the system colour scheme for standalone
  image use. Use the CSS mark inside the app, whose mode can differ from system.
- `logo-name*.svg` are horizontal name lockups. `logo.png` and `logo-light.png`
  are transparent 1024px exports.
- SVG favicons follow browser/system appearance, independently of app mode.
  Both have an opaque backing and contrasting rim. ICO and PNG fallbacks use
  dark artwork on cream so either tab background works.
- Apple/PWA icons have opaque backgrounds. Maskable icons keep the complete
  bloom inside the central 80% diameter safe circle.

## Android

- Adaptive foreground and monochrome layers use the same vector with 66%
  scaling inside a 108dp canvas. All artwork fits the central 66dp safe circle.
- `ic_launcher_monochrome` is a single alpha silhouette with transparent veins;
  the launcher supplies the entire colour palette, including the heart. This
  requires a launcher supporting themed icons with that setting enabled.
- Day/night splash vectors retain the red heart. The Compose sign-in mark
  tints its petal layer with `MaterialTheme.colorScheme.onSurface`, supporting
  light, dark, dynamic wallpaper, and synced palettes.
- Density PNG exports and the Play Store image are generated from the same
  geometry. Adaptive launcher XML uses vectors to stay sharp at every density.

Do not hand-edit generated SVG, PNG, ICO, or vector drawable files. Edit the
source geometry or generator, then regenerate both clients together.
