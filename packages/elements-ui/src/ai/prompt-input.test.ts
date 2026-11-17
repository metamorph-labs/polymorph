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
