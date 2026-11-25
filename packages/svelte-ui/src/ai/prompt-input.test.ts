import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { tick } from 'svelte'

import { promptTriggersLaw } from '@polymorph/conformance/prompt-triggers'

import { render } from '../mount'
import PromptInputDialogHarness from '../testing/PromptInputDialogHarness.svelte'
import { live, liveRaw } from '../testing/live.svelte'
import PromptInput, { type PromptTrigger } from './PromptInput.svelte'

/**
 * PromptInput's mentions and commands in the Svelte shell
 * (`design/components/prompt-input.md`), as
 * `@polymorph/conformance/prompt-triggers` states them for every web shell.
 */
promptTriggersLaw({
  shell: 'Svelte',
  async mount({ props, defaultValue, messages, onChange, onSubmit }) {
    const held = live({ label: 'Message', defaultValue, messages, onChange, onSubmit, ...props })
    await render(PromptInput, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
  async mountInDialog({ triggers, onOpenChange }) {
    await render(PromptInputDialogHarness, {
      triggers: triggers as PromptTrigger[],
      onOpenChange,
    })
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
    await render(PromptInput, { label: 'Message', onSubmit })
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
    const held = liveRaw({
      label: 'Message',
      attachments: [
        { id: 'a', name: 'spec.pdf' },
        { id: 'b', name: 'notes.txt' },
        { id: 'c', name: 'shot.png' },
      ],
      onAttach: () => {},
      onReject: () => {},
      onRemoveAttachment: (id: string) => {
        held.attachments = held.attachments.filter((one) => one.id !== id)
      },
      onSubmit: () => {},
    })
    await render(PromptInput, held)
    removeControl('notes.txt')?.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('shot.png')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('spec.pdf')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(message()))
  })
})
