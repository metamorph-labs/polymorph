import { comboboxListLaw } from '@polymorph/conformance/combobox-list'

import { mountElement } from '../mount'
import './Combobox'

/**
 * The name of a Combobox's list, whichever way the field is named, by default
 * and in a host's word from `messages.list`, as
 * `@polymorph/conformance/combobox-list` states it for every shell. The
 * element is made with the law's props, as a page's script makes one.
 */
comboboxListLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-combobox', props),
})
