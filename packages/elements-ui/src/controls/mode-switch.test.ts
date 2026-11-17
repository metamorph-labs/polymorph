import { modeSwitchLaw } from '@polymorph/conformance/mode-switch'

import { mountElement } from '../mount'
import './ModeSwitch'

/**
 * What a ModeSwitch's press does to the document's mode and how it follows a
 * mode another caller sets, as `@polymorph/conformance/mode-switch` states it
 * for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
modeSwitchLaw({
  shell: 'Elements',
  async mount({ label, props, messages, onChange }) {
    const { set } = await mountElement(
      'poly-mode-switch',
      { label, messages, ...props, onChange },
      { owns: ['value'] },
    )
    return { set }
  },
})
