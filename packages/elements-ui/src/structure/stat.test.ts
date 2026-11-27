import { statLaw } from '@polymorph/conformance/stat'

import { mountElement } from '../mount'
import './Stat'

/**
 * What a Stat's delta says, by default and in a host's words from
 * `deltaLabel`, as `@polymorph/conformance/stat` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
statLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-stat', props),
})
