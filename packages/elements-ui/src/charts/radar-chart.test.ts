import { radarChartReadingLaw } from '@polymorph/conformance/chart-reading'

import { mountElement } from '../mount'
import './RadarChart'

/**
 * RadarChart as an element: its reading position and the keys that move it,
 * as `@polymorph/conformance/chart-reading` states them for every web shell.
 * The element is made with the law's props, as a page's script makes one.
 */
radarChartReadingLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-radar-chart', props),
})
