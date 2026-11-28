import { h } from 'vue'

import { selectListLaw } from '@polymorph/conformance/select-list'

import { mount } from '../mount'
import FormField from './FormField.vue'
import Select from './Select.vue'

/**
 * The name of Select's list in the Vue shell, which is the field's own, as
 * `@polymorph/conformance/select-list` states it for every web shell.
 */
selectListLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(Select, props)),
  mountInField: ({ label, required }, props) =>
    mount(() => h(FormField, { label, required }, { default: () => [h(Select, props)] })),
})
