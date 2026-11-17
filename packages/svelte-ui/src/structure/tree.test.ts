import { tick } from 'svelte'

import { treeLaw } from '@polymorph/conformance/tree'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import Tree from './Tree.svelte'

/**
 * Tree's keys, its selection, who holds its open branches and where focus is
 * when a level arrives, in the Svelte shell (`design/components/tree.md`), as
 * `@polymorph/conformance/tree` states them for every web shell.
 */
treeLaw({
  shell: 'Svelte',
  async mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
    const held = live({
      label: 'Units',
      defaultExpanded,
      defaultValue,
      onChange,
      onExpandedChange,
      onLoadMore,
      ...props,
    })
    await render(Tree, held)
    return {
      set(next) {
        Object.assign(held, next)
        return tick()
      },
    }
  },
})
