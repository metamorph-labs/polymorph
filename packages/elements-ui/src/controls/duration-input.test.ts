import { durationInputLaw } from '@polymorph/conformance/duration-input'

import { mountElement } from '../mount'
import './DurationInput'

/**
 * The seconds a DurationInput reports and when, its carry, its refusal and its
 * bounds, as `@polymorph/conformance/duration-input` states them for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
durationInputLaw({
  shell: 'Elements',
  async mount({ props, onChange }) {
    const { set } = await mountElement(
      'poly-duration-input',
      { locale: 'en-US', 'aria-label': 'Inactivity lifetime', ...props, onChange },
      { owns: ['value'] },
    )
    return { set }
  },
})
