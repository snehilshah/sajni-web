import path from 'path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      // Asset transforms and the React Compiler are intentional. Keep every
      // correctness check, but skip Rolldown's advisory build-time breakdown.
      checks: { pluginTimings: false },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'theme-vendor',
              test: /node_modules[\\/]@material[\\/]material-color-utilities[\\/]/,
              priority: 18,
            },
            {
              name: 'editor-vendor',
              test: /node_modules[\\/](?:@tiptap|prosemirror-|tiptap-markdown)[\\/]/,
              maxSize: 900 * 1024,
              includeDependenciesRecursively: false,
              entriesAware: true,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
