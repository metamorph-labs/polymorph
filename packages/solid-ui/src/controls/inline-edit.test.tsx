import { createSignal } from 'solid-js'

import { inlineEditLaw } from '@polymorph/conformance/inline-edit'

import { mount } from '../mount'
import InlineEdit from './InlineEdit'

/**
 * InlineEdit's opening, saving, cancelling, a save that waits and the row's
 * height, in the Solid shell (`design/components/inline-edit.md`), as
 * `@polymorph/conformance/inline-edit` states them for every web shell.
 */
inlineEditLaw({
  shell: 'Solid',
  async mount({ props, defaultEditing, onCommit, onEditingChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <InlineEdit
        label="Project name"
        defaultEditing={defaultEditing}
        value={held().value}
        editing={held().editing}
        pending={held().pending}
        error={held().error}
        required={held().required}
        size={held().size}
        onCommit={onCommit}
        onEditingChange={onEditingChange}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
