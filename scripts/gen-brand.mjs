// Shared artwork: npm run brand:generate -- --android ../sajni-android
// Requires ImageMagick 7 (`magick`) for PNG/ICO export; SVG/XML use only Node.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const art = JSON.parse(readFileSync(resolve(root, 'branding/bloom.json'), 'utf8'));
const { ink, cream, vermilion } = art.colors;
const { cx, cy, r } = art.center;
const path = (color) => `<path fill="${color}" fill-rule="evenodd" d="${art.path}"/>`;
const centre = (color) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
const mark = (color, red = vermilion) => path(color) + centre(red);
const svg = (body, label = 'Sajni flower', box = '0 0 256 256') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" role="img" aria-label="${label}">${body}</svg>\n`;
function save(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
const publicFile = (name) => resolve(root, 'public', name);
function raster(source, dest, size) {
  execFileSync('magick', ['-background', 'none', '-density', '384', source, '-resize', `${size}x${size}`, '-depth', '8', '-strip', dest]);
}
// Existing filenames name the INK, not the background: logo.svg is cream.
save(publicFile('logo.svg'), svg(mark(cream)));
save(publicFile('logo-dark.svg'), svg(mark(ink)));
save(publicFile('logo-monochrome.svg'), svg(path('#000000')));
save(publicFile('logo-center.svg'), svg(centre('#000000')));
// Standalone images automatically follow system appearance. In-app CSS uses
// the actual app foreground token, including custom themes and manual mode.
save(publicFile('logo-auto.svg'), svg(`<style>:root{--ink:${ink}}@media(prefers-color-scheme:dark){:root{--ink:${cream}}}</style>${mark('var(--ink)')}`));
for (const [name, color] of [['logo-name.svg', cream], ['logo-name-dark.svg', ink]]) {
  save(publicFile(name), svg(`${mark(color)}<text x="280" y="166" fill="${color}" font-family="Georgia,serif" font-size="104" font-style="italic">sajni</text>`, 'Sajni', '0 0 540 256'));
}
for (const [name, color, bg] of [['favicon.svg', ink, cream], ['favicon-dark.svg', cream, ink]]) {
  // Flat backing only: a contrasting rim becomes a distracting white outline
  // on dark browser tabs. Fixed brand colours never inherit a browser accent.
  save(publicFile(`favicon/${name}`), svg(`<circle cx="128" cy="128" r="126" fill="${bg}"/><g transform="translate(10 10) scale(.921875)">${mark(color)}</g>`, 'Sajni favicon'));
}
const favicon = publicFile('favicon/favicon.svg');
for (const size of [16, 32, 48, 96]) raster(favicon, publicFile(`favicon/favicon-${size}.png`), size);
execFileSync('magick', [16, 32, 48].map(n => publicFile(`favicon/favicon-${n}.png`)).concat(publicFile('favicon/favicon.ico')));
const tile = (scale) => svg(`<path fill="${cream}" d="M0 0H256V256H0Z"/><g transform="translate(${128*(1-scale)} ${128*(1-scale)}) scale(${scale})">${mark(ink)}</g>`);
const tileFile = publicFile('favicon/icon.svg');
save(tileFile, tile(.84));
// Desktop launchers supply their own tile. Keep the regular PWA canvas
// transparent; a narrow shape-following keyline preserves dark-surface contrast.
// Apple and Play Store exports below must continue using the opaque tileFile.
const regularFile = publicFile('favicon/icon-any.svg');
save(regularFile, svg(`<g transform="translate(20.48 20.48) scale(.84)"><path fill="none" stroke="${cream}" stroke-width="4" stroke-linejoin="round" d="${art.path}"/>${mark(ink)}</g>`));
for (const size of [192, 512]) {
  const dest = publicFile(`favicon/icon-${size}.png`);
  raster(regularFile, dest, size);
  // Explicit alpha dilation also works with ImageMagick SVG delegates that
  // omit SVG strokes. Keep the canvas transparent instead of flattening it.
  execFileSync('magick', [dest, '(', '+clone', '-alpha', 'extract',
    '-morphology', 'Dilate', `Disk:${Math.max(1, Math.round(size / 128))}`,
    '-background', cream, '-alpha', 'shape', ')', '+swap',
    '-compose', 'over', '-composite', '-depth', '8', '-strip', dest]);
}
raster(tileFile, publicFile('favicon/apple-touch-icon.png'), 180);
const maskFile = publicFile('favicon/icon-maskable.svg');
// Entire mark fits within the PWA maskable icon's central 80% diameter circle.
save(maskFile, tile(.78));
for (const size of [192, 512]) raster(maskFile, publicFile(`favicon/icon-${size}-maskable.png`), size);
raster(publicFile('logo-dark.svg'), publicFile('logo.png'), 1024);
raster(publicFile('logo.svg'), publicFile('logo-light.png'), 1024);

const androidIndex = process.argv.indexOf('--android');
if (androidIndex !== -1) {
  if (!process.argv[androidIndex+1]) throw new Error('--android requires the Android repository path');
  const android = resolve(process.argv[androidIndex+1]);
  const res = resolve(android, 'app/src/main/res');
  const circlePath = `M${cx-r},${cy}a${r},${r} 0,1 0,${r*2},0a${r},${r} 0,1 0,-${r*2},0`;
  function vector(color, red, scale) {
    return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from sajni-web/branding/bloom.json by gen-brand.mjs. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="256" android:viewportHeight="256">\n  <group android:pivotX="128" android:pivotY="128" android:scaleX="${scale}" android:scaleY="${scale}">\n    <path android:fillColor="${color}" android:fillType="evenOdd" android:pathData="${art.path}"/>\n${red ? `    <path android:fillColor="${red}" android:pathData="${circlePath}"/>\n` : ''}  </group>\n</vector>\n`;
  }
  // 108dp adaptive canvas; every painted pixel stays in the 66dp safe circle.
  save(resolve(res, 'drawable/ic_launcher_foreground.xml'), vector(ink, vermilion, .66));
  save(resolve(res, 'drawable/ic_launcher_monochrome.xml'), vector('#000000', null, .66));
  save(resolve(res, 'drawable/ic_splash_logo.xml'), vector(ink, vermilion, .66));
  save(resolve(res, 'drawable/ic_splash_logo_dark.xml'), vector(cream, vermilion, .66));
  // Full-size layers for Compose tinting with MaterialTheme.onSurface.
  save(resolve(res, 'drawable/ic_brand_monochrome.xml'), vector('#000000', null, 1));
  save(resolve(res, 'drawable/ic_brand_center.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="256" android:viewportHeight="256"><path android:fillColor="${vermilion}" android:pathData="${circlePath}"/></vector>\n`);
  // Regenerate the existing density exports too, for consumers outside Android.
  const foreground = resolve(root, 'branding/launcher-foreground.svg');
  save(foreground, svg(`<g transform="translate(43.52 43.52) scale(.66)">${mark(ink)}</g>`));
  for (const [density, size] of [['mdpi',108],['hdpi',162],['xhdpi',216],['xxhdpi',324],['xxxhdpi',432]]) {
    raster(foreground, resolve(res, `mipmap-${density}/ic_launcher_foreground.png`), size);
  }
  raster(tileFile, resolve(android, 'app/src/main/ic_launcher-playstore.png'), 512);
}
console.log('Generated Sajni web branding' + (androidIndex === -1 ? '' : ' and Android resources'));
