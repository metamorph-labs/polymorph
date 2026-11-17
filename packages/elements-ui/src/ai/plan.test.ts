import { planLaw } from '@polymorph/conformance/plan'

import { mountElement } from '../mount'
import './Plan'

/**
 * What a Plan's steps read as, which step its status line names and that the
 * line changes only when the front of the run does, as
 * `@polymorph/conformance/plan` states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
planLaw({
  shell: 'Elements',
  async mount(props) {
    const { set } = await mountElement('poly-plan', { label: 'Plan for this run', ...props })
    return { set }
  },
})
