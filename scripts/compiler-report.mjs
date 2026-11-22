// Which components and hooks the React Compiler skips, and why.
// The build never fails on these: a skipped function just isn't memoised.
// `pnpm run compiler:report` (add `--files` to list where each skip is).
import { transformAsync } from '@babel/core';
import { globSync, readFileSync } from 'node:fs';

const listFiles = process.argv.includes('--files');
const files = globSync('src/**/*.{ts,tsx}').filter((f) => !f.endsWith('.d.ts'));
let compiled = 0;
const skips = [];

for (const file of files) {
  await transformAsync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    code: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [
      [
        'babel-plugin-react-compiler',
        {
          panicThreshold: 'none',
          logger: {
            logEvent: (_, e) => {
              if (e.kind === 'CompileSuccess') compiled++;
              else if (e.kind === 'CompileError' || e.kind === 'PipelineError') {
                const reason = String(e.detail?.options?.reason ?? e.detail?.reason ?? e.data ?? e.kind);
                const line = e.fnLoc?.start?.line ?? e.detail?.options?.loc?.start?.line ?? '?';
                skips.push({ file, line, reason });
              }
            },
          },
        },
      ],
    ],
  });
}

const byReason = new Map();
for (const s of skips) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s]);
console.log(`Compiled ${compiled}, skipped ${skips.length} (${new Set(skips.map((s) => s.file)).size} files)\n`);
for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(list.length).padStart(4)}  ${reason.slice(0, 140)}`);
  if (listFiles) for (const s of list) console.log(`        ${s.file}:${s.line}`);
}
