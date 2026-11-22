# Sajni web

React + TypeScript + Vite, built with Node.js 24 and pnpm 12.9.1 (pinned in
`package.json`).

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run lint:ci
pnpm run build
```

Use `pnpm add <package>` to add dependencies and `pnpm exec <tool>` for installed
tools. Commit `pnpm-lock.yaml` with dependency changes. CI and Vercel install from
the frozen lockfile.

## Storage and SSD writes

- Keep pnpm's shared store on the same filesystem as the checkout. The default
  store already does this locally; do not create a separate store per project.
  `pnpm store path` shows its location. Automatic package imports use hardlinks
  on Linux and try cloning or linking on other platforms before copying.
- Keep `node_modules`, the store, Vite caches, and TypeScript incremental caches
  between runs. Reuse them with `pnpm install --frozen-lockfile`; the project
  prefers cached metadata and retains native build results.
- Avoid routine `pnpm store prune`, cache clearing, `--force`, and deleting
  `node_modules`. Use cleanup only when space is needed or a cache is broken;
  clearing reusable files creates downloads and writes on the next install.
- Treat files in `node_modules` as immutable: hardlinked edits also change the
  shared store. Use pnpm patches for dependency fixes.
- Run `make clean` only when you need a clean build. It removes build output and
  local caches, and is intentionally separate from normal installs and builds.

Sharing package files saves space and reduces repeated writes across projects.
It does not measure or guarantee SSD lifespan. The one-time migration still
needs to populate any packages missing from the store.

## Lint and format

- **Lint:** [oxlint](https://oxc.rs/docs/guide/usage/linter.html), config `.oxlintrc.json`. It carries the old ESLint rules
  (core recommended, typescript-eslint recommended, React hooks incl. the React Compiler checks) at the same levels, plus
  oxlint's own correctness set as warnings. `pnpm run lint`; CI runs `pnpm run lint:ci` (errors only). Existing
  `eslint-disable` comments are honoured.
- **Format:** [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), config `.oxfmtrc.json` (2 spaces, single quotes,
  width 120, Tailwind classes sorted). `pnpm run fmt` rewrites; CI fails on `pnpm run fmt:check`. Both are pinned to exact
  versions: upgrade them on purpose, then run `pnpm run fmt` and commit the result alone.
- The one-time reformat commit is listed in `.git-blame-ignore-revs` (GitHub skips it in blame; locally run
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`).
