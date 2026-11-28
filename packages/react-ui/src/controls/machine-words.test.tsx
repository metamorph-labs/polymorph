import { render } from '@testing-library/react'
import { createElement, type ComponentType } from 'react'

import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'
import { ColorInput } from './ColorInput'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'
import { NumberInput } from './NumberInput'

/**
 * The host's words reach the names and value texts React Aria gives
 * NumberInput's steppers and ColorInput's sliders, as
 * `@polymorph/conformance/machine-words` states them for every web shell.
 * React's defaults are React Aria's, which it says in the page's locale.
 */
const MEMBERS: Record<MachineWordsMember, ComponentType<never>> = {
  NumberInput,
  ColorInput,
  Combobox,
  MultiSelect,
}

machineWordsLaw({
  shell: 'React',
  defaultsFromReactAria: true,
  async mount(member, props) {
    render(createElement(MEMBERS[member] as ComponentType<Record<string, unknown>>, props))
  },
})
