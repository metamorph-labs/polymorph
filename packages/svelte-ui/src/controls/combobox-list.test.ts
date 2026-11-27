import { comboboxListLaw } from '@polymorph/conformance/combobox-list'

import { render } from '../mount'
import Combobox from './Combobox.svelte'

/**
 * The name of a Combobox's list in the Svelte shell, whichever way the field is
 * named, by default and in a host's word from `messages.list`, as
 * `@polymorph/conformance/combobox-list` states it for every web shell.
 */
comboboxListLaw({
  shell: 'Svelte',
  mount: (props) => render(Combobox, props),
})
