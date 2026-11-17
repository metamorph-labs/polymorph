import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The package the members import their recipes from, and its source tree. */
const RECIPES = '@polymorph/recipes'
const RECIPES_SRC = path('../recipes/src/')

/**
 * Every bare specifier is external except a recipe. A library build bundles
 * only its own modules. The consumer's package manager resolves and
 * deduplicates dependencies, and React in particular must be the application's
 * single copy. Relative and absolute paths are this package's own modules; `\0`
 * ids are Vite's virtual helpers.
 *
 * A recipe (`@polymorph/recipes/controls/button.module.css`) is compiled into
 * this build. A CSS Module has to be compiled once, into the class names the
 * member's JavaScript carries, and a bundler that pre-bundles dependencies with
 * esbuild does not compile one. An external recipe would also be a stylesheet
 * Node is asked to load, which it cannot.
 */
const externalPackages = (id: string): boolean =>
  !id.startsWith('.') &&
  !id.startsWith('/') &&
  !id.startsWith('\0') &&
  !id.startsWith(`${RECIPES}/`)

/**
 * A recipe's path in `dist/`, without the extension: its path under the
 * recipes' tree, which is its member's directory (`controls/button.module` for
 * Button's). So the build keeps one tree, and each member imports its compiled
 * stylesheet from its own directory. `null` for a module that is not a recipe.
 */
function recipeOutput(file: string | null | undefined): string | null {
  if (!file?.startsWith(RECIPES_SRC)) return null
  return file.slice(RECIPES_SRC.length).replace(/\.css$/, '')
}

/** The subpath import a built module loads a stylesheet through, and what it resolves to. */
const STYLESHEET = '#stylesheet'
/** The module the `node` condition resolves a stylesheet to. It is empty. */
const NO_STYLESHEET = 'no-stylesheet.js'

/**
 * Each recipe's built module imports its compiled stylesheet, and the base
 * layer before it.
 *
 * Vite's library mode extracts a module's CSS into a file but leaves the import
 * out of the JavaScript, so a consumer would have to know which stylesheet to
 * load for which member. Writing the import back means a member brings its own
 * styles: import `Button`, get Button's CSS, and nothing for the members you
 * never use.
 *
 * The import is a subpath import, `#stylesheet/controls/button.css`, which the
 * package's `imports` map resolves by condition. A bundler gets the stylesheet.
 * Node gets an empty module (`no-stylesheet.js`), because Node cannot import a
 * `.css` file, and Vitest and a server render hand `node_modules` to Node. So
 * there is one copy of every module, whichever condition a toolchain resolves
 * the package's entry by. A second, stylesheet-free copy of the modules would
 * reach the browser from a framework that resolves a client component while it
 * builds the server, which is what Next.js's App Router does, and a page would
 * then hold two copies of a member's context.
 *
 * The base layer rides with every recipe for the same reason. An entry point
 * that imported it would have a side effect, and a bundler that keeps an entry
 * point for its side effects keeps every member the entry re-exports. An entry
 * point here only re-exports, so a bundler follows a name to its module and
 * loads nothing else. The base layer's selectors are elements and the
 * universal selector, which any recipe's class outweighs, so where a bundler
 * places it among the recipes changes nothing.
 */
function stylesheetImports(): Plugin {
  return {
    name: 'polymorph:stylesheet-imports',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: NO_STYLESHEET, source: 'export {}\n' })
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        const css = chunk.viteMetadata?.importedCss
        // An entry point's only stylesheet is the base layer, which the recipes bring.
        if (!css || css.size === 0 || chunk.isEntry) continue

        const imports = ['base.css', ...css]
          .map((file) => `import '${STYLESHEET}/${file}';`)
          .join('\n')
        const directive = /^(['"])use client\1;?\n?/.exec(chunk.code)?.[0] ?? ''
        chunk.code = `${directive}${imports}\n${chunk.code.slice(directive.length)}`
      }
    },
  }
}

/**
 * The published build of the vocabulary: `pnpm --filter @polymorph/react-ui build`.
 *
 * Inside this repository, and for a consumer that links the package, `exports`
 * points at source and the application's bundler compiles it. A package
 * installed from a registry cannot rely on that, because bundlers pre-bundle
 * dependencies with esbuild, which does not compile CSS Modules. So
 * `publishConfig.exports` points here instead: JavaScript, one module per
 * source module, each recipe's module importing its own extracted CSS through
 * the package's `imports` map (`stylesheetImports` above), so Node, Vitest and
 * a server render can load the package without any configuration.
 *
 * It is named separately from `vite.config.ts` so the test projects rooted in
 * this directory never pick up a library build's settings.
 */
export default defineConfig({
  plugins: [react(), stylesheetImports()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    sourcemap: true,
    lib: {
      entry: {
        index: path('./src/index.ts'),
        identity: path('./src/identity.ts'),
        'identity-signup': path('./src/identity-signup.ts'),
        galleries: path('./src/galleries.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: externalPackages,
      output: {
        preserveModules: true,
        preserveModulesRoot: path('./src'),
        // A recipe sits outside `preserveModulesRoot`, so it is placed by its
        // path under the recipes' tree (`recipeOutput`).
        entryFileNames: (chunk) => `${recipeOutput(chunk.facadeModuleId) ?? '[name]'}.js`,
        // Compiled CSS Modules are plain CSS: their class names are already
        // hashed and written into the JavaScript. A consumer's bundler treats any
        // `*.module.css` as a CSS Module to compile again, so the built files drop
        // the `.module`. `originalFileNames` is relative to this directory.
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
