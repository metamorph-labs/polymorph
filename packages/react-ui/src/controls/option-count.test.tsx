import { render } from '@testing-library/react'
import { createElement, type ComponentType } from 'react'

import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'
import { PhoneInput } from './PhoneInput'

/**
 * What Combobox's, MultiSelect's and PhoneInput's open lists say of how many
 * options they show, one in the singular, as
 * `@polymorph/conformance/option-count` states it for every web shell.
 */
const MEMBERS: Record<OptionCountMember, ComponentType<never>> = {
  Combobox,
  MultiSelect,
  PhoneInput,
}

optionCountLaw({
  shell: 'React',
  async mount(member, props) {
    render(createElement(MEMBERS[member] as ComponentType<Record<string, unknown>>, props))
  },
})
