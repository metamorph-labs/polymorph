import { h, nextTick, reactive } from 'vue'

import { lightboxLaw, type LightboxLawProps } from '@polymorph/conformance/lightbox'

import { mount } from '../mount'
import Lightbox from './Lightbox.vue'

/**
 * How a Lightbox moves, where focus is at its ends, how it fits a picture and
 * where focus goes when it closes, in the Vue shell
 * (`design/components/lightbox.md`), as `@polymorph/conformance/lightbox`
 * states them for every web shell.
 */
lightboxLaw({
  shell: 'Vue',
  async mount({ props, defaultIndex, onIndexChange, onOpenChange }) {
    const held = reactive<LightboxLawProps>({ ...props })
    await mount(() =>
      h(Lightbox, {
        defaultOpen: true,
        label: 'Photographs',
        defaultIndex,
        images: held.images,
        index: held.index,
        onIndexChange,
        onOpenChange,
      }),
    )
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
