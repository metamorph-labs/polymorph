import { tourLaw } from '@polymorph/conformance/tour'

import { render } from '../mount'
import TourHarness from '../testing/TourHarness.svelte'

/**
 * Where focus goes, what a step says and reports, and where its panel is drawn,
 * in the Svelte shell (`design/components/tour.md`), as
 * `@polymorph/conformance/tour` states them for every web shell.
 */
tourLaw({
  shell: 'Svelte',
  async mount(props) {
    await render(TourHarness, props)
  },
})
