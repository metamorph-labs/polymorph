import { h, nextTick, reactive, ref } from 'vue'

import { promptTriggersLaw, type PromptLawProps } from '@polymorph/conformance/prompt-triggers'

import { mount } from '../mount'
import Dialog from '../overlays/Dialog.vue'
import PromptInput, { type PromptTrigger } from './PromptInput.vue'

/**
 * PromptInput's mentions and commands in the Vue shell
 * (`design/components/prompt-input.md`), as
 * `@polymorph/conformance/prompt-triggers` states them for every web shell.
 */
promptTriggersLaw({
  shell: 'Vue',
  async mount({ props, defaultValue, messages, onChange, onSubmit }) {
    const held = reactive<PromptLawProps>({ ...props })
    await mount(() =>
      h(PromptInput, {
        label: 'Message',
        defaultValue,
        messages,
        triggers: held.triggers as PromptTrigger[] | undefined,
        value: held.value,
        onChange,
        onSubmit,
      }),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
  async mountInDialog({ triggers, onOpenChange }) {
    const open = ref(true)
    await mount(() =>
      h(
        Dialog,
        {
          title: 'Compose',
          open: open.value,
          onOpenChange: (next: boolean) => {
            onOpenChange(next)
            open.value = next
          },
        },
        {
          default: () =>
            h(PromptInput, {
              label: 'Message',
              triggers: triggers as PromptTrigger[],
              onSubmit: () => {},
            }),
        },
      ),
    )
  },
})
