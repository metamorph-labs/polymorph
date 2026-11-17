import { highlightLaw } from '@polymorph/conformance/highlight'

import { mountElement } from '../mount'
import './Highlight'

/**
 * Which characters a Highlight marks and that its text is read once, as
 * `@polymorph/conformance/highlight` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
highlightLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-highlight', props),
})
