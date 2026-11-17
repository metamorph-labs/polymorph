import { tick } from 'svelte'

import { lightboxLaw } from '@polymorph/conformance/lightbox'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import Lightbox from './Lightbox.svelte'

/**
 * How a Lightbox moves, where focus is at its ends, how it fits a picture and
 * where focus goes when it closes, in the Svelte shell
 * (`design/components/lightbox.md`), as `@polymorph/conformance/lightbox`
 * states them for every web shell.
 */
lightboxLaw({
  shell: 'Svelte',
  async mount({ props, defaultIndex, onIndexChange, onOpenChange }) {
    const held = live({
      defaultOpen: true,
      label: 'Photographs',
      defaultIndex,
      onIndexChange,
      onOpenChange,
      ...props,
    })
    await render(Lightbox, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
