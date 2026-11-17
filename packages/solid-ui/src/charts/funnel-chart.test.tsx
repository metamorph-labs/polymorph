import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw } from '@polymorph/conformance/funnel-chart'

import { mount } from '../mount'
import { solidAdapter } from '../conformance/solid'
import FunnelChart from './FunnelChart'
import { states } from './funnel-chart.states'

/**
 * FunnelChart in the Solid shell (`design/components/funnel-chart.md`): the
 * bars, the words that fit, the keys, the pointer, the twin and the direction,
 * as `@polymorph/conformance/funnel-chart` states them for every web shell. The
 * drawing is the engine's `funnelChartModel`, which every renderer draws.
 */
funnelChartLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <FunnelChart {...props} />),
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Solid',
  member: 'FunnelChart',
  entries: states.entries,
  adapter: solidAdapter,
})
