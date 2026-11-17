import { createSignal } from 'solid-js'

import { modeSwitchLaw } from '@polymorph/conformance/mode-switch'

import { mount } from '../mount'
import ModeSwitch from './ModeSwitch'

/**
 * What a ModeSwitch shows and what a choice does, in the Solid shell
 * (`design/components/mode-switch.md`, Behaviour), as
 * `@polymorph/conformance/mode-switch` states it for every web shell.
 */
modeSwitchLaw({
  shell: 'Solid',
  async mount({ label, props, messages, onChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <ModeSwitch
        label={label}
        messages={messages}
        value={held().value}
        disabled={held().disabled}
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
