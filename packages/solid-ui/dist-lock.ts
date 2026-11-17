import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/solid-ui/dist` (`packages/conformance/dist-lock.ts`
 * says why it exists and how it works). `packaging.test.ts` builds the package
 * and reads the build.
 */
export const { lock: lockSolidUiDist, build: buildSolidUi } = distLock('solid-ui')
