import { directionLaw } from '@polymorph/conformance/direction'

import { solidAdapter } from './conformance/solid'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Solid shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Solid', adapter: solidAdapter, galleries: GALLERIES })
