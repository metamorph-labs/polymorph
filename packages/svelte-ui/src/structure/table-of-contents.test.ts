import { tick } from 'svelte'

import { tableOfContentsLaw } from '@polymorph/conformance/table-of-contents'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import TableOfContents from './TableOfContents.svelte'

/**
 * Which section the list marks and what a click on a link does, in the Svelte
 * shell (`design/components/table-of-contents.md`, Behaviour), as
 * `@polymorph/conformance/table-of-contents` states it for every web shell.
 */
tableOfContentsLaw({
  shell: 'Svelte',
  async mount({ items, onCurrentChange }) {
    const held = live({ label: 'On this page', items, onCurrentChange })
    const { unmount } = await render(TableOfContents, held)
    return {
      set(next) {
        held.items = next
        return tick()
      },
      unmount,
    }
  },
})
