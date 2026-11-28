import { optionCountLaw, type OptionCountMember } from '@polymorph/conformance/option-count'

import { mountElement } from '../mount'
import './Combobox'
import './MultiSelect'
import './PhoneInput'

/**
 * What Combobox's, MultiSelect's and PhoneInput's open lists say of how many
 * options they show, one in the singular, as
 * `@polymorph/conformance/option-count` states it for every web shell.
 */
const TAGS: Record<OptionCountMember, string> = {
  Combobox: 'poly-combobox',
  MultiSelect: 'poly-multi-select',
  PhoneInput: 'poly-phone-input',
}

optionCountLaw({
  shell: 'Elements',
  mount: (member, props) => mountElement(TAGS[member], props),
})
