import { meterLaw } from '@polymorph/conformance/meter'

import { render } from '../mount'
import Meter from './Meter.svelte'

/**
 * What a Meter says and draws in the Svelte shell
 * (`design/components/meter.md`), as `@polymorph/conformance/meter` states it
 * for every web shell.
 */
meterLaw({
  shell: 'Svelte',
  mount: (props) => render(Meter, props),
})
