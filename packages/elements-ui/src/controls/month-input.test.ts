import { monthInputLaw } from '@polymorph/conformance/month-input'

import { mountElement } from '../mount'
import './MonthInput'

/**
 * What a MonthInput reports and how its segments take keys, as
 * `@polymorph/conformance/month-input` states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
monthInputLaw({
  shell: 'Elements',
  async mount({ props, defaultValue, min, max, locale, readOnly, name, onChange }) {
    const { set } = await mountElement(
      'poly-month-input',
      {
        'aria-label': 'Expires',
        defaultValue,
        min,
        max,
        locale,
        readOnly,
        name,
        ...props,
        onChange,
      },
      { owns: ['value'] },
    )
    return { set }
  },
})
