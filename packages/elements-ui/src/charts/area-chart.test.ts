import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { areaChartReadingLaw } from '@polymorph/conformance/chart-reading'

import { elementsAdapter } from '../conformance/elements'
import { mountElement } from '../mount'
import { states } from './area-chart.states'
import './AreaChart'

/**
 * AreaChart as an element: its reading position and the keys that move it, as
 * `@polymorph/conformance/chart-reading` states them for every web shell, with
 * the element made with the law's props as a page's script makes one; and no
 * part of any state of its states fixture drawn past the chart's inline edges,
 * at a wide and at a phone width and in both directions, as
 * `@polymorph/conformance/chart-box` states it, with each entry mounted as the
 * page's markup through the elements' adapter.
 */
chartBoxLaw({
  shell: 'Elements',
  member: 'AreaChart',
  entries: states.entries,
  adapter: elementsAdapter,
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
areaChartReadingLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-area-chart', props),
})
