import { FORM_PAGE_LEADING, formPageRowLaw } from '@polymorph/conformance/form-page-row'

import { mount } from '../mount'
import { states } from './form-page.states'

/**
 * FormPage's actions row with a leading action, at the row's start in either
 * direction and wrapping at a narrow width, as `@polymorph/conformance/form-page-row`
 * states it for every web shell.
 */
formPageRowLaw({
  shell: 'Angular',
  async mount() {
    return mount(states, FORM_PAGE_LEADING)
  },
})
