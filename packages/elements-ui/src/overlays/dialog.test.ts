import { dialogFitLaw } from '@polymorph/conformance/dialog-fit'
import { create } from '@polymorph/elements'

import { mountElement } from '../mount'
import '../controls/Button'
import './Dialog'

/**
 * How a Dialog's panel fits a window shorter than its content, at phone and
 * desktop width, in both presentations, as `@polymorph/conformance/dialog-fit`
 * states it for every web shell. The element is made as a page's script makes
 * one: the body's paragraphs are its children, and the footer's Button is a
 * child in the `footer` slot.
 */
dialogFitLaw({
  shell: 'Elements',
  async mount({ title, description, size, presentation, paragraphs, footer }) {
    const children = paragraphs.map((text) => create('p', {}, [text]))
    if (footer !== undefined)
      children.push(create('poly-button', { slot: 'footer', label: footer }))
    await mountElement(
      'poly-dialog',
      { defaultOpen: true, title, description, size, presentation },
      { children },
    )
  },
})
