import { h, nextTick, reactive } from 'vue'

import { treeLaw, type TreeLawProps } from '@polymorph/conformance/tree'

import { mount } from '../mount'
import Tree from './Tree.vue'

/**
 * Tree's keys, its selection, who holds its open branches and where focus is
 * when a level arrives, in the Vue shell (`design/components/tree.md`), as
 * `@polymorph/conformance/tree` states them for every web shell.
 */
treeLaw({
  shell: 'Vue',
  async mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
    const held = reactive<TreeLawProps>({ ...props })
    await mount(() =>
      h(Tree, {
        label: 'Units',
        defaultExpanded,
        defaultValue,
        items: held.items,
        expanded: held.expanded,
        value: held.value,
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
