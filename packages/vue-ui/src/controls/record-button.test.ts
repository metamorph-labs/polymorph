import { h, nextTick, reactive } from 'vue'

import { recordButtonLaw, type RecordButtonState } from '@polymorph/conformance/record-button'

import { mount } from '../mount'
import RecordButton from './RecordButton.vue'

/**
 * What a RecordButton reports and draws, in the Vue shell
 * (`design/components/record-button.md`, Behaviour), as
 * `@polymorph/conformance/record-button` states it for every web shell.
 */
recordButtonLaw({
  shell: 'Vue',
  async mount(props) {
    const state = reactive<Partial<RecordButtonState>>({})
    await mount(() => h(RecordButton, { ...props, ...state }))
    return {
      set(next) {
        Object.assign(state, next)
        return nextTick()
      },
    }
  },
})
