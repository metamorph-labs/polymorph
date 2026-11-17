import { tick } from 'svelte'

import { durationInputLaw } from '@polymorph/conformance/duration-input'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import DurationInput from './DurationInput.svelte'

/**
 * What DurationInput reports and draws in the Svelte shell
 * (`design/components/duration-input.md`), as `@polymorph/conformance/duration-input`
 * states it for every web shell.
 */
durationInputLaw({
  shell: 'Svelte',
  async mount({ props, onChange }) {
    const held = live({
      locale: 'en-US',
      'aria-label': 'Inactivity lifetime',
      onChange,
      ...props,
    })
    await render(DurationInput, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
