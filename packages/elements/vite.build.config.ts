import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The foundation's own stylesheets, which ship beside its modules as they are written. */
const STYLESHEETS = ['host.css', 'pending.css']

/**
 * Every bare specifier is external: Solid, the Solid foundation, the engine
 * and the recipes resolve from the consumer's install, so a page has one copy
 * of each, and the Solid foundation's slot conventions, which the bridge and
 * the Solid members share, are one module. A stylesheet is external too: the
 * index imports its own and the base layer, so every element brings them.
 */
const external = (id: string): boolean =>
  id.endsWith('.css') || (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0'))

/** Copies the foundation's stylesheets into `dist/`, where the index's imports name them. */
function stylesheets(): Plugin {
  return {
    name: 'polymorph:elements-stylesheets',
    apply: 'build',
    generateBundle() {
      for (const name of STYLESHEETS) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: readFileSync(path(`./src/${name}`), 'utf8'),
        })
      }
    },
  }
}

/**
 * The Solid foundation keeps Icon's stylesheet out of its modules and
 * publishes it as `@polymorph/solid/style.css`, which the Solid vocabulary's
 * entry imports. The elements' index imports it instead, after the base layer,
 * so every element brings it as it brings the base layer. The workspace's
 * Icon imports its own stylesheet, so only the build adds the import.
 */
function iconStylesheet(): Plugin {
  return {
    name: 'polymorph:elements-icon-stylesheet',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.js']
      if (index?.type !== 'chunk') throw new Error('elements: the build wrote no index.js')
      const base = 'import "@polymorph/recipes/base.css";\n'
      if (!index.code.includes(base)) throw new Error('elements: index.js imports no base layer')
      index.code = index.code.replace(base, `${base}import "@polymorph/solid/style.css";\n`)
    },
  }
}

/**
 * The published build of `@polymorph/elements`: `pnpm --filter
 * @polymorph/elements build`. One module per source module, for a bundler,
 * with an entry for each JavaScript entry in the package's `exports` map: the
 * root (the bridge, the codecs, the events, the engine re-exported and
 * `poly-icon`), `codecs` and `definition` (data and parsing, which load with no
 * DOM), `loader` (what a page that defines every tag at once loads, which
 * defines no element), `temporal` (the temporal codecs, which a member with a
 * date or a time prop gives `define`), and `icon` (`poly-icon` alone). The foundation writes
 * no JSX, so there is one build: an element renders in a browser and nowhere
 * else.
 */
export default defineConfig({
  plugins: [stylesheets(), iconStylesheet()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: path('./src/index.ts'),
        codecs: path('./src/codecs.ts'),
        definition: path('./src/definition.ts'),
        loader: path('./src/loader.ts'),
        temporal: path('./src/temporal.ts'),
        'icon/Icon': path('./src/icon/Icon.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: path('./src'),
        entryFileNames: '[name].js',
      },
    },
  },
})
