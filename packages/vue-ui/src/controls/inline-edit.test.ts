import { h, nextTick, reactive } from 'vue'

import { inlineEditLaw, type InlineEditLawProps } from '@polymorph/conformance/inline-edit'

import { mount } from '../mount'
import InlineEdit from './InlineEdit.vue'

/**
 * InlineEdit's opening, saving, cancelling, a save that waits and the row's
 * height, in the Vue shell (`design/components/inline-edit.md`), as
 * `@polymorph/conformance/inline-edit` states them for every web shell.
 */
inlineEditLaw({
  shell: 'Vue',
  async mount({ props, defaultEditing, onCommit, onEditingChange }) {
    const held = reactive<InlineEditLawProps>({ ...props })
    await mount(() =>
      h(InlineEdit, {
        label: 'Project name',
        defaultEditing,
        value: held.value,
        editing: held.editing,
        pending: held.pending,
        error: held.error,
        required: held.required,
        size: held.size,
        onCommit,
        onEditingChange,
      }),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
