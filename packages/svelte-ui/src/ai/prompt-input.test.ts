import { tick } from 'svelte'

import { promptTriggersLaw } from '@polymorph/conformance/prompt-triggers'

import { render } from '../mount'
import PromptInputDialogHarness from '../testing/PromptInputDialogHarness.svelte'
import { live } from '../testing/live.svelte'
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
