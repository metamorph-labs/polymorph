import { createSignal } from 'solid-js'

import { phoneInputLaw } from '@polymorph/conformance/phone-input'

import { mount } from '../mount'
import PhoneInput from './PhoneInput'

/**
 * What a PhoneInput reports, in the Solid shell (`design/components/phone-input.md`), as
 * `@polymorph/conformance/phone-input` states it for every web shell.
 */
phoneInputLaw({
  shell: 'Solid',
  async mount({ props, onChange }) {
    const [value, setValue] = createSignal(props.value)
    await mount(() => (
      <PhoneInput
        value={value()}
        defaultValue={props.defaultValue}
        defaultCountry={props.defaultCountry}
        countries={props.countries}
        name={props.name}
        locale={props.locale}
        aria-label={props['aria-label']}
        onChange={onChange}
      />
    ))
    return {
      set(next) {
        setValue(next)
      },
    }
  },
})
