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
    // RichEditor is loaded only when an editor surface opens. Keep its deferred
    // payload out of the startup graph without forcing ProseMirror across a
    // manual chunk boundary; those packages contain circular module links that
    // Rolldown must resolve together.
    chunkSizeWarningLimit: 700,
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
