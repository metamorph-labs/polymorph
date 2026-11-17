import { diffLaw } from '@polymorph/conformance/diff'

import { mountElement } from '../mount'
import './Diff'

/**
 * What a Diff says for each kind of change, its rows and where focus is when a
 * collapsed run opens, as `@polymorph/conformance/diff` states it for every shell.
 * The element is made with the law's props, as a page's script makes one.
 */
diffLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-diff', props),
})
