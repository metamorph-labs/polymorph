import { selectListLaw } from '@polymorph/conformance/select-list'

import { mount } from '../mount'
import FormField from './FormField'
import Select from './Select'

/**
 * The name of Select's list in the Solid shell, which is the field's own, as
 * `@polymorph/conformance/select-list` states it for every web shell.
 */
selectListLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Select {...props} />),
  mountInField: ({ label, required }, props) =>
    mount(() => (
      <FormField label={label} required={required}>
        <Select {...props} />
      </FormField>
    )),
})
