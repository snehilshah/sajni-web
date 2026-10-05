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

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
