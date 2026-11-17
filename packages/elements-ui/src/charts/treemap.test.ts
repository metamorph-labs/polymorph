import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw } from '@polymorph/conformance/treemap'

import { elementsAdapter } from '../conformance/elements'
import { mountElement } from '../mount'
import { states } from './treemap.states'
import './Treemap'

/**
 * A Treemap's tiles, label plates, keys, pointer and direction, as
 * `@polymorph/conformance/treemap` states them for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
treemapLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-treemap', props),
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Elements',
  member: 'Treemap',
  entries: states.entries,
  adapter: elementsAdapter,
})
