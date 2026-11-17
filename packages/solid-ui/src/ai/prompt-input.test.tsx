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
