import { h, type Component } from 'vue'

import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'

import { mount } from '../mount'
import Combobox from './Combobox.vue'
import MultiSelect from './MultiSelect.vue'
import PhoneInput from './PhoneInput.vue'

/**
 * What Combobox's, MultiSelect's and PhoneInput's open lists say of how many
 * options they show, one in the singular, as
 * `@polymorph/conformance/option-count` states it for every web shell.
 */
const MEMBERS: Record<OptionCountMember, Component> = { Combobox, MultiSelect, PhoneInput }

optionCountLaw({
  shell: 'Vue',
  mount: (member, props) => mount(() => h(MEMBERS[member], props)),
})
