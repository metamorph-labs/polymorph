/**
 * The `sideEffects` a package publishes, from the one its workspace manifest
 * declares. `scripts/publish-packages.mjs` writes it into the packed manifest,
 * and a package's packaging test reads its published `sideEffects` through it.
 *
 * Inside this repository `exports` points at `src/`, so a workspace manifest
 * names its source entries (`./src/index.ts`), which an app here bundles. The
 * package ships built files instead. A source entry becomes its built
 * counterpart (`./dist/index.js`) when the build writes one that imports a
 * module for its effect. A build that bundles every module into one flat
 * module, as the Angular packages' builds do, writes none, so the entry is
 * dropped rather than published naming a file the package does not ship. Such
 * a flat module imports no stylesheet (each Angular package's
 * `packaging.test.ts` holds that), so it has no side effect to declare. The
 * React vocabulary's built entries only re-export, because each recipe's
 * module brings the base layer its source entry imports
 * (`packages/react-ui/vite.build.config.ts`), so they are dropped too: an
 * entry declared to have a side effect is kept whole by a bundler, with every
 * member it re-exports. Any other entry is kept as written.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE_ENTRY = /^\.\/src\/(.+)\.tsx?$/
/** A statement that imports a module for its effect alone: `import './base.css'`. */
const EFFECT_IMPORT = /^\s*import\s*['"]/m

/**
 * `sideEffects` as the package in `directory` publishes it. `directory` holds
 * the build: the packed package, or the workspace package once it is built.
 *
 * @param {string[]} sideEffects
 * @param {string} directory
 * @returns {string[]}
 */
export function publishedSideEffects(sideEffects, directory) {
  const published = sideEffects.flatMap((path) => {
    if (!SOURCE_ENTRY.test(path)) return [path]
    const built = path.replace(SOURCE_ENTRY, './dist/$1.js')
    const file = resolve(directory, built)
    return existsSync(file) && EFFECT_IMPORT.test(readFileSync(file, 'utf8')) ? [built] : []
  })
  // A manifest may already name the built file beside the source one (the
  // vocabularies list their `dist/*.js` entries), so the result is deduplicated.
  return [...new Set(published)]
}
