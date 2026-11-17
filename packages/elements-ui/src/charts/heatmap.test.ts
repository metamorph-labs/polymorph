import { chartBoxLaw } from '@polymorph/conformance/chart-box'

import { elementsAdapter } from '../conformance/elements'
import { states } from './heatmap.states'

/**
 * Heatmap as an element: no part of any state of its states fixture is drawn
 * past the chart's inline edges, at a wide and at a phone width and in both
 * directions, as `@polymorph/conformance/chart-box` states it for every web
 * shell. Each entry is mounted as the page's markup, through the elements'
 * adapter.
 */
chartBoxLaw({
  shell: 'Elements',
  member: 'Heatmap',
  entries: states.entries,
  adapter: elementsAdapter,
})
