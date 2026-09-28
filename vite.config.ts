import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import { rolldown } from 'rolldown'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// Built-in theme palettes are deterministic, so compile them at build time
// into real CSS. It ships in the render-blocking stylesheet: first paint is
// always the right preset and no runtime code injects theme CSS.
// presets.ts is bundled in memory with rolldown (the color library ships
// extensionless ESM that plain Node can't import); addWatchFile makes edits
// to the theme sources hot-reload the CSS in dev.
const THEME_PRESETS_ID = 'virtual:theme-presets.css'
const THEME_SOURCES = ['src/theme/presets.ts', 'src/theme/applyM3.ts'].map((f) =>
  path.resolve(import.meta.dirname, f),
)
function themePresets(): Plugin {
  const resolved = '\0' + THEME_PRESETS_ID
  return {
    name: 'sajni-theme-presets',
    resolveId: (id) => (id === THEME_PRESETS_ID ? resolved : undefined),
    async load(id) {
      if (id !== resolved) return
      THEME_SOURCES.forEach((f) => this.addWatchFile(f))
      const bundle = await rolldown({ input: THEME_SOURCES[0], platform: 'node', logLevel: 'silent' })
      const { output } = await bundle.generate({ format: 'esm' })
      await bundle.close()
      const mod: typeof import('./src/theme/presets') = await import(
        `data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`
      )
      return mod.presetStylesheet()
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    themePresets(),
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
