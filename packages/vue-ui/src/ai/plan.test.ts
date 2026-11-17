import { h, nextTick, reactive } from 'vue'

import { planLaw, type PlanLawProps } from '@polymorph/conformance/plan'

import { mount } from '../mount'
import Plan from './Plan.vue'

/**
 * What a Plan says, and when its status line changes, in the Vue shell
 * (`design/components/plan.md`, A11y), as `@polymorph/conformance/plan` states
 * it for every web shell.
 */
planLaw({
  shell: 'Vue',
  async mount(props) {
    const held = reactive<PlanLawProps>({ ...props })
    await mount(() =>
      h(Plan, { label: 'Plan for this run', steps: held.steps, messages: held.messages }),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
