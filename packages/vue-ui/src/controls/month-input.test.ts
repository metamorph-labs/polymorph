import { h, nextTick, reactive } from 'vue'

import { monthInputLaw, type MonthInputLawProps } from '@polymorph/conformance/month-input'

import { mount } from '../mount'
import MonthInput from './MonthInput.vue'

/**
 * What a MonthInput reports and how its segments take keys, in the Vue shell
 * (`design/components/month-input.md`), as `@polymorph/conformance/month-input`
 * states them for every web shell.
 */
monthInputLaw({
  shell: 'Vue',
  async mount({ props, defaultValue, min, max, locale, readOnly, name, onChange }) {
    const held = reactive<MonthInputLawProps>({ ...props })
    await mount(() =>
      h(MonthInput, {
        ariaLabel: 'Expires',
        defaultValue,
        min,
        max,
        locale,
        readOnly,
        name,
        value: held.value,
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
