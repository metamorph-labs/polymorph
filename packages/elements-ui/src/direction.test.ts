import { directionLaw } from '@polymorph/conformance/direction'

import { elementsAdapter } from './conformance/elements'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the custom elements, as
 * `@polymorph/conformance/direction` states it for every shell: no element's
 * member says left-to-right in a right-to-left document, and Tabs turns with
 * it. Each entry is mounted as the page's markup, through the elements'
 * adapter.
 */
directionLaw({ shell: 'Elements', adapter: elementsAdapter, galleries: GALLERIES })
