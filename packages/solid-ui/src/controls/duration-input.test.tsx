import { createSignal } from 'solid-js'

import { durationInputLaw } from '@polymorph/conformance/duration-input'

import { mount } from '../mount'
import DurationInput from './DurationInput'

/**
 * What DurationInput reports and draws in the Solid shell
 * (`design/components/duration-input.md`), as `@polymorph/conformance/duration-input`
 * states it for every web shell.
 */
durationInputLaw({
  shell: 'Solid',
  async mount({ props, onChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <DurationInput
        locale="en-US"
        aria-label="Inactivity lifetime"
        onChange={onChange}
        value={held().value}
        defaultValue={held().defaultValue}
        units={held().units}
        min={held().min}
        max={held().max}
        readOnly={held().readOnly}
        name={held().name}
        messages={held().messages}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
