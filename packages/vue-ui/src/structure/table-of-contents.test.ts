import { h, nextTick, shallowRef } from 'vue'

import {
  tableOfContentsLaw,
  type TableOfContentsLawItem,
} from '@polymorph/conformance/table-of-contents'

import { mount } from '../mount'
import TableOfContents from './TableOfContents.vue'

/**
 * Which section the list marks and what a click on a link does, in the Vue
 * shell (`design/components/table-of-contents.md`, Behaviour), as
 * `@polymorph/conformance/table-of-contents` states it for every web shell.
 */
tableOfContentsLaw({
  shell: 'Vue',
  async mount({ items, onCurrentChange }) {
    const held = shallowRef<TableOfContentsLawItem[]>(items)
    const { unmount } = await mount(() =>
      h(TableOfContents, { label: 'On this page', items: held.value, onCurrentChange }),
    )
    return {
      set(next) {
        held.value = next
        return nextTick()
      },
      unmount,
    }
  },
})
