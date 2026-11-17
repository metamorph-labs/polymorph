import { dirname, relative } from 'node:path/posix'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The package the members import their recipes from, and its source tree. */
const RECIPES = '@polymorph/recipes'
const RECIPES_SRC = path('../recipes/src/')

/**
 * Every bare specifier is external except a recipe, as in the React
 * vocabulary's build (`packages/react-ui/vite.build.config.ts`, which gives
 * the reasons): Vue, Zag and the foundation resolve from the consumer's
 * install, and each recipe is compiled into this build, once, into the class
 * names the member's JavaScript carries.
 */
const externalPackages = (id: string): boolean =>
  !id.startsWith('.') &&
  !id.startsWith('/') &&
  !id.startsWith('\0') &&
  !id.startsWith(`${RECIPES}/`)

/** A recipe's path in `dist/`, without the extension, or `null` for a module that is not one. */
function recipeOutput(file: string | null | undefined): string | null {
  if (!file?.startsWith(RECIPES_SRC)) return null
  return file.slice(RECIPES_SRC.length).replace(/\.css$/, '')
}

/**
 * A copy of every module under `dist/node/` that imports no stylesheet, for the
 * `node` export condition: Node, Vitest and a server render load these, and a
 * browser bundler loads the modules that import their stylesheets.
 */
function nodeModules(): Plugin {
  return {
    name: 'polymorph:node-modules',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        const fileName = `node/${chunk.fileName}`
        this.emitFile({ type: 'asset', fileName, source: chunk.code })
        if (!chunk.map) continue
        const map = { ...chunk.map, sources: chunk.map.sources.map((source) => `../${source}`) }
        this.emitFile({ type: 'asset', fileName: `${fileName}.map`, source: JSON.stringify(map) })
      }
    },
  }
}

/** Each built module imports the CSS its source module imported, so a member brings its own styles. */
function injectCssImports(): Plugin {
  return {
    name: 'polymorph:inject-css-imports',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        const css = chunk.viteMetadata?.importedCss
        if (!css || css.size === 0) continue
        const from = dirname(chunk.fileName)
        const imports = [...css]
          .map((file) => {
            const relativePath = relative(from, file)
            return `import '${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}';`
          })
          .join('\n')
        chunk.code = `${imports}\n${chunk.code}`
      }
    },
  }
}

/**
 * The published build of the Vue vocabulary: `pnpm --filter @polymorph/vue-ui
 * build`. JavaScript, one module per source module (each single-file
 * component compiled), each importing its own extracted CSS, with a `node`
 * copy that imports none. There is no `'use client'` to keep: Vue has no
 * server-component boundary.
 */
export default defineConfig({
  plugins: [
    vue(),
    nodeModules(),
    injectCssImports(),
    {
      // The foundation keeps Icon's stylesheet out of its modules and publishes
      // it as `@polymorph/vue/style.css`; the vocabulary's entry imports it for
      // its consumers. The `node` copies are taken before this runs.
      name: 'polymorph:vue-stylesheet',
      apply: 'build',
      enforce: 'post',
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk' || !chunk.isEntry) continue
          chunk.code = `import '@polymorph/vue/style.css';\n${chunk.code}`
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    sourcemap: true,
    lib: {
      entry: { index: path('./src/index.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: externalPackages,
      output: {
        preserveModules: true,
        preserveModulesRoot: path('./src'),
        entryFileNames: (chunk) => `${recipeOutput(chunk.facadeModuleId) ?? '[name]'}.js`,
        assetFileNames: (asset) => {
          const original = asset.originalFileNames[0]
          const recipe = original === undefined ? null : recipeOutput(path(original))
          const name = recipe === null ? (asset.names[0] ?? '[name][extname]') : `${recipe}.css`
          return name.replace(/\.module\.css$/, '.css')
        },
      },
    },
  },
})
