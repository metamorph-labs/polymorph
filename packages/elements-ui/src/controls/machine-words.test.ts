import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'

import { mountElement } from '../mount'
import './ColorInput'
import './Combobox'
import './MultiSelect'
import './NumberInput'

/**
 * The words a Zag machine wrote, in the member's own: NumberInput's steppers
 * and field, ColorInput's sliders, and the announcement Combobox and
 * MultiSelect do without, as `@polymorph/conformance/machine-words` states
 * them for every web shell.
 */
const TAGS: Record<MachineWordsMember, string> = {
  NumberInput: 'poly-number-input',
  ColorInput: 'poly-color-input',
  Combobox: 'poly-combobox',
  MultiSelect: 'poly-multi-select',
}

machineWordsLaw({
  shell: 'Elements',
  mount: (member, props) => mountElement(TAGS[member], props),
})
