import { tick } from 'svelte'

import { phoneInputLaw } from '@polymorph/conformance/phone-input'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import PhoneInput from './PhoneInput.svelte'

/**
 * What a PhoneInput reports, in the Svelte shell (`design/components/phone-input.md`), as
 * `@polymorph/conformance/phone-input` states it for every web shell.
 */
phoneInputLaw({
  shell: 'Svelte',
  async mount({ props, onChange }) {
    const held = live({ ...props, onChange })
    await render(PhoneInput, held)
    return {
      set(value) {
        held.value = value
        return tick()
      },
    }
  },
})
