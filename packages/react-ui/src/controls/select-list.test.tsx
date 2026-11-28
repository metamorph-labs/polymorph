import { render } from '@testing-library/react'

import { selectListLaw } from '@polymorph/conformance/select-list'
import { FormField } from './FormField'
import { Select } from './Select'

/**
 * The name of Select's list, in Radix's popper and in the sheet, which is the
 * field's own: its `aria-labelledby`, else its `aria-label`, else the labels
 * that name the trigger, as `@polymorph/conformance/select-list` states it for
 * every web shell.
 */
selectListLaw({
  shell: 'React',
  async mount(props) {
    render(<Select {...props} />)
  },
  async mountInField({ label, required }, props) {
    render(
      <FormField label={label} required={required}>
        <Select {...props} />
      </FormField>,
    )
  },
})
