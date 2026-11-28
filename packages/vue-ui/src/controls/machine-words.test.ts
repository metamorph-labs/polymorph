import { h, type Component } from 'vue'

import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'

import { mount } from '../mount'
import ColorInput from './ColorInput.vue'
import Combobox from './Combobox.vue'
import MultiSelect from './MultiSelect.vue'
import NumberInput from './NumberInput.vue'

/**
 * The words a Zag machine wrote, in the member's own: NumberInput's steppers
 * and field, ColorInput's sliders, and the announcement Combobox and
 * MultiSelect do without, as `@polymorph/conformance/machine-words` states
 * them for every web shell.
 */
const MEMBERS: Record<MachineWordsMember, Component> = {
  NumberInput,
  ColorInput,
  Combobox,
  MultiSelect,
}

machineWordsLaw({
  shell: 'Vue',
  mount: (member, props) => mount(() => h(MEMBERS[member], props)),
})
