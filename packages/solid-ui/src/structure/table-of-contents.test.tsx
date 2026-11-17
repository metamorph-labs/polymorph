import { createSignal } from 'solid-js'

import { tableOfContentsLaw } from '@polymorph/conformance/table-of-contents'

import { mount } from '../mount'
import TableOfContents from './TableOfContents'

/**
 * Which section the list marks and what a click on a link does, in the Solid
 * shell (`design/components/table-of-contents.md`, Behaviour), as
 * `@polymorph/conformance/table-of-contents` states it for every web shell.
 */
tableOfContentsLaw({
  shell: 'Solid',
  async mount({ items, onCurrentChange }) {
    const [held, setHeld] = createSignal(items)
    const { unmount } = await mount(() => (
      <TableOfContents label="On this page" items={held()} onCurrentChange={onCurrentChange} />
    ))
    return {
      set(next) {
        setHeld(next)
      },
      unmount,
    }
  },
})
