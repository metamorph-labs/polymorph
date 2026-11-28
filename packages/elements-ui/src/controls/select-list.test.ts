import { create } from '@polymorph/elements'
import { selectListLaw } from '@polymorph/conformance/select-list'

import { mountElement } from '../mount'
import './FormField'
import './Select'

/**
 * The name of Select's list, which is the field's own, as
 * `@polymorph/conformance/select-list` states it for every shell. The
 * FormField case is the markup a page writes: the Select inside the field's
 * element.
 */
selectListLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-select', props),
  mountInField: ({ label, required }, props) =>
    mountElement(
      'poly-form-field',
      { label, required },
      { children: [create('poly-select', props)] },
    ),
})
