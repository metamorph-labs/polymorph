import { distLock } from '@polymorph/conformance/dist-lock'

/**
 * The lock over `packages/angular/dist` (`packages/conformance/dist-lock.ts`
 * says why it exists and how it works). `packaging.test.ts` here and in
 * `packages/angular-ui` build the package and read the build.
 */
export const { lock: lockAngularDist, build: buildAngular } = distLock('angular')
