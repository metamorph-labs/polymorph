import type { Component } from 'solid-js'

import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'

import { mount } from '../mount'
import Combobox from './Combobox'
import MultiSelect from './MultiSelect'
import PhoneInput from './PhoneInput'

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
  shell: 'Solid',
  mount: (member, props) => {
    const Member = MEMBERS[member]
    return mount(() => <Member {...props} />)
  },
})
