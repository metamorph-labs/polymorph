import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Imported by path rather than by package name so Vite's config loader inlines
// the TypeScript source instead of handing it to Node.
import { PREPAINT_SCRIPT } from '../../packages/theme/src/runtime'
import { composerSave } from './src/composer/save-endpoint'
import { studioSave } from './src/studio/save-endpoint'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Resolves the persisted theme and mode before first paint. The script is injected rather than
 * pasted into index.html so that it stays in step with the runtime that writes those keys.
 */
function prepaintTheme(): Plugin {
  return {
    name: 'pm-prepaint-theme',
    transformIndexHtml() {
      return [{ tag: 'script', children: PREPAINT_SCRIPT, injectTo: 'head-prepend' }]
    },
  }
}

/**
 * The workbench consumes `@polymorph/*` as workspace source, never a dist build. The aliases
 * match exactly, so a subpath import cannot resolve somewhere else unnoticed.
 */
export default defineConfig({
  // The save endpoints are dev-only in two ways: `apply: 'serve'` and a `configureServer` hook.
  // So `vite build` and the proof harness's `vite preview` have no write endpoint. Each takes the
  // repository root because it is inlined into the bundled config, where `import.meta.url` no
  // longer points at its own file.
  plugins: [
    react(),
    prepaintTheme(),
    studioSave({ root: src('../../') }),
    composerSave({ root: src('../../') }),
  ],
  /**
   * The dev optimizer pre-scans every lazy route's graph. By default the scanner crawls only
   * `index.html`'s static graph. Every route is a dynamic import, so with a cold cache the
   * optimizer finds the galleries' dependencies after the page has loaded and re-bundles under
   * the open document. A document that spans a re-bundle can hold two copies of React. A `lazy()`
   * whose thenable belongs to the other React's scheduler resolves without waking Suspense, so
   * the page shows a `null` fallback until an interaction re-renders it. One cold deep link
   * without this list loads react-family modules at four `?v=` hashes. With the list, the
   * optimizer logs "the scanner found every used dependency" and bundles once. Add every new lazy
   * route here. A missing entry causes the stuck fallback above, in dev, on a cold cache.
   */
  optimizeDeps: {
    entries: [
      'index.html',
      'src/harness/galleries.ts',
      'src/harness/HomePage.tsx',
      'src/harness/TokensPage.tsx',
      'src/studio/index.ts',
      'src/relay/index.ts',
      'src/pages/index.ts',
      'src/harness/MoodboardPage.tsx',
      'src/composer/index.ts',
      'screen.html',
    ],
  },
  server: {
    /**
     * Pre-transforms the same files the optimizer pre-scans. A transform writes the optimizer's
     * current browser hash into every dependency import URL it rewrites. A boot module
     * transformed before a hash change and a lazy module transformed after it would load two
     * copies of React in one document (the stuck fallback above). Warming them together gives
     * them the same hash.
     */
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/harness/galleries.ts',
        './src/harness/HomePage.tsx',
        './src/harness/TokensPage.tsx',
        './src/studio/index.ts',
        './src/relay/index.ts',
        './src/pages/index.ts',
        './src/harness/MoodboardPage.tsx',
        './src/composer/index.ts',
        './src/screen/main.tsx',
      ],
    },
  },
  build: {
    rolldownOptions: {
      /**
       * Two HTML entries. `index.html` is the workbench. `screen.html` is the screen page: the
       * document the MCP tool `render_screen` draws a spec in (`src/screen/main.tsx`). It is a
       * separate entry because the tool loads it with no toolbar, router or registry around the
       * screen. `screen.build.mjs` builds that entry alone, in memory, for the tool. It is listed
       * here so that every build of the workbench compiles it too.
       */
      input: {
        main: src('./index.html'),
        screen: src('./screen.html'),
      },
    },
  },
  resolve: {
    /**
     * Forces a single copy of React. The aliases below load `@polymorph/*` as source, and pnpm
     * gives each package its own `node_modules/react` link. Both resolutions are valid, so a
     * module graph that uses both gets two copies of React. Without deduping, a cold run requests
     * `react.js` at four distinct URLs, one instance each. The vitest browser projects set the
     * same option for the same reason.
     */
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^@polymorph\/theme$/, replacement: src('../../packages/theme/src/index.ts') },
      { find: /^@polymorph\/react-ui$/, replacement: src('../../packages/react-ui/src/index.ts') },
      {
        find: /^@polymorph\/react-ui\/galleries$/,
        replacement: src('../../packages/react-ui/src/galleries.ts'),
      },
    ],
  },
})
