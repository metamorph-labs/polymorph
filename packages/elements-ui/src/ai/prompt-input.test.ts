import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import { promptTriggersLaw } from '@polymorph/conformance/prompt-triggers'
import { create } from '@polymorph/elements'

import { mountElement, mountNodes } from '../mount'
import '../overlays/Dialog'
import './PromptInput'

/**
 * PromptInput's mentions and commands: where a trigger opens its list, the
 * filter, the keys, the pick and the query the app hears, as
 * `@polymorph/conformance/prompt-triggers` states them for every shell, alone
 * and inside a Dialog. A value the law holds is the page's: the element's change
 * event for it is cancelled.
 */
promptTriggersLaw({
  shell: 'Elements',
  async mount({ props, defaultValue, messages, onChange, onSubmit }) {
    const { set } = await mountElement(
      'poly-prompt-input',
      { label: 'Message', defaultValue, messages, ...props, onChange, onSubmit },
      { owns: ['value'] },
    )
    return { set }
  },
  async mountInDialog({ triggers, onOpenChange }) {
    const dialog = create('poly-dialog', { title: 'Compose', open: true, onOpenChange }, [
      create('poly-prompt-input', { label: 'Message', triggers, onSubmit: () => {} }),
    ])
    await mountNodes(dialog)
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

const message = () =>
  document.querySelector<HTMLTextAreaElement>('[data-member="prompt-input"] textarea')
const removeControl = (name: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Remove ${name}"]`)

describe('PromptInput — keys and chips', () => {
  it('sends nothing on a key an input method is handling, Safari’s confirming Enter included', async () => {
    const onSubmit = vi.fn()
    await mountElement('poly-prompt-input', { label: 'Message', onSubmit })
    const field = message() as HTMLTextAreaElement
    field.focus()
    await userEvent.keyboard('にほん')
    for (const how of ['composing', 'processed'] as const) {
      expect(inputMethodKey(field, 'Enter', how).defaultPrevented, how).toBe(false)
    }
    await sleep(30)
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('にほん')
  })

  it('moves focus to the next chip’s remove control once a chip is removed, else the previous one, else the field', async () => {
    let attachments = [
      { id: 'a', name: 'spec.pdf' },
      { id: 'b', name: 'notes.txt' },
      { id: 'c', name: 'shot.png' },
    ]
    const mounted = await mountElement('poly-prompt-input', {
      label: 'Message',
      attachments,
      onAttach: () => {},
      onReject: () => {},
      onRemoveAttachment: (id: string) => {
        attachments = attachments.filter((one) => one.id !== id)
        mounted.set({ attachments })
      },
      onSubmit: () => {},
    })
    removeControl('notes.txt')?.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('shot.png')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('spec.pdf')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(message()))
  })
})
