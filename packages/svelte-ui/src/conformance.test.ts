import { conformanceLaw } from '@polymorph/conformance/law'

import { CONFORMANCE_LEDGER } from './conformance/ledger'
import { svelteAdapter } from './conformance/svelte'
import { GALLERIES } from './galleries'

/**
 * The behaviour conformance law for the Svelte shell (`docs/conformance.md`),
 * as `@polymorph/conformance/law` states it for every generated shell: every
 * contract statement of every member the Svelte vocabulary ships holds through
 * the Svelte adapter, except the ledger's, and a false statement of every kind
 * and key effect fails through it.
 */
conformanceLaw({
  shell: 'Svelte',
  adapter: svelteAdapter,
  galleries: GALLERIES,
  ledger: CONFORMANCE_LEDGER,
  specs: import.meta.glob<string>('../../../design/{components,archetypes}/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
})
