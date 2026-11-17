import { directionLaw } from '@polymorph/conformance/direction'

import { reactAdapter } from './conformance/react'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the React shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'React', adapter: reactAdapter, galleries: GALLERIES })
