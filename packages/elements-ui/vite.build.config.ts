import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path/posix'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin, type UserConfig } from 'vite'
import solid from 'vite-plugin-solid'

import { admitTheme, PREPAINT_SCRIPT } from '../theme/src/index'
import { reachThroughPlugin } from './reach-through'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The no-build files' directory, inside `dist/`. */
const CDN = 'dist/cdn'

const ELEMENTS_UI_SRC = path('./src/')
const SOLID_UI_SRC = path('../solid-ui/src/')
const RECIPES_SRC = path('../recipes/src/')

/**
 * What the build a bundler reads compiles in: each Solid member an element
 * renders, and its recipe. The Solid vocabulary's own build compiles the
 * recipes as every renderer reads them, and an element needs them through the
 * reach-through transform, so the elements compile the members and their
 * recipes themselves. Every other bare specifier is external, as in the other
 * vocabularies' builds: the elements foundation, the Solid foundation (one
 * module, whose slot conventions the bridge and the members share), Solid and
 * Zag resolve from the consumer's install.
 */
const compiledIn = (id: string): boolean =>
  id.startsWith('@polymorph/solid-ui/') || id.startsWith('@polymorph/recipes/')
const externalPackages = (id: string): boolean =>
  !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && !compiledIn(id)

/**
 * A module's path in `dist/`, without its extension: the vocabulary's own at
 * its source path, a Solid member under `solid/`, a recipe under `recipes/`.
 */
function moduleOutput(file: string | null | undefined): string | null {
  if (file?.startsWith(ELEMENTS_UI_SRC))
    return file.slice(ELEMENTS_UI_SRC.length).replace(/\.tsx?$/, '')
  if (file?.startsWith(SOLID_UI_SRC))
    return `solid/${file.slice(SOLID_UI_SRC.length).replace(/\.tsx?$/, '')}`
  if (file?.startsWith(RECIPES_SRC))
    return `recipes/${file.slice(RECIPES_SRC.length).replace(/\.css$/, '')}`
  return null
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
 * Each element's module imports the foundation before its Solid member, as
 * its source does, so a bundler that orders stylesheets by import puts the
 * base layer, the host rule and the rules for an element not yet rendered
 * before the member's recipe. The bundler hoists a compiled module's import
 * above an external one, so the foundation's import is moved back first.
 */
function foundationFirst(): Plugin {
  const FOUNDATION = /^import\s*\{[^}]*\}\s*from\s*"@polymorph\/elements";\n/m
  return {
    name: 'polymorph:foundation-first',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.facadeModuleId?.startsWith(ELEMENTS_UI_SRC)) continue
        const foundation = FOUNDATION.exec(chunk.code)
        if (foundation === null) continue
        chunk.code = `${foundation[0]}${chunk.code.replace(foundation[0], '')}`
      }
    },
  }
}

/** A catalogue document under `design/`. */
const designDocument = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path(`../../design/${file}`), 'utf8')) as Record<string, unknown>

/**
 * Each house pairing's theme sheet (`themes/<system>.css`): every system in
 * `design/systems/` with the palette it names as its default, admitted by the
 * engine as `polymorph theme emit` admits one. A palette that names a
 * more-contrast partner is admitted with it. An unlawful pairing fails the
 * build with the law's own sentences.
 */
function themeSheets(): Map<string, string> {
  const sheets = new Map<string, string>()
  const systems = readdirSync(path('../../design/systems'))
    .filter((name) => name.endsWith('.json'))
    .sort()
  for (const file of systems) {
    const system = designDocument(`systems/${file}`)
    const name = file.replace(/\.json$/, '')
    const paletteName = String(system['defaultPalette'])
    const palette = designDocument(`palettes/${paletteName}.json`)
    const partner = palette['moreContrast']
    const admission = admitTheme({
      system,
      palette,
      moreContrast:
        typeof partner === 'string' ? designDocument(`palettes/${partner}.json`) : undefined,
    })
    if (!admission.lawful || admission.css === undefined) {
      const faults = admission.faults.map((fault) => `${fault.law}: ${fault.message}`)
      throw new Error(
        `elements: ${name} × ${paletteName} does not admit:\n  ${faults.join('\n  ')}`,
      )
    }
    sheets.set(
      name,
      `/* polymorph — the ${name} system with its ${paletteName} palette, for a page with no build. ` +
        '`<html data-system data-palette>` chooses the pairing a page wears. */\n' +
        admission.css,
    )
  }
  return sheets
}

/**
 * The files of a page with no build that are not modules: a theme sheet per
 * house pairing, and the prepaint script, which a page runs as a classic
 * script first in `<head>` so a stored mode, system or palette applies before
 * the first paint.
 */
function noBuildAssets(): Plugin {
  return {
    name: 'polymorph:no-build-assets',
    apply: 'build',
    generateBundle() {
      for (const [system, css] of themeSheets()) {
        this.emitFile({ type: 'asset', fileName: `themes/${system}.css`, source: css })
      }
      this.emitFile({ type: 'asset', fileName: 'prepaint.js', source: `${PREPAINT_SCRIPT}\n` })
    },
  }
}

