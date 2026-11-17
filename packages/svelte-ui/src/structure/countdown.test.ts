import { countdownLaw } from '@polymorph/conformance/countdown'

import { render } from '../mount'
import Countdown from './Countdown.svelte'

/**
 * What a Countdown draws, when it changes and what it reports, in the Svelte
 * shell (`design/components/countdown.md`), as
 * `@polymorph/conformance/countdown` states it for every web shell.
 */
countdownLaw({
  shell: 'Svelte',
  mount: (props) => render(Countdown, props),
})
