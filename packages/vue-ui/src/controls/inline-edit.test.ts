import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive, ref } from 'vue'

import { inlineEditLaw, type InlineEditLawProps } from '@polymorph/conformance/inline-edit'

import { mount } from '../mount'
import Dialog from '../overlays/Dialog.vue'
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

const textbox = () => document.querySelector<HTMLInputElement>('[data-member="inline-edit"] input')

describe('InlineEdit — keys', () => {
  it('leaves every key an input method is handling to it: Enter saves nothing, Escape keeps the field', async () => {
    const onCommit = vi.fn()
    const onEditingChange = vi.fn()
    await mount(() =>
      h(InlineEdit, {
        label: 'Project name',
        value: 'Acme',
        defaultEditing: true,
        onCommit,
        onEditingChange,
      }),
    )
    const field = textbox() as HTMLInputElement
    for (const how of ['composing', 'processed'] as const) {
      for (const key of ['Enter', 'Escape']) {
        expect(inputMethodKey(field, key, how).defaultPrevented, `${how} ${key}`).toBe(false)
      }
    }
    await sleep(30)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onEditingChange).not.toHaveBeenCalled()
    expect(textbox()).toBe(field)
  })

  it('cancels on Escape inside a Dialog with the Dialog still open, and the next Escape closes it', async () => {
    const onOpenChange = vi.fn()
    const onEditingChange = vi.fn()
    const open = ref(true)
    await mount(() =>
      h(
        Dialog,
        {
          title: 'Project',
          open: open.value,
          onOpenChange: (next: boolean) => {
            onOpenChange(next)
            open.value = next
          },
        },
        {
          default: () =>
            h(InlineEdit, {
              label: 'Project name',
              value: 'Acme',
              onCommit: () => {},
              onEditingChange,
            }),
        },
      ),
    )
    const edit = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-member="inline-edit"] button')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    await userEvent.click(edit)
    await vi.waitFor(() => expect(document.activeElement).toBe(textbox()))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onEditingChange).toHaveBeenLastCalledWith(false))
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
