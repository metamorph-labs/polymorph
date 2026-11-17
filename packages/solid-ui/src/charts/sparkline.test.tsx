import { chartBoxLaw } from '@polymorph/conformance/chart-box'

import { solidAdapter } from '../conformance/solid'
import { states } from './sparkline.states'

/**
 * Sparkline in the Solid shell: no part of any state of its states fixture is
 * drawn past the chart's inline edges, at a wide and at a phone width and in
 * both directions, as `@polymorph/conformance/chart-box` states it for every
 * web shell.
 */
chartBoxLaw({ shell: 'Solid', member: 'Sparkline', entries: states.entries, adapter: solidAdapter })
