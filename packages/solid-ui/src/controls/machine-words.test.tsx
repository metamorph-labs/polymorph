import type { Component } from 'solid-js'

import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'

import { mount } from '../mount'
import ColorInput from './ColorInput'
import Combobox from './Combobox'
import MultiSelect from './MultiSelect'
import NumberInput from './NumberInput'

/**
 * The words a Zag machine wrote, in the member's own: NumberInput's steppers
 * and field, ColorInput's sliders, and the announcement Combobox and
 * MultiSelect do without, as `@polymorph/conformance/machine-words` states
 * them for every web shell.
 */
const MEMBERS = { NumberInput, ColorInput, Combobox, MultiSelect } as unknown as Record<
  MachineWordsMember,
  Component<Record<string, unknown>>
>

machineWordsLaw({
  shell: 'Solid',
  mount: (member, props) => {
    const Member = MEMBERS[member]
    return mount(() => <Member {...props} />)
  },
})
