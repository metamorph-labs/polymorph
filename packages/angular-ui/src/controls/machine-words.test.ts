import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'

import { mountComponent } from '../mount'
import { ColorInput } from './ColorInput'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'
import { NumberInput } from './NumberInput'

/**
 * The words a Zag machine wrote, in the member's own: NumberInput's steppers
 * and field, ColorInput's sliders, and the announcement Combobox and
 * MultiSelect do without, as `@polymorph/conformance/machine-words` states
 * them for every web shell.
 */
const MEMBERS = { NumberInput, ColorInput, Combobox, MultiSelect }

machineWordsLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (member: MachineWordsMember, props) => mountComponent(MEMBERS[member], { ...props }),
})
