import { h, nextTick, shallowReactive } from 'vue'

import { logViewLaw, type LogViewLawProps } from '@polymorph/conformance/log-view'

import { mount } from '../mount'
import LogView from './LogView.vue'

/**
 * How a LogView follows its newest line, and what it says, in the Vue shell
 * (`design/components/log-view.md`), as `@polymorph/conformance/log-view`
 * states it for every web shell.
 *
 * The props are shallow state, as an application holds a stream's lines: it
 * replaces the array with each line that arrives, and deep state would make
 * every line reactive again each time.
 */
logViewLaw({
  shell: 'Vue',
  async mount(props) {
    const held = shallowReactive<LogViewLawProps>({ ...props })
    const { host } = await mount(() => h(LogView, { label: 'Build output', ...held }))
    return {
      host,
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
