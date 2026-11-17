import { h, nextTick, reactive } from 'vue'

import { phoneInputLaw, type PhoneInputLawProps } from '@polymorph/conformance/phone-input'

import { mount } from '../mount'
import PhoneInput from './PhoneInput.vue'

/**
 * What a PhoneInput reports, in the Vue shell (`design/components/phone-input.md`), as
 * `@polymorph/conformance/phone-input` states it for every web shell.
 */
phoneInputLaw({
  shell: 'Vue',
  async mount({ props, onChange }) {
    const held = reactive<PhoneInputLawProps>({ ...props })
    await mount(() => h(PhoneInput, { ...held, onChange }))
    return {
      set(value) {
        held.value = value
        return nextTick()
      },
    }
  },
})
