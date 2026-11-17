import { countdownLaw } from '@polymorph/conformance/countdown'

import { mount } from '../mount'
import Countdown from './Countdown'

/**
 * What a Countdown draws, when it changes and what it reports, in the Solid
 * shell (`design/components/countdown.md`), as
 * `@polymorph/conformance/countdown` states it for every web shell.
 */
countdownLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Countdown {...props} />),
})
