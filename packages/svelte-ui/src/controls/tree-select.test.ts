import { tick } from 'svelte'

import { treeSelectLaw } from '@polymorph/conformance/tree-select'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import TreeSelect from './TreeSelect.svelte'

/**
 * TreeSelect's popup, its choices, the empty choice, the hidden field and a
 * level that loads while it is open, and Tree's law on the tree in the popup,
 * in the Svelte shell (`design/components/tree-select.md`), as
 * `@polymorph/conformance/tree-select` states them for every web shell.
 */
treeSelectLaw({
  shell: 'Svelte',
  async mount({ props, onChange, onExpandedChange, onLoadMore, ...rest }) {
    const held = live({
      label: 'Units',
      'aria-label': 'Move under',
      presentation: 'popover' as const,
      ...rest,
      onChange,
      onExpandedChange,
      onLoadMore,
      ...props,
    })
    await render(TreeSelect, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
