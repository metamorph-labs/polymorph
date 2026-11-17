import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/elements-ui/dist` (`packages/conformance/dist-lock.ts` says
 * why it exists and how it works). `packaging.test.ts` builds the package and
 * reads the build.
 */
export const { lock: lockElementsUiDist, build: buildElementsUi } = distLock('elements-ui')
