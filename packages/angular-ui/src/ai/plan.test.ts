import { Component, signal } from '@angular/core'

import { planLaw, type PlanLawProps } from '@polymorph/conformance/plan'

import { mountComponent } from '../mount'
import { Plan } from './Plan'

/**
 * What a Plan says, and when its status line changes, in the Angular shell
 * (`design/components/plan.md`, A11y), as `@polymorph/conformance/plan` states
 * it for every web shell.
 */

/** The application around the Plan: it holds the props the law sets. */
@Component({
  selector: 'test-held-plan',
  imports: [Plan],
  template: `<pm-plan
    label="Plan for this run"
    [steps]="held().steps"
    [messages]="held().messages"
  />`,
})
class Held {
  readonly held = signal<PlanLawProps>({ steps: [] })
}

planLaw({
  shell: 'Angular',
  async mount(props) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(props)
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
