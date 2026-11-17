import { conformanceLaw } from '@polymorph/conformance/law'

import { CONFORMANCE_LEDGER } from './conformance/ledger'
import { angularAdapter } from './conformance/angular'
import { GALLERIES } from './galleries'

/**
 * The behaviour conformance law for the Angular shell (`docs/conformance.md`),
 * as `@polymorph/conformance/law` states it for every generated shell: every
 * contract statement of every member the Angular vocabulary ships holds
 * through the Angular adapter, except the ledger's, and a false statement of
 * every kind and key effect fails through it.
 */
conformanceLaw({
  shell: 'Angular',
  adapter: angularAdapter,
  galleries: GALLERIES,
  ledger: CONFORMANCE_LEDGER,
  specs: import.meta.glob<string>('../../../design/{components,archetypes}/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
})
