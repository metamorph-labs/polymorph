import { lightboxLaw } from '@polymorph/conformance/lightbox'

import { mountElement } from '../mount'
import './Lightbox'

/**
 * Which picture a Lightbox shows after a key or a press, where focus is at its
 * ends and how its picture fits inside the window, as
 * `@polymorph/conformance/lightbox` states it for every shell. An index the law
 * holds is the page's: the element's change event for it is cancelled.
 */
lightboxLaw({
  shell: 'Elements',
  async mount({ props, defaultIndex, onIndexChange, onOpenChange }) {
    const { set } = await mountElement(
      'poly-lightbox',
      {
        defaultOpen: true,
        label: 'Photographs',
        defaultIndex,
        images: props.images,
        index: props.index,
        onIndexChange,
        onOpenChange,
      },
      { owns: ['index'] },
    )
    return { set }
  },
})
