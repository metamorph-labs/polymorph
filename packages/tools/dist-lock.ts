import { distLock } from '../conformance/dist-lock'

/**
 * The lock over `packages/tools/dist` (`packages/conformance/dist-lock.ts` says
 * why it exists and how it works). `packaging.test.ts` builds the package,
 * packs it and installs the tarball, and reads the build until it has packed
 * it.
 *
 * It imports the lock by path, because `@polymorph/conformance` depends on the
 * registry, which the tools bundle.
 */
export const { lock: lockToolsDist, build: buildTools } = distLock('tools')
