import { userEvent } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'

import { promptTriggersLaw } from '@polymorph/conformance/prompt-triggers'

import { mount } from '../mount'
import Dialog from '../overlays/Dialog'
import PromptInput, { type PromptTrigger } from './PromptInput'

/**
 * PromptInput's mentions and commands in the Solid shell
 * (`design/components/prompt-input.md`), as
 * `@polymorph/conformance/prompt-triggers` states them for every web shell.
 */
promptTriggersLaw({
  shell: 'Solid',
  async mount({ props, defaultValue, messages, onChange, onSubmit }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <PromptInput
        label="Message"
        defaultValue={defaultValue}
        messages={messages}
        triggers={held().triggers as PromptTrigger[] | undefined}
        value={held().value}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
  async mountInDialog({ triggers, onOpenChange }) {
    const [open, setOpen] = createSignal(true)
    await mount(() => (
      <Dialog
        title="Compose"
        open={open()}
        onOpenChange={(next) => {
          onOpenChange(next)
          setOpen(next)
        }}
      >
        <PromptInput label="Message" triggers={triggers as PromptTrigger[]} onSubmit={() => {}} />
      </Dialog>
    ))
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
    await mount(() => <PromptInput label="Message" onSubmit={onSubmit} />)
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
    const [attachments, setAttachments] = createSignal([
      { id: 'a', name: 'spec.pdf' },
      { id: 'b', name: 'notes.txt' },
      { id: 'c', name: 'shot.png' },
    ])
    await mount(() => (
      <PromptInput
        label="Message"
        attachments={attachments()}
        onAttach={() => {}}
        onReject={() => {}}
        onRemoveAttachment={(id) => setAttachments((was) => was.filter((one) => one.id !== id))}
        onSubmit={() => {}}
      />
    ))
    removeControl('notes.txt')?.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('shot.png')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(removeControl('spec.pdf')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(message()))
  })
})
