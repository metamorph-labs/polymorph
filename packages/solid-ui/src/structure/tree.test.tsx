import { createSignal } from 'solid-js'

import { treeLaw } from '@polymorph/conformance/tree'

import { mount } from '../mount'
import Tree from './Tree'

/**
 * Tree's keys, its selection, who holds its open branches and where focus is
 * when a level arrives, in the Solid shell (`design/components/tree.md`), as
 * `@polymorph/conformance/tree` states them for every web shell.
 */
treeLaw({
  shell: 'Solid',
  async mount({ props, defaultExpanded, defaultValue, onChange, onExpandedChange, onLoadMore }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <Tree
        label="Units"
        defaultExpanded={defaultExpanded}
        defaultValue={defaultValue}
        items={held().items}
        expanded={held().expanded}
        value={held().value}
        loading={held().loading}
        hasMore={held().hasMore}
        onChange={onChange}
        onExpandedChange={onExpandedChange}
        onLoadMore={onLoadMore}
      />
    ))
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
