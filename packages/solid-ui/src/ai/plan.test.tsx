import { createSignal } from 'solid-js'

import { planLaw } from '@polymorph/conformance/plan'

import { mount } from '../mount'
import Plan from './Plan'

/**
 * What a Plan says, and when its status line changes, in the Solid shell
 * (`design/components/plan.md`, A11y), as `@polymorph/conformance/plan` states
 * it for every web shell.
 */
planLaw({
  shell: 'Solid',
  async mount(props) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <Plan label="Plan for this run" steps={held().steps} messages={held().messages} />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
