import { recordButtonLaw } from '@polymorph/conformance/record-button'

import { mountElement } from '../mount'
import './RecordButton'

/**
 * Which handler a RecordButton's press calls, its focus when the app starts
 * recording and its meter, as `@polymorph/conformance/record-button` states them
 * for every shell.
 */
recordButtonLaw({
  shell: 'Elements',
  async mount(props) {
    const { set } = await mountElement('poly-record-button', props)
    return { set }
  },
})
