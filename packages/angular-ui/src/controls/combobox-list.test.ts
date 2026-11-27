import { comboboxListLaw } from '@polymorph/conformance/combobox-list'

import { mountComponent } from '../mount'
import { Combobox } from './Combobox'

/**
 * The name of a Combobox's list in the Angular shell, whichever way the field
 * is named, by default and in a host's word from `messages.list`, as
 * `@polymorph/conformance/combobox-list` states it for every web shell.
 */
comboboxListLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(Combobox, { ...props }),
})
