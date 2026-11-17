import { createSignal } from 'solid-js'

import { monthInputLaw } from '@polymorph/conformance/month-input'

import { mount } from '../mount'
import MonthInput from './MonthInput'

/**
 * What a MonthInput reports and how its segments take keys, in the Solid shell
 * (`design/components/month-input.md`), as `@polymorph/conformance/month-input`
 * states them for every web shell.
 */
monthInputLaw({
  shell: 'Solid',
  async mount({ props, defaultValue, min, max, locale, readOnly, name, onChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <MonthInput
        aria-label="Expires"
        defaultValue={defaultValue}
        min={min}
        max={max}
        locale={locale}
        readOnly={readOnly}
        name={name}
        value={held().value}
        onChange={onChange}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
