import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/elements/dist` (`packages/conformance/dist-lock.ts` says
 * why it exists and how it works). `packaging.test.ts` builds the package and
 * reads the build.
 */
export const { lock: lockElementsDist, build: buildElements } = distLock('elements')
