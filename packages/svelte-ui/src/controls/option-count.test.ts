import type { Component } from 'svelte'

import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'

import { render } from '../mount'
import Combobox from './Combobox.svelte'
import MultiSelect from './MultiSelect.svelte'
import PhoneInput from './PhoneInput.svelte'

/**
 * What Combobox's, MultiSelect's and PhoneInput's open lists say of how many
 * options they show, one in the singular, as
 * `@polymorph/conformance/option-count` states it for every web shell.
 */
const MEMBERS = { Combobox, MultiSelect, PhoneInput } as unknown as Record<
  OptionCountMember,
  Component<Record<string, unknown>>
>

optionCountLaw({
  shell: 'Svelte',
  mount: (member, props) => render(MEMBERS[member], props),
})
