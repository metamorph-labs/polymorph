import { tick } from 'svelte'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw } from '@polymorph/conformance/treemap'

import { render } from '../mount'
import { svelteAdapter } from '../conformance/svelte'
import Treemap from './Treemap.svelte'
import { states } from './treemap.states.svelte'

/**
 * Treemap in the Svelte shell (`design/components/treemap.md`): the tiles, the
 * labels that fit, the keys, the pointer, the twin and the direction, as
 * `@polymorph/conformance/treemap` states them for every web shell. The drawing
 * is the engine's `treemapModel`, which every renderer draws.
 */
treemapLaw({
  shell: 'Svelte',
  async mount(props) {
    const mounted = await render(Treemap, props)
    await tick()
    return mounted
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Svelte', member: 'Treemap', entries: states.entries, adapter: svelteAdapter })
