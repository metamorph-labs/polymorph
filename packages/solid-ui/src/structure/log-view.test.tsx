import { createSignal } from 'solid-js'

import { logViewLaw } from '@polymorph/conformance/log-view'

import { mount } from '../mount'
import LogView from './LogView'

/**
 * How a LogView follows its newest line, and what it says, in the Solid shell
 * (`design/components/log-view.md`), as `@polymorph/conformance/log-view`
 * states it for every web shell.
 */
logViewLaw({
  shell: 'Solid',
  async mount(props) {
    const [held, setHeld] = createSignal(props)
    const { host } = await mount(() => <LogView label="Build output" {...held()} />)
    return {
      host,
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
