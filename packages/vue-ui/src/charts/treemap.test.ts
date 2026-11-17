import { h, nextTick } from 'vue'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw } from '@polymorph/conformance/treemap'

import { mount } from '../mount'
import { vueAdapter } from '../conformance/vue'
import Treemap from './Treemap.vue'
import { states } from './treemap.states'

/**
 * Treemap in the Vue shell (`design/components/treemap.md`): the tiles, the
 * labels that fit, the keys, the pointer, the twin and the direction, as
 * `@polymorph/conformance/treemap` states them for every web shell. The drawing
 * is the engine's `treemapModel`, which every renderer draws.
 */
treemapLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(Treemap, { ...props }))
    await nextTick()
    return mounted
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Vue', member: 'Treemap', entries: states.entries, adapter: vueAdapter })
