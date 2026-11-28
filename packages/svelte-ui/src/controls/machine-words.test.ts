import type { Component } from 'svelte'

import { machineWordsLaw, type MachineWordsMember } from '@polymorph/conformance/machine-words'

import { render } from '../mount'
import ColorInput from './ColorInput.svelte'
import Combobox from './Combobox.svelte'
import MultiSelect from './MultiSelect.svelte'
import NumberInput from './NumberInput.svelte'

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
  shell: 'Svelte',
  mount: (member, props) => render(MEMBERS[member], props),
})
