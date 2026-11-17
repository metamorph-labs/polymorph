import { tableOfContentsLaw } from '@polymorph/conformance/table-of-contents'

import { mountElement } from '../mount'
import './TableOfContents'

/**
 * Which section a TableOfContents marks as its page scrolls and where a click on
 * one of its links puts focus, as `@polymorph/conformance/table-of-contents`
 * states it for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
tableOfContentsLaw({
  shell: 'Elements',
  async mount({ items, onCurrentChange }) {
    const { set, unmount } = await mountElement('poly-table-of-contents', {
      label: 'On this page',
      items,
      onCurrentChange,
    })
    return { set: (next) => set({ items: next }), unmount }
  },
})
