import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { barChartReadingLaw } from '@polymorph/conformance/chart-reading'

import { elementsAdapter } from '../conformance/elements'
import { mountElement } from '../mount'
import { states } from './bar-chart.states'
import './BarChart'

/**
 * BarChart as an element: its reading position and the keys that move it, as
 * `@polymorph/conformance/chart-reading` states them for every web shell; the
 * lines it draws over its bars, as `@polymorph/conformance/bar-lines` states
 * them; and no part of any state of its states fixture drawn past the chart's
 * inline edges, as `@polymorph/conformance/chart-box` states it. The laws make
 * the element with their props, as a page's script makes one, and the box law
 * mounts each entry as the page's markup.
 */
barLinesLaw({
  shell: 'Elements',
  mount: async (props) => (await mountElement('poly-bar-chart', props)).host,
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Elements',
  member: 'BarChart',
  entries: states.entries,
  adapter: elementsAdapter,
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
barChartReadingLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-bar-chart', props),
})
