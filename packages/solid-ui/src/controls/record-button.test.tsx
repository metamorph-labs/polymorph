import { createStore } from 'solid-js/store'

import { recordButtonLaw, type RecordButtonState } from '@polymorph/conformance/record-button'

import { mount } from '../mount'
import RecordButton from './RecordButton'

/**
 * What a RecordButton reports and draws, in the Solid shell
 * (`design/components/record-button.md`, Behaviour), as
 * `@polymorph/conformance/record-button` states it for every web shell.
 */
recordButtonLaw({
  shell: 'Solid',
  async mount(props) {
    const [state, setState] = createStore<Partial<RecordButtonState>>({})
    await mount(() => (
      <RecordButton
        {...props}
        recording={state.recording ?? props.recording}
        elapsed={state.elapsed ?? props.elapsed}
      />
    ))
    return {
      set(next) {
        setState(next)
      },
    }
  },
})
