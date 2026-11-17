import { tick } from 'svelte'

import { modeSwitchLaw } from '@polymorph/conformance/mode-switch'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import ModeSwitch from './ModeSwitch.svelte'

/**
 * What a ModeSwitch shows and what a choice does, in the Svelte shell
 * (`design/components/mode-switch.md`, Behaviour), as
 * `@polymorph/conformance/mode-switch` states it for every web shell.
 */
modeSwitchLaw({
  shell: 'Svelte',
  async mount({ label, props, messages, onChange }) {
    const held = live({ label, messages, onChange, ...props })
    await render(ModeSwitch, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
