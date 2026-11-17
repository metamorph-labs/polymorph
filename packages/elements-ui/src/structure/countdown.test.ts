import { countdownLaw } from '@polymorph/conformance/countdown'

import { mountElement } from '../mount'
import './Countdown'

/**
 * What a Countdown draws as its time passes, when it reports its end and what it
 * announces, as `@polymorph/conformance/countdown` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
countdownLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-countdown', props),
})
