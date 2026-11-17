import { treeSelectLaw } from '@polymorph/conformance/tree-select'

import { mountElement } from '../mount'
import './TreeSelect'

/**
 * TreeSelect's choices, its empty choice and a level that arrives while its popup
 * is open, with Tree's law on the tree in the popup, as
 * `@polymorph/conformance/tree-select` states them for every shell.
 * A value the law holds is the page's: the element's change event for it is
 * cancelled, as a page that owns a value cancels it.
 */
treeSelectLaw({
  shell: 'Elements',
  async mount({ props, onChange, onExpandedChange, onLoadMore, ...rest }) {
    const { set } = await mountElement(
      'poly-tree-select',
      {
        label: 'Units',
        'aria-label': 'Move under',
        presentation: 'popover',
        defaultExpanded: rest.defaultExpanded,
        defaultValue: rest.defaultValue,
        emptyOption: rest.emptyOption,
        placeholder: rest.placeholder,
        name: rest.name,
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
