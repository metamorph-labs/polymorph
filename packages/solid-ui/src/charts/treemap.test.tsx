import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw } from '@polymorph/conformance/treemap'

import { mount } from '../mount'
import { solidAdapter } from '../conformance/solid'
import Treemap from './Treemap'
import { states } from './treemap.states'

/**
 * Treemap in the Solid shell (`design/components/treemap.md`): the tiles, the
 * labels that fit, the keys, the pointer, the twin and the direction, as
 * `@polymorph/conformance/treemap` states them for every web shell. The drawing
 * is the engine's `treemapModel`, which every renderer draws.
 */
treemapLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Treemap {...props} />),
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Solid', member: 'Treemap', entries: states.entries, adapter: solidAdapter })
