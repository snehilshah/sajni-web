// Regenerates src/components/ui/icons.tsx — the app-wide icon shim that maps
// lucide-react names to pixelarticons glyphs (falling back to the real lucide
// icon where no good pixel match exists). Run after adding new lucide icons or
// tweaking the ALIAS map:
//
//   node scripts/gen-icons.cjs
//
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SVG_DIR = path.join(ROOT, 'node_modules/pixelarticons/svg');
const has = (n) => n && fs.existsSync(path.join(SVG_DIR, n + '.svg'));

// 1) collect every lucide icon name used in src
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) files.push(p);
  }
})(path.join(ROOT, 'src'));

const used = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  // matches both the shim's own lucide imports and (pre-swap) source imports
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](?:lucide-react|@\/components\/ui\/icons)['"]/gs;
  let m;
  while ((m = re.exec(t))) {
    m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim()).filter(Boolean).forEach((n) => used.add(n));
  }
}
used.delete('LucideIcon'); // type, handled separately

// 2) explicit aliases (lucide -> pixelarticons base). null = force lucide passthrough.
const ALIAS = {
  Trash2: 'trash', X: 'close', XIcon: 'close',
  Film: 'clapperboard',
  Loader2: null, Loader2Icon: null,            // keep smooth spinner
  ListChecks: 'list-box', ListTodo: 'list-box', List: 'bulletlist',
  CheckSquare: 'checkbox-on',
  CheckIcon: 'check', CircleCheck: 'check', CircleCheckIcon: 'check', CheckCircle2: 'check',
  TrendingUp: 'waves-arrow-up', TrendingDown: 'waves-arrow-down',
  AlertCircle: 'square-alert', AlertTriangle: 'warning-diamond', TriangleAlertIcon: 'warning-diamond',
  Flame: 'fire', LogOut: 'logout', Settings: 'settings-cog',
  ArrowLeftRight: 'arrows-horizontal', ArrowUpDown: 'arrows-vertical',
  Sun: null, Type: null, Tags: null, Pin: null, PinOff: null,
  Bold: null, Italic: null, Strikethrough: null, ListOrdered: null,
  ArrowUpRight: null, ArrowDownLeft: 'corner-down-left',
  PanelLeft: null, PanelLeftClose: null, PanelRight: null, PanelRightClose: null, PanelLeftIcon: null,
  Compass: null, Brain: null, History: null, VenetianMask: 'sunglasses',
  RefreshCw: 'reload',
  Quote: 'quote-text-inline',
  Link2: 'link',
  CalendarX2: 'calendar', CalendarClock: 'date-time', CalendarDays: 'calendar', CalendarIcon: 'calendar',
  MonitorPlay: 'video', MoreHorizontalIcon: 'more-horizontal',
  Landmark: 'university', CandlestickChart: 'chart',
  Ban: 'cancel', RotateCcw: 'undo', OctagonXIcon: 'cancel',
  MinusIcon: 'minus', SearchIcon: 'search', InfoIcon: 'info-box',
  CircleHelp: 'info-box', Activity: 'analytics',
  ArchiveRestore: 'archive', BookmarkPlus: 'bookmark',
  ArrowDownToLine: 'arrow-bar-down',
  LayoutDashboard: 'grid-2x2-2', LayoutGrid: 'grid-3x3',
  PiggyBank: 'money', CircleDollarSign: 'money',
  FilePlus: 'file', FolderOpen: 'folder', FolderInput: 'folder',
  Wand2: 'magic-edit', NotebookPen: 'notebook', Edit3: 'pen-square', Pencil: 'pen-square',
  Code: 'braces',
  Heading1: 'heading-1', Heading2: 'heading-2', Heading3: 'heading-3',
  MessageSquare: 'message',
};

// 3) auto-normalize PascalCase -> kebab, strip trailing "Icon", split letter/digit
const auto = (name) => {
  let n = name.replace(/Icon$/, '');
  n = n.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Za-z])([0-9])/g, '$1-$2').toLowerCase();
  return n;
};

const mapped = {};
const passthrough = [];
for (const name of [...used].sort()) {
  let base;
  if (Object.prototype.hasOwnProperty.call(ALIAS, name)) base = ALIAS[name];
  else base = auto(name);
  if (base && has(base)) mapped[name] = base;
  else passthrough.push(name);
}

// 4) emit icons.tsx
const varOf = (n) => '_px_' + n;
let out = '';
out += '// AUTO-GENERATED icon shim — do not hand-edit. Renders pixelarticons\n';
out += '// glyphs where a sound match exists, else re-exports the original lucide\n';
out += '// icon. Regenerate with:  node scripts/gen-icons.cjs\n';
out += "import { forwardRef, createElement, type SVGProps } from 'react';\n";
out += "import type { LucideIcon } from 'lucide-react';\n\n";
for (const [name, base] of Object.entries(mapped)) {
  out += `import ${varOf(name)} from 'pixelarticons/svg/${base}.svg?raw';\n`;
}
out += '\n';
out += "const strip = (s: string) => s.replace(/<svg[^>]*>/i, '').replace(/<\\/svg>\\s*$/i, '');\n";
out += 'function px(raw: string): LucideIcon {\n';
out += '  const inner = strip(raw);\n';
out += '  const C = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string }>(\n';
out += '    // The glyph is injected via dangerouslySetInnerHTML, so any `children`\n';
out += "    // handed in (e.g. base-ui's <Select.Icon render={...}> clones the element\n";
out += '    // and adds its own children) must be dropped — React forbids setting both.\n';
out += "    ({ size = 24, children: _children, ...props }, ref) => createElement('svg', { ref, width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', ...props, dangerouslySetInnerHTML: { __html: inner } })\n";
out += '  );\n';
out += "  C.displayName = 'PixelIcon';\n";
out += '  return C as unknown as LucideIcon;\n';
out += '}\n\n';
out += '// --- pixel-mapped ---\n';
for (const name of Object.keys(mapped)) {
  out += `export const ${name} = px(${varOf(name)});\n`;
}
out += '\n// --- passthrough to lucide (no good pixel match) ---\n';
if (passthrough.length) {
  out += `export {\n${passthrough.map((n) => '  ' + n).join(',\n')},\n} from 'lucide-react';\n`;
}
out += "\nexport type { LucideIcon } from 'lucide-react';\n";

fs.writeFileSync(path.join(ROOT, 'src/components/ui/icons.tsx'), out);

console.log(`icons.tsx regenerated — ${used.size} used, ${Object.keys(mapped).length} pixel-mapped, ${passthrough.length} lucide passthrough`);
console.log('passthrough:', passthrough.join(' '));
