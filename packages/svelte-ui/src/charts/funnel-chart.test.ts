import { tick } from 'svelte'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw } from '@polymorph/conformance/funnel-chart'

import { render } from '../mount'
import { svelteAdapter } from '../conformance/svelte'
import FunnelChart from './FunnelChart.svelte'
import { states } from './funnel-chart.states.svelte'

/**
 * FunnelChart in the Svelte shell (`design/components/funnel-chart.md`): the
 * bars, the words that fit, the keys, the pointer, the twin and the direction,
 * as `@polymorph/conformance/funnel-chart` states them for every web shell. The
 * drawing is the engine's `funnelChartModel`, which every renderer draws.
 */
funnelChartLaw({
  shell: 'Svelte',
  async mount(props) {
    const mounted = await render(FunnelChart, props)
    await tick()
    return mounted
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Svelte',
  member: 'FunnelChart',
  entries: states.entries,
  adapter: svelteAdapter,
})
