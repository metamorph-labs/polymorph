import { tick } from 'svelte'

import { planLaw } from '@polymorph/conformance/plan'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import Plan from './Plan.svelte'

/**
 * What a Plan says, and when its status line changes, in the Svelte shell
 * (`design/components/plan.md`, A11y), as `@polymorph/conformance/plan` states
 * it for every web shell.
 */
planLaw({
  shell: 'Svelte',
  async mount(props) {
    const held = live({ label: 'Plan for this run', ...props })
    await render(Plan, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
