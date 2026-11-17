import { distLock } from '../conformance/dist-lock'

/**
 * The lock over `packages/engine/dist` (`packages/conformance/dist-lock.ts`
 * says why it exists and how it works). `packaging.test.ts` builds the package
 * and reads the build, and `packages/cli/init.test.ts` and
 * `packages/cli/scratch.test.ts` install an app from it.
 *
 * It imports the lock by path, because `@polymorph/conformance` depends on the
 * engine.
 */
export const { lock: lockEngineDist, build: buildEngine } = distLock('engine')
