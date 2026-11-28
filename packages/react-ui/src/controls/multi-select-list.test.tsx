import { render } from '@testing-library/react'

import { multiSelectListLaw } from '@polymorph/conformance/multi-select-list'
import { FormField } from './FormField'
import { MultiSelect } from './MultiSelect'

/**
 * The name of MultiSelect's list, which is the field's own: its
 * `aria-labelledby`, else its `aria-label`, else the labels that name it, as
 * `@polymorph/conformance/multi-select-list` states it for every web shell.
 */
multiSelectListLaw({
  shell: 'React',
  async mount(props) {
    render(<MultiSelect {...props} />)
  },
  async mountInField({ label, required }, props) {
    render(
      <FormField label={label} required={required}>
        <MultiSelect {...props} />
      </FormField>,
    )
  },
})
