import { create } from '@polymorph/elements'
import { multiSelectListLaw } from '@polymorph/conformance/multi-select-list'

import { mountElement } from '../mount'
import './FormField'
import './MultiSelect'

/**
 * The name of MultiSelect's list, which is the field's own, as
 * `@polymorph/conformance/multi-select-list` states it for every shell. The
 * FormField case is the markup a page writes: the MultiSelect inside the
 * field's element.
 */
multiSelectListLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-multi-select', props),
  mountInField: ({ label, required }, props) =>
    mountElement(
      'poly-form-field',
      { label, required },
      { children: [create('poly-multi-select', props)] },
    ),
})
