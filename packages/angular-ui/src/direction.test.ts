import { directionLaw } from '@polymorph/conformance/direction'

import { angularAdapter } from './conformance/angular'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Angular shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Angular', adapter: angularAdapter, galleries: GALLERIES })
