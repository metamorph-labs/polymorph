import { multiSelectListLaw } from '@polymorph/conformance/multi-select-list'

import { mount } from '../mount'
import FormField from './FormField'
import MultiSelect from './MultiSelect'

/**
 * The name of MultiSelect's list in the Solid shell, which is the field's own,
 * as `@polymorph/conformance/multi-select-list` states it for every web shell.
 */
multiSelectListLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <MultiSelect {...props} />),
  mountInField: ({ label, required }, props) =>
    mount(() => (
      <FormField label={label} required={required}>
        <MultiSelect {...props} />
      </FormField>
    )),
})
