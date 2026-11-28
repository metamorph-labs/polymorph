import type { Component } from 'svelte'

import { selectListLaw } from '@polymorph/conformance/select-list'

import { render } from '../mount'
import FieldHarness from '../testing/FieldHarness.svelte'
import Select from './Select.svelte'

/**
 * The name of Select's list in the Svelte shell, which is the field's own, as
 * `@polymorph/conformance/select-list` states it for every web shell.
 */
const control = Select as unknown as Component<Record<string, unknown>>

selectListLaw({
  shell: 'Svelte',
  mount: (props) => render(Select, props),
  mountInField: ({ label, required }, props) =>
    render(FieldHarness, { label, required, control, field: { ...props } }),
})
