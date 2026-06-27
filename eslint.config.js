import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Rule policy
//
// The codebase favors pragmatic React patterns (effects that read URL
// state, sync localStorage, fan-out fetches on mount, etc.). The newer
// react-hooks "purity" + "set-state-in-effect" rules and the strict
// react-refresh export check flag a long tail of those patterns. We
// keep them ON as warnings so authors see them in editors and CI, but
// don't fail the build. Real correctness rules (no-undef, unused
// imports, hooks-of-hooks) stay as errors.
export default defineConfig([
  globalIgnores(['dist']),
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Demoted: pragmatic patterns that are hard to refactor without
      // restructuring a lot of components.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': 'warn',
      // Keep visible in editors; CI can promote this to error with --rule.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Empty catch / empty block is sometimes intentional (best-effort
      // localStorage / parse). Allow when empty body has a comment.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
])
