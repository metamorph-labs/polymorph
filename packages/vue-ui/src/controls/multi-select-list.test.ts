import { h } from 'vue'

import { multiSelectListLaw } from '@polymorph/conformance/multi-select-list'

import { mount } from '../mount'
import FormField from './FormField.vue'
import MultiSelect from './MultiSelect.vue'

/**
 * The name of MultiSelect's list in the Vue shell, which is the field's own,
 * as `@polymorph/conformance/multi-select-list` states it for every web shell.
 */
multiSelectListLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(MultiSelect, props)),
  mountInField: ({ label, required }, props) =>
    mount(() => h(FormField, { label, required }, { default: () => [h(MultiSelect, props)] })),
})
