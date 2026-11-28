import type { Component } from 'svelte'

import { multiSelectListLaw } from '@polymorph/conformance/multi-select-list'

import { render } from '../mount'
import FieldHarness from '../testing/FieldHarness.svelte'
import MultiSelect from './MultiSelect.svelte'

/**
 * The name of MultiSelect's list in the Svelte shell, which is the field's own,
 * as `@polymorph/conformance/multi-select-list` states it for every web shell.
 */
const control = MultiSelect as unknown as Component<Record<string, unknown>>

multiSelectListLaw({
  shell: 'Svelte',
  mount: (props) => render(MultiSelect, props),
  mountInField: ({ label, required }, props) =>
    render(FieldHarness, { label, required, control, field: { ...props } }),
})
