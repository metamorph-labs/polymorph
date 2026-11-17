import { logViewLaw } from '@polymorph/conformance/log-view'

import { mountElement } from '../mount'
import './LogView'

/**
 * How a LogView follows its newest line and what each line says, as
 * `@polymorph/conformance/log-view` states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
logViewLaw({
  shell: 'Elements',
  async mount(props) {
    const { host, set } = await mountElement('poly-log-view', { label: 'Build output', ...props })
    return { host, set }
  },
})