/** Every class name a stylesheet declares. */
const classNames = (css: string): Set<string> =>
  new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1] as string))

/**
 * `polymorph-all.js` is built after `polymorph.js` and ships no stylesheet of
 * its own: a page links `polymorph.css` with either script. So the build
 * checks that the stylesheet it would have written declares no class
 * `polymorph.css` lacks, which holds as long as both builds name each recipe's
 * classes alike, and drops it.
 */
function sharedStylesheet(): Plugin {
  return {
    name: 'polymorph:shared-stylesheet',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const shared = classNames(readFileSync(path(`${CDN}/polymorph.css`), 'utf8'))
      for (const [name, output] of Object.entries(bundle)) {
        if (output.type !== 'asset' || !name.endsWith('.css')) continue
        const missing = [...classNames(String(output.source))].filter((name) => !shared.has(name))
        if (missing.length > 0) {
          throw new Error(
            `elements: polymorph-all.js reads classes polymorph.css does not declare: ${missing.slice(0, 10).join(', ')}`,
          )
        }
        delete bundle[name]
      }
    },
  }
}

/**
 * The no-build build: everything bundled, Solid and Zag included, from the
 * workspace's source, with the recipes through the reach-through transform
 * (`reach-through.ts`). Both scripts are built for the browsers the elements
 * support and minified.
 *
 * The source reads `process.env.NODE_ENV`, which an application's bundler
 * replaces and a library build leaves in place. No bundler reads these files
 * and a browser has no `process`, so this build replaces it. It says
 * `development`, which keeps the members' and the elements' warnings: nothing
 * lints a page written in HTML, so the console is where its author learns of
 * an attribute an element could not read.
 */
function noBuild(all: boolean): UserConfig {
  return {
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    plugins: [
      reachThroughPlugin(),
      solid({ hot: false }),
      ...(all ? [sharedStylesheet()] : [noBuildAssets()]),
    ],
    resolve: { dedupe: ['solid-js'] },
    build: {
      outDir: CDN,
      emptyOutDir: !all,
      cssCodeSplit: false,
      sourcemap: false,
      target: 'es2022',
      lib: {
        entry: all
          ? { 'polymorph-all': path('./src/cdn/polymorph-all.ts') }
          : { polymorph: path('./src/cdn/polymorph.ts') },
        formats: ['es'],
        cssFileName: 'polymorph',
      },
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          // A library build keeps its whitespace and comments; a page fetches these files as they are.
          minify: true,
          ...(all ? { codeSplitting: false } : {}),
        },
      },
    },
  }
}

/**
 * The published build of the elements vocabulary: `pnpm --filter
 * @polymorph/elements-ui build`, in three modes.
 *
 * - The default mode writes the modules a bundler reads to `dist/`, one per
 *   source module: the index, which defines every element, each element's
 *   definition module, which defines that one, the definitions table and the
 *   loaders table, with each Solid member they render under `solid/` and its
 *   recipe, through the reach-through transform, under `recipes/`. Each
 *   module imports the stylesheet its source imported, so an element brings
 *   its member's recipe. The foundations, Solid and Zag are external.
 * - `--mode cdn` writes the files a page with no build loads to `dist/cdn/`:
 *   `polymorph.js`, which defines every tag and loads each member's chunk the
 *   first time one of its elements renders; the chunks; `polymorph.css`, which
 *   holds the base layer, every recipe through the reach-through transform,
 *   Icon's stylesheet, the host rule and the rules for an element that has not
 *   rendered; a theme sheet per house pairing (`themes/<system>.css`); and
 *   `prepaint.js`.
 * - `--mode cdn-all` adds `polymorph-all.js`, every element in one file, to
 *   `dist/cdn/`.
 */
export default defineConfig(({ mode }) => {
  if (mode === 'cdn') return noBuild(false)
  if (mode === 'cdn-all') return noBuild(true)
  return {
    plugins: [reachThroughPlugin(), solid({ hot: false }), injectCssImports(), foundationFirst()],
    resolve: { dedupe: ['solid-js'] },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: true,
      sourcemap: true,
      lib: {
        entry: {
          index: path('./src/index.ts'),
          definitions: path('./src/definitions.ts'),
          loaders: path('./src/loaders.ts'),
        },
        formats: ['es'],
      },
      rollupOptions: {
        external: externalPackages,
        output: {
          preserveModules: true,
          preserveModulesRoot: path('./src'),
          entryFileNames: (chunk) => `${moduleOutput(chunk.facadeModuleId) ?? '_/[name]'}.js`,
          assetFileNames: (asset) => {
            const original = asset.originalFileNames[0]
            const recipe = original === undefined ? null : moduleOutput(path(original))
            const name = recipe === null ? (asset.names[0] ?? '[name][extname]') : `${recipe}.css`
            return name.replace(/\.module\.css$/, '.css')
          },
        },
      },
    },
  }
})
