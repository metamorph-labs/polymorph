import { meterLaw } from '@polymorph/conformance/meter'

import { mountElement } from '../mount'
import './Meter'

/**
 * The tone a Meter picks at each threshold, its clamping and what it says, as
 * `@polymorph/conformance/meter` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
meterLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-meter', props),
})
