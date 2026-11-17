import { createSignal } from 'solid-js'

import { lightboxLaw } from '@polymorph/conformance/lightbox'

import { mount } from '../mount'
import Lightbox from './Lightbox'

/**
 * How a Lightbox moves, where focus is at its ends, how it fits a picture and
 * where focus goes when it closes, in the Solid shell
 * (`design/components/lightbox.md`), as `@polymorph/conformance/lightbox`
 * states them for every web shell.
 */
lightboxLaw({
  shell: 'Solid',
  async mount({ props, defaultIndex, onIndexChange, onOpenChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <Lightbox
        defaultOpen
        label="Photographs"
        defaultIndex={defaultIndex}
        images={held().images}
        index={held().index}
        onIndexChange={onIndexChange}
        onOpenChange={onOpenChange}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
