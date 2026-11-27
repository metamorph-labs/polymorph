import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'

import { mountComponent } from '../mount'
import { Combobox } from './Combobox'
import { MultiSelect } from './MultiSelect'
import { PhoneInput } from './PhoneInput'

/**
 * What Combobox's, MultiSelect's and PhoneInput's open lists say of how many
 * options they show, one in the singular, as
 * `@polymorph/conformance/option-count` states it for every web shell.
 */
const MEMBERS = { Combobox, MultiSelect, PhoneInput }

optionCountLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (member: OptionCountMember, props) => mountComponent(MEMBERS[member], { ...props }),
})
