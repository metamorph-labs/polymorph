import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Imported by path rather than by package name so Vite's config loader inlines
// the TypeScript source instead of handing it to Node. The workbench does the same.
import { PREPAINT_SCRIPT } from '../../packages/theme/src/runtime'
import { LLMS_PATHS, readLlmsFiles } from './src/llms'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Resolves the persisted theme and mode before first paint, so no unthemed flash shows. */
function prepaintTheme(): Plugin {
  return {
    name: 'pm-prepaint-theme',
    transformIndexHtml() {
      return [{ tag: 'script', children: PREPAINT_SCRIPT, injectTo: 'head-prepend' }]
    },
  }
}

/**
 * Serves `/llms.txt`, `/llms-full.txt` and `/system-card.md` (`src/llms.ts`).
 *
 * They are built from `registry/registry.json`, `registry/system-card.md` and
 * `docs/rules.md` and never written to the source tree. The dev server builds
 * each one when it is requested, so it reflects the registry `predev` (or a
 * later `pnpm registry`) wrote. The build writes them into `dist/` beside the
 * pages, after `prebuild` has regenerated the registry.
 */
function llmsFiles(): Plugin {
  const root = src('../..')
  return {
    name: 'pm-llms-files',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!Object.values<string>(LLMS_PATHS).includes(path)) return next()
        const file = readLlmsFiles(root)[path]!
        response.setHeader('Content-Type', `${file.type}; charset=utf-8`)
        response.end(file.body)
      })
    },
    generateBundle() {
      for (const [path, file] of Object.entries(readLlmsFiles(root))) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: file.body })
      }
    },
  }
}

const EMITTED_SCREEN = 'virtual:polymorph-docs/emitted-screen'
const EMITTED_FRAMEWORKS = ['react', 'vue', 'svelte', 'solid', 'angular'] as const

/**
 * Serves the landing page's screen spec and the source the emitter writes from
 * it, one per web framework, as a virtual module.
 *
 * The page shows one spec beside its React, Vue, Svelte, Solid and Angular
 * output. The output comes from `scripts/emit-screens.mjs`, which calls the functions
 * behind `pnpm emit` with the same checks. So the page cannot show code the
 * emitter does not write, and an unlawful spec fails the build with the
 * validator's own message. A child process is used, not an import, because the
 * emitter reads the registry from the checkout through its own loader.
 */
function emittedScreen(): Plugin {
  const spec = src('./src/home/inbox.screen.json')
  const bin = src('../../scripts/emit-screens.mjs')
  const run = promisify(execFile)
  const resolved = `\0${EMITTED_SCREEN}`
  return {
    name: 'pm-emitted-screen',
    resolveId(id) {
      return id === EMITTED_SCREEN ? resolved : undefined
    },
    async load(id) {
      if (id !== resolved) return undefined
      this.addWatchFile(spec)
      const { stdout } = await run(process.execPath, [bin, spec, ...EMITTED_FRAMEWORKS])
      const emitted = Object.fromEntries(
        Object.entries(JSON.parse(stdout) as Record<string, string>).map(([framework, code]) => [
          framework,
          // The emitter opens every file with a comment that repeats the spec's
          // purpose and says the file was emitted. The page says both beside
          // the code, so the comment is left out to keep the sample short.
          code.replace(/\/\*\*[\s\S]*?\*\/\n+/, '').trimEnd(),
        ]),
      )
      return [
        `export const SCREEN_SPEC = ${JSON.stringify(readFileSync(spec, 'utf8').trimEnd())}`,
        `export const EMITTED = ${JSON.stringify(emitted)}`,
      ].join('\n')
    },
  }
}

const COUNTS = 'virtual:polymorph-docs/counts'

/**
 * Serves the few facts the landing page states, read from the registry when the
 * site is built or served.
 *
 * The page shows four counts and offers the designed systems by name. Importing
 * the registry for them would send the whole catalogue to every first visit, so
 * they are counted here from `registry/registry.json`, which `predev` and
 * `prebuild` have just regenerated.
 */
function registryCounts(): Plugin {
  const file = src('../../registry/registry.json')
  const resolved = `\0${COUNTS}`
  return {
    name: 'pm-registry-counts',
    resolveId(id) {
      return id === COUNTS ? resolved : undefined
    },
    load(id) {
      if (id !== resolved) return undefined
      this.addWatchFile(file)
      const registry = JSON.parse(readFileSync(file, 'utf8')) as {
        components: unknown[]
        frameworks: string[]
        platforms: string[]
        theme: { systems: { name: string; kind: string }[]; palettes: unknown[] }
      }
      const designed = registry.theme.systems
        .filter((system) => system.kind === 'designed')
        .map((system) => system.name)
      const counts = {
        components: registry.components.length,
        // Every renderer: the web frameworks, and each platform that is not the web.
        renderers:
          registry.frameworks.length +
          registry.platforms.filter((platform) => platform !== 'web').length,
        palettes: registry.theme.palettes.length,
      }
      return [
        `export const COUNTS = ${JSON.stringify(counts)}`,
        `export const DESIGNED_SYSTEMS = ${JSON.stringify(designed)}`,
      ].join('\n')
    },
  }
}

/**
 * The docs site consumes `@polymorph/*` as workspace source, as the workbench does. Its
 * content comes from the registry. `predev`/`prebuild` run the registry generator into
 * `/registry`, which is gitignored and never committed, and the pages import that JSON. The site
 * only reshapes the registry and computes nothing the registry does not hold. `llmsFiles` also
 * serves the system card and the rules page as plain text for agents.
 */
export default defineConfig({
  plugins: [react(), prepaintTheme(), llmsFiles(), emittedScreen(), registryCounts()],
  /**
   * Pre-scans the lazy pages and the frame document. The workbench config explains why in
   * full. With a cold cache, the optimizer finds a lazy graph's dependencies after the page
   * loads and re-bundles, so one document can hold two copies of React and a `lazy()` never
   * resolves. The pages glob covers only the routes directory. `frame.html` covers the specimen
   * entry.
   */
  optimizeDeps: {
    entries: ['index.html', 'frame.html', 'src/pages/*.tsx'],
  },
  server: {
    // The second half of the same fix, as in the workbench config. Files warmed together
    // get the same browser hash, so no document loads modules from both sides of a hash change.
    warmup: {
      clientFiles: ['./src/main.tsx', './src/frame.tsx', './src/pages/*.tsx'],
    },
  },
  build: {
    rolldownOptions: {
      /**
       * Two HTML entries. `index.html` is the docs application. `frame.html` is the fixture
       * specimen document that `FixtureFrame` embeds. The frame is a separate HTML entry, not an
       * app route, for two reasons. It must be its own browsing context: Radix portals resolve
       * against `globalThis.document`, so only a separate realm contains an open overlay's
       * modality. And booting `main.tsx` per specimen would load the whole site (shell, registry,
       * pages) into every frame.
       */
      input: {
        main: src('./index.html'),
        frame: src('./frame.html'),
      },
    },
  },
  resolve: {
    // Forces a single copy of React. The workbench config explains why. The aliased source and
    // pnpm's per-package links are the same here, so without this the same stuck `lazy()` occurs.
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
