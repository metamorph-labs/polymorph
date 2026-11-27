import { comboboxListLaw } from '@polymorph/conformance/combobox-list'

import { mount } from '../mount'
import Combobox from './Combobox'

/**
 * The name of a Combobox's list in the Solid shell, whichever way the field is
 * named, by default and in a host's word from `messages.list`, as
 * `@polymorph/conformance/combobox-list` states it for every web shell.
 */
comboboxListLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Combobox {...props} />),
})
