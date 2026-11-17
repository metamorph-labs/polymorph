import { tick } from 'svelte'

import { recordButtonLaw } from '@polymorph/conformance/record-button'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import RecordButton from './RecordButton.svelte'

/**
 * What a RecordButton reports and draws, in the Svelte shell
 * (`design/components/record-button.md`, Behaviour), as
 * `@polymorph/conformance/record-button` states it for every web shell.
 */
recordButtonLaw({
  shell: 'Svelte',
  async mount(initial) {
    const props = live({ ...initial })
    await render(RecordButton, props)
    return {
      set(next) {
        Object.assign(props, next)
        return tick()
      },
    }
  },
})
