import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'

import { mountComponent } from '../mount'
import { angularAdapter } from '../conformance/angular'
import { BarChart } from './BarChart'
import { states } from './bar-chart.states'

/**
 * The lines a BarChart draws over its bars, in the Angular shell
 * (`design/components/bar-chart.md`, `lines`), as
 * `@polymorph/conformance/bar-lines` states them for every web shell.
 */
barLinesLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: async (props) => (await mountComponent(BarChart, { ...props })).host,
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Angular',
  member: 'BarChart',
  entries: states.entries,
  adapter: angularAdapter,
})
