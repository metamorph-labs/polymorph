import { tick } from 'svelte'

import { inlineEditLaw } from '@polymorph/conformance/inline-edit'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import InlineEdit from './InlineEdit.svelte'

/**
 * InlineEdit's opening, saving, cancelling, a save that waits and the row's
 * height, in the Svelte shell (`design/components/inline-edit.md`), as
 * `@polymorph/conformance/inline-edit` states them for every web shell.
 */
inlineEditLaw({
  shell: 'Svelte',
  async mount({ props, defaultEditing, onCommit, onEditingChange }) {
    const held = live({
      label: 'Project name',
      defaultEditing,
      onCommit,
      onEditingChange,
      ...props,
    })
    await render(InlineEdit, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
