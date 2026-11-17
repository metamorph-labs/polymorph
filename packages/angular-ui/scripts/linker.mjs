/**
 * Angular's linker as a Vite plugin, for a build of an application on the
 * published Angular packages (`scripts/size.mjs`'s `angular-*` fixtures).
 *
 * An Angular library ships partial declarations (`ɵɵngDeclareComponent`), and
 * so do Angular's own packages; the application's build links each to the
 * Angular it runs, as the Angular CLI does. This plugin runs the CLI's own
 * JavaScript transformer, with its linker and its production optimizations,
 * over Angular's packages and every module that holds a partial declaration. It is loaded from this package, whose install holds the
 * Angular build tools.
 */
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const require = createRequire(fileURLToPath(new URL('../package.json', import.meta.url)))
const { JavaScriptTransformer } = require('@angular/build/private')
// The transformer's cache keys hash with a utility that is loaded once, before the first use.
const { initializeHash } = require(
  join(dirname(require.resolve('@angular/build/package.json')), 'src/utils/hash.js'),
)

/** The directory a package of this package's install resolves from, for a build's aliases. */
export const resolveFromVocabulary = (specifier) => require.resolve(specifier)

export function angularLinker() {
  let transformer
  return {
    name: 'polymorph:angular-linker',
    apply: 'build',
    config: () => ({
      define: {
        ngJitMode: 'false',
        ngI18nClosureMode: 'false',
        ngDevMode: 'false',
        ngServerMode: 'false',
      },
    }),
    async transform(code, id) {
      const file = id.split('?')[0]
      // Angular's own packages, whose bundles (`fesm2022`) the transformer also marks pure
      // where the CLI does, and every other module that holds a partial declaration.
      if (!/\.[cm]?js$/.test(file) || !(/fesm20/.test(file) || code.includes('ɵɵngDeclare')))
        return null
      if (transformer === undefined) await initializeHash?.()
      transformer ??= new JavaScriptTransformer(
        { sourcemap: false, thirdPartySourcemaps: false, advancedOptimizations: true, jit: false },
        1,
      )
      const result = await transformer.transformData(file, code, false, false)
      return { code: Buffer.from(result).toString(), map: { mappings: '' } }
    },
    async closeBundle() {
      await transformer?.close()
      transformer = undefined
    },
  }
}
