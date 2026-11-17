import { conformanceLaw } from '@polymorph/conformance/law'

import { CONFORMANCE_LEDGER } from './conformance/ledger'
import { elementsAdapter } from './conformance/elements'
import { GALLERIES } from './galleries'

/**
 * The behaviour conformance law for the custom elements (`docs/conformance.md`),
 * as `@polymorph/conformance/law` states it for every generated shell: every
 * contract statement of every member the elements vocabulary ships holds
 * through the elements' adapter, except the ledger's, and a false statement
 * of every kind and key effect fails through it.
 */
conformanceLaw({
  shell: 'Elements',
  adapter: elementsAdapter,
  galleries: GALLERIES,
  ledger: CONFORMANCE_LEDGER,
  specs: import.meta.glob<string>('../../../design/{components,archetypes}/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
})
