import { h, nextTick, reactive } from 'vue'

import { pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { mount } from '../mount'
import Pagination from './Pagination.vue'

/**
 * A Pagination the app holds while one of its buttons has focus, in the Vue
 * shell (`design/components/pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Vue',
  member: 'Pagination',
  async mount({ asked }) {
    const hold = reactive({ page: 3, disabled: false })
    await mount(() =>
      h(Pagination, {
        label: 'Tickets',
        page: hold.page,
        pageCount: 7,
        disabled: hold.disabled,
        onPageChange: asked,
      }),
    )
    return {
      set(next) {
        if (next.page !== undefined) hold.page = next.page
        if (next.disabled !== undefined) hold.disabled = next.disabled
        return nextTick()
      },
    }
  },
})
