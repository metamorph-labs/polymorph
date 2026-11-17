import { directionLaw } from '@polymorph/conformance/direction'

import { vueAdapter } from './conformance/vue'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Vue shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Vue', adapter: vueAdapter, galleries: GALLERIES })
