import { h, nextTick, reactive } from 'vue'

import { durationInputLaw, type DurationInputLawProps } from '@polymorph/conformance/duration-input'

import { mount } from '../mount'
import DurationInput from './DurationInput.vue'

/**
 * What DurationInput reports and draws in the Vue shell
 * (`design/components/duration-input.md`), as `@polymorph/conformance/duration-input`
 * states it for every web shell.
 */
durationInputLaw({
  shell: 'Vue',
  async mount({ props, onChange }) {
    const held = reactive<DurationInputLawProps>({ ...props })
    await mount(() =>
      h(DurationInput, {
        locale: 'en-US',
        ariaLabel: 'Inactivity lifetime',
        onChange,
        ...held,
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
