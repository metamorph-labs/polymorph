import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/solid/dist` (`packages/conformance/dist-lock.ts` says
 * why it exists and how it works). `packaging.test.ts` builds the package and
 * reads the build, and `packages/solid-ui/packaging.test.ts` builds it before
 * the vocabulary, which imports it.
 */
export const { lock: lockSolidDist, build: buildSolid } = distLock('solid')
