import { createSignal } from 'solid-js'

import { treeSelectLaw } from '@polymorph/conformance/tree-select'

import { mount } from '../mount'
import TreeSelect from './TreeSelect'

/**
 * TreeSelect's popup, its choices, the empty choice, the hidden field and a
 * level that loads while it is open, and Tree's law on the tree in the popup,
 * in the Solid shell (`design/components/tree-select.md`), as
 * `@polymorph/conformance/tree-select` states them for every web shell.
 */
treeSelectLaw({
  shell: 'Solid',
  async mount({ props, onChange, onExpandedChange, onLoadMore, ...rest }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => (
      <TreeSelect
        label="Units"
        aria-label="Move under"
        presentation="popover"
        defaultExpanded={rest.defaultExpanded}
        defaultValue={rest.defaultValue}
        emptyOption={rest.emptyOption}
        placeholder={rest.placeholder}
        name={rest.name}
        items={held().items}
        expanded={held().expanded}
        value={held().value}
        valueLabel={held().valueLabel}
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
