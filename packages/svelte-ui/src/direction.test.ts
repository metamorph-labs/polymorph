import { directionLaw } from '@polymorph/conformance/direction'

import { svelteAdapter } from './conformance/svelte'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Svelte shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Svelte', adapter: svelteAdapter, galleries: GALLERIES })
