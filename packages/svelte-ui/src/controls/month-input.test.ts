import { tick } from 'svelte'

import { monthInputLaw } from '@polymorph/conformance/month-input'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import MonthInput from './MonthInput.svelte'

/**
 * What a MonthInput reports and how its segments take keys, in the Svelte
 * shell (`design/components/month-input.md`), as
 * `@polymorph/conformance/month-input` states them for every web shell.
 */
monthInputLaw({
  shell: 'Svelte',
  async mount({ props, defaultValue, min, max, locale, readOnly, name, onChange }) {
    const held = live({
      'aria-label': 'Expires',
      defaultValue,
      min,
      max,
      locale,
      readOnly,
      name,
      onChange,
      ...props,
    })
    await render(MonthInput, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
