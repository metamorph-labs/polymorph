import { h, nextTick } from 'vue'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw } from '@polymorph/conformance/funnel-chart'

import { mount } from '../mount'
import { vueAdapter } from '../conformance/vue'
import FunnelChart from './FunnelChart.vue'
import { states } from './funnel-chart.states'

/**
 * FunnelChart in the Vue shell (`design/components/funnel-chart.md`): the bars,
 * the words that fit, the keys, the pointer, the twin and the direction, as
 * `@polymorph/conformance/funnel-chart` states them for every web shell. The
 * drawing is the engine's `funnelChartModel`, which every renderer draws.
 */
funnelChartLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(FunnelChart, { ...props }))
    await nextTick()
    return mounted
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Vue', member: 'FunnelChart', entries: states.entries, adapter: vueAdapter })
