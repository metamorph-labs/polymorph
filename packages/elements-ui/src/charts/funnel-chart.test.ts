import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw } from '@polymorph/conformance/funnel-chart'

import { elementsAdapter } from '../conformance/elements'
import { mountElement } from '../mount'
import { states } from './funnel-chart.states'
import './FunnelChart'

/**
 * A FunnelChart's bars, the words beside them, its keys, pointer and direction,
 * as `@polymorph/conformance/funnel-chart` states them for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
funnelChartLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-funnel-chart', props),
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Elements',
  member: 'FunnelChart',
  entries: states.entries,
  adapter: elementsAdapter,
})
