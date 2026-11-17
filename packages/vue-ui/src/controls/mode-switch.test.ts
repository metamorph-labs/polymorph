import { h, nextTick, reactive } from 'vue'

import { modeSwitchLaw, type ModeSwitchLawProps } from '@polymorph/conformance/mode-switch'

import { mount } from '../mount'
import ModeSwitch from './ModeSwitch.vue'

/**
 * What a ModeSwitch shows and what a choice does, in the Vue shell
 * (`design/components/mode-switch.md`, Behaviour), as
 * `@polymorph/conformance/mode-switch` states it for every web shell.
 */
modeSwitchLaw({
  shell: 'Vue',
  async mount({ label, props, messages, onChange }) {
    const held = reactive<ModeSwitchLawProps>({ ...props })
    await mount(() =>
      h(ModeSwitch, {
        label,
        messages,
        value: held.value,
        disabled: held.disabled,
        onChange,
      }),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
