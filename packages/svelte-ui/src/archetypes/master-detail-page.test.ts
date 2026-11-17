import { tick } from 'svelte'

import { masterDetailLaw } from '@polymorph/conformance/master-detail'

import { render } from '../mount'
import MasterDetailPageHarness from '../testing/MasterDetailPageHarness.svelte'
import { live } from '../testing/live.svelte'

/**
 * MasterDetailPage's two arrangements and where its focus goes, in the Svelte
 * shell (`design/archetypes/master-detail-page.md`), as
 * `@polymorph/conformance/master-detail` states them for every web shell. The
 * page and its slots are drawn by `testing/MasterDetailPageHarness.svelte`.
 */
masterDetailLaw({
  shell: 'Svelte',
  async mount({ props, onBack }) {
    const held = live({ ...props, onBack })
    await render(MasterDetailPageHarness, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
