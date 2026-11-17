import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** The package's one stylesheet, Icon's, as the build names it. */
const STYLESHEET = 'react.css'

/**
 * Icon's recipe module imports Icon's stylesheet, so a page that renders an
 * Icon has its styles and an application imports no stylesheet by hand.
 *
 * The import is the subpath import `#stylesheet/react.css`, which the
 * package's `imports` map resolves by condition: the stylesheet for a
 * bundler, and an empty module (`no-stylesheet.js`) for Node, which cannot
 * import a `.css` file. So every module here stays importable by plain Node,
 * and a script, a test or a server render can load the package. The React
 * vocabulary's build does the same for each member
 * (`packages/react-ui/vite.build.config.ts`).
 */
function stylesheetImport(): Plugin {
  return {
    name: 'polymorph:stylesheet-import',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'no-stylesheet.js', source: 'export {}\n' })
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.facadeModuleId?.endsWith('.module.css')) continue
        chunk.code = `import '#stylesheet/${STYLESHEET}';\n${chunk.code}`
      }
    },
  }
}

/**
 * The dist build for `@polymorph/react` (`pnpm build:packages`).
 *
 * Two entries, one per JS entry in the package's `exports` map. The root is
 * what a member imports: the engine re-exported, the icon gateway, the hooks
 * and the conventions typed with React's element types. `motion` is for member
 * internals, and application code must not import it.
 *
 * Which dependencies are external:
 *
 *  - `react` and `react-dom` are peers.
 *  - `lucide` is a dependency. A consumer that already has it would otherwise
 *    carry it twice.
 *  - `@polymorph/engine` is a dependency, never bundled. It is published on its
 *    own, and a consumer installs one copy of it. A bundled copy here would be a
 *    second theme engine and a second set of conventions beside the one their
 *    lint config, Vite plugin and test setup import, and the two could disagree
 *    after an upgrade of either.
 *
 * `cssCodeSplit: false` puts Icon's stylesheet in one `dist/react.css`, which
 * Icon's recipe module imports (`stylesheetImport` above). It is also
 * published as `@polymorph/react/style.css`, for an application that imports
 * it by hand.
 */
export default defineConfig({
  plugins: [react(), stylesheetImport()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    lib: {
      entry: {
        index: entry('./src/index.ts'),
        motion: entry('./src/motion/index.ts'),
      },
      formats: ['es'],
      // Named here rather than derived from the package name, because Icon's
      // recipe module and the published `./style.css` export point at this file.
      cssFileName: STYLESHEET.replace(/\.css$/, ''),
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        // Every subpath, not only `jsx-runtime`. Naming only that one lets the
        // build bundle a copy of `react/jsx-dev-runtime`, which is 30 files of
        // React.
        /^react\//,
        /^react-dom\//,
        'lucide',
        '@polymorph/engine',
        /^@polymorph\/engine\//,
      ],
      /*
       * `preserveModules` is required for server rendering.
       *
       * A bundled chunk drops `'use client'`. Without this option the build
       * emits two entries and zero directives, with no warning. Rollup hoists a
       * directive only when it applies to the whole chunk, and the root entry
       * mixes server-safe modules (`Icon`, `spacingAttrs`, the engine
       * re-export) with `useDevWarning` and `useControlRef` (not). Hoisting the
       * directive anyway would put the engine in every consumer's client bundle,
       * and dropping it breaks their build. Mirroring the source graph keeps
       * each module's own directive.
       */
      output: {
        preserveModules: true,
        preserveModulesRoot: entry('./src'),
        entryFileNames: '[name].js',
      },
    },
  },
})
