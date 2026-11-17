import { phoneInputLaw } from '@polymorph/conformance/phone-input'

import { mountElement } from '../mount'
import './PhoneInput'

/**
 * What a PhoneInput reports after typing, a commit, a country chosen and a paste,
 * as `@polymorph/conformance/phone-input` states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
phoneInputLaw({
  shell: 'Elements',
  async mount({ props, onChange }) {
    const { set } = await mountElement(
      'poly-phone-input',
      { ...props, onChange },
      { owns: ['value'] },
    )
    return { set: (value) => set({ value }) }
  },
})
