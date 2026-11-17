import { inlineEditLaw } from '@polymorph/conformance/inline-edit'

import { mountElement } from '../mount'
import './InlineEdit'

/**
 * InlineEdit's opening, saving and cancelling, a save that waits and the row's
 * height in both forms, as `@polymorph/conformance/inline-edit` states them for
 * every shell. An `editing` the law holds is the page's: the element's change
 * event for it is cancelled.
 */
inlineEditLaw({
  shell: 'Elements',
  async mount({ props, defaultEditing, onCommit, onEditingChange }) {
    const { set } = await mountElement(
      'poly-inline-edit',
      { label: 'Project name', defaultEditing, ...props, onCommit, onEditingChange },
      { owns: ['editing'] },
    )
    return { set }
  },
})
