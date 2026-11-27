import { statLaw } from '@polymorph/conformance/stat'

import { render } from '../mount'
import Stat from './Stat.svelte'

/**
 * What a Stat's delta says in the Svelte shell (`design/components/stat.md`),
 * as `@polymorph/conformance/stat` states it for every web shell.
 */
statLaw({
  shell: 'Svelte',
  mount: (props) => render(Stat, props),
})
