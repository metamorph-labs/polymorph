import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/react-ui/dist` (`packages/conformance/dist-lock.ts`
 * says why it exists and how it works). `packaging.test.ts` builds the package
 * and reads the build, and `packages/cli/init.test.ts` installs an app from it.
 */
export const { lock: lockReactUiDist, build: buildReactUi } = distLock('react-ui')
