import { h, nextTick, reactive } from 'vue'

import { treeSelectLaw, type TreeSelectLawProps } from '@polymorph/conformance/tree-select'

import { mount } from '../mount'
import TreeSelect from './TreeSelect.vue'

/**
 * TreeSelect's popup, its choices, the empty choice, the hidden field and a
 * level that loads while it is open, and Tree's law on the tree in the popup,
 * in the Vue shell (`design/components/tree-select.md`), as
 * `@polymorph/conformance/tree-select` states them for every web shell.
 */
treeSelectLaw({
  shell: 'Vue',
  async mount({ props, onChange, onExpandedChange, onLoadMore, ...rest }) {
    const held = reactive<TreeSelectLawProps>({ ...props })
    await mount(() =>
      h(TreeSelect, {
        label: 'Units',
        ariaLabel: 'Move under',
        presentation: 'popover',
        ...rest,
        items: held.items,
        expanded: held.expanded,
        value: held.value,
        valueLabel: held.valueLabel,
        loading: held.loading,
        hasMore: held.hasMore,
        onChange,
        onExpandedChange,
        onLoadMore,
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
