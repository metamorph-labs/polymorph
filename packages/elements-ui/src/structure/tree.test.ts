import { treeLaw } from '@polymorph/conformance/tree'

import { mountElement } from '../mount'
import './Tree'

/**
 * Tree's keys, its selection, who holds its open branches and where focus is
 * when a level arrives, as `@polymorph/conformance/tree` states them for every
 * shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
treeLaw({
  shell: 'Elements',
  async mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
    const { set } = await mountElement(
      'poly-tree',
      {
        label: 'Units',
        defaultExpanded,
        defaultValue,
        ...props,
        onChange,
        onExpandedChange,
        onLoadMore,
      },
      { owns: ['value', 'expanded'] },
    )
    return { set }
  },
})
