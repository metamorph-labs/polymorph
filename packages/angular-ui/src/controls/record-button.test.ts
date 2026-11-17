import type { OutputEmitterRef } from '@angular/core'

import { recordButtonLaw } from '@polymorph/conformance/record-button'

import { mountComponent } from '../mount'
import { RecordButton } from './RecordButton'

/**
 * What a RecordButton reports and draws, in the Angular shell
 * (`design/components/record-button.md`, Behaviour), as
 * `@polymorph/conformance/record-button` states it for every web shell. The
 * law's handlers are the component's outputs, so the test subscribes to them,
 * and its changes are inputs set on the mounted component.
 */
recordButtonLaw({
  shell: 'Angular',
  async mount({ onStart, onStop, ...inputs }) {
    const { ref } = await mountComponent(RecordButton, { ...inputs })
    const button = ref.instance as {
      onStart: OutputEmitterRef<void>
      onStop: OutputEmitterRef<void>
    }
    if (onStart !== undefined) button.onStart.subscribe(onStart)
    if (onStop !== undefined) button.onStop.subscribe(onStop)
    return {
      set(next) {
        for (const [name, value] of Object.entries(next)) ref.setInput(name, value)
        ref.changeDetectorRef.detectChanges()
      },
    }
  },
})
