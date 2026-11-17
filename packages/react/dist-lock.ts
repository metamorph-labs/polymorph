import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/react/dist` (`packages/conformance/dist-lock.ts` says
 * why it exists and how it works). `packaging.test.ts` builds the package and
 * reads the build, and `packages/cli/init.test.ts` and
 * `packages/cli/scratch.test.ts` install an app from it.
 */
export const { lock: lockReactDist, build: buildReact } = distLock('react')
