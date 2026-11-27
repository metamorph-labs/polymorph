import { h } from 'vue'

import { comboboxListLaw } from '@polymorph/conformance/combobox-list'

import { mount } from '../mount'
import Combobox from './Combobox.vue'

/**
 * The name of a Combobox's list in the Vue shell, whichever way the field is
 * named, by default and in a host's word from `messages.list`, as
 * `@polymorph/conformance/combobox-list` states it for every web shell.
 */
comboboxListLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Combobox, props)),
})
