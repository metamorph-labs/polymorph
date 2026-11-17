import { fileURLToPath } from 'node:url'

import angular from '@analogjs/vite-plugin-angular'
import type { PluginOption } from 'vite'

/**
 * The Angular compiler as a Vite plugin, for the `angular` browser project in
 * the root `vitest.config.ts`. It is loaded from this package because the
 * compiler requires TypeScript 6.0, which this package installs, while the
 * repository's root installs 5.9: a module here resolves both from this
 * package's dependencies. The compiler reads this package's `tsconfig.json`,
 * which includes the foundation's source, so the foundation's components and
 * directives are compiled with the vocabulary's.
 */
export function angularPlugins(): PluginOption[] {
  return angular({
    tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
    workspaceRoot: fileURLToPath(new URL('../..', import.meta.url)),
    // Ahead of time, as an application compiles them: the compiler writes each
    // template as code and type-checks it, where the JIT compiler would read it
    // at run time.
    jit: false,
  }) as PluginOption[]
}
