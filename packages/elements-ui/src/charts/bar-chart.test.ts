import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'

import { elementsAdapter } from '../conformance/elements'
import { mountElement } from '../mount'
import { states } from './bar-chart.states'
import './BarChart'

/**
 * The lines a BarChart draws over its bars, as `@polymorph/conformance/bar-lines`
 * states them for every shell.
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
