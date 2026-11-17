import { progressRingLaw } from '@polymorph/conformance/progress-ring'

import { mountElement } from '../mount'
import './Progress'

/**
 * Progress's bar and ring, as `@polymorph/conformance/progress-ring` states them
 * for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
progressRingLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-progress', props),
})
