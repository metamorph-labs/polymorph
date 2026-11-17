import { tick } from 'svelte'

import { logViewLaw } from '@polymorph/conformance/log-view'

import { render } from '../mount'
import { liveRaw } from '../testing/live.svelte'
import LogView from './LogView.svelte'

/**
 * How a LogView follows its newest line, and what it says, in the Svelte
 * shell (`design/components/log-view.md`), as `@polymorph/conformance/log-view`
 * states it for every web shell.
 *
 * The props are raw state, as an application holds a stream's lines: it
 * replaces the array with each line that arrives, and a deep proxy would wrap
 * every line again each time. A prop the law does not pass is `undefined`,
 * which the member reads as its default.
 */
logViewLaw({
  shell: 'Svelte',
  async mount(props) {
    const held = liveRaw({
      label: 'Build output',
      streaming: undefined as boolean | undefined,
      wrap: undefined as boolean | undefined,
      ...props,
    })
    const { host } = await render(LogView, held)
    return {
      host,
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
