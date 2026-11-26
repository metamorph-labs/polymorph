import { selectValueLaw, SELECT_VALUE_LAW_OPTIONS } from '@polymorph/conformance/select-value'

import { mountElement } from '../mount'
import './Select'

/**
 * The value the page holds, `null` for nothing chosen, as
 * `@polymorph/conformance/select-value` states it for every shell. A value the
 * law holds is the page's: the element's change event for it is cancelled, as
 * a page that owns a value cancels it.
 */
selectValueLaw({
  shell: 'Elements',
  async mount({ value, placeholder, emptyOption, name, onChange }) {
    const { set } = await mountElement(
      'poly-select',
      {
        'aria-label': 'Priority',
        options: SELECT_VALUE_LAW_OPTIONS,
        ...(placeholder === undefined ? {} : { placeholder }),
        ...(emptyOption === undefined ? {} : { emptyOption }),
        name,
        value,
        onChange,
      },
      { owns: ['value'] },
    )
    return { set: (next) => set({ value: next }) }
  },
})
