import { dirname, relative } from 'node:path/posix'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The package the members import their recipes from, and its source tree. */
const RECIPES = '@polymorph/recipes'
const RECIPES_SRC = path('../recipes/src/')

/**
 * Every bare specifier is external except a recipe, as in the React and Vue
 * vocabularies' builds (`packages/react-ui/vite.build.config.ts`, which gives
 * the reasons): Solid, Zag and the foundation resolve from the consumer's
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
 * The foundation keeps Icon's stylesheet out of its modules and publishes it
 * as `@polymorph/solid/style.css`; the vocabulary's entry imports it for its
 * consumers.
 */
function foundationStylesheet(): Plugin {
  return {
    name: 'polymorph:solid-stylesheet',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        chunk.code = `import '@polymorph/solid/style.css';\n${chunk.code}`
      }
    },
  }
}

/** The server's build writes no stylesheet and imports none: a server renders strings. */
function withoutStylesheets(): Plugin {
  return {
    name: 'polymorph:server-without-stylesheets',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [name, output] of Object.entries(bundle)) {
        if (output.type === 'asset' && name.endsWith('.css')) delete bundle[name]
      }
    },
  }
}

/**
 * The published build of the Solid vocabulary: `pnpm --filter
 * @polymorph/solid-ui build`. JavaScript, one module per source module, in
 * two builds, because Solid compiles JSX differently for a browser and for a
 * server. The default mode writes the browser's to `dist/` (the `browser` and
 * `import` conditions), each module importing its own extracted CSS; `--mode
 * server` writes the server's to `dist/server/` (the `node` condition), which
 * imports no stylesheet, so plain Node and a server render load it. The
 * recipes compile to the same class names in both. There is no `'use client'`
 * to keep: Solid has no server-component boundary.
 */
export default defineConfig(({ mode }) => {
  const server = mode === 'server'
  return {
    plugins: server
      ? [solid({ solid: { generate: 'ssr', hydratable: false } }), withoutStylesheets()]
      : [solid(), injectCssImports(), foundationStylesheet()],
    build: {
      outDir: server ? 'dist/server' : 'dist',
      emptyOutDir: !server,
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
  }
})
