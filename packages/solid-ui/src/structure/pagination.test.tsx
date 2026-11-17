import { batch, createSignal } from 'solid-js'

import { pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { mount } from '../mount'
import Pagination from './Pagination'

/**
 * A Pagination the app holds while one of its buttons has focus, in the Solid
 * shell (`design/components/pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Solid',
  member: 'Pagination',
  async mount({ asked }) {
    const [page, setPage] = createSignal(3)
    const [disabled, setDisabled] = createSignal(false)
    await mount(() => (
      <Pagination
        label="Tickets"
        page={page()}
        pageCount={7}
        disabled={disabled()}
        onPageChange={asked}
      />
    ))
    return {
      set(next) {
        // One batch, as an application's handler sets its state.
        batch(() => {
          if (next.page !== undefined) setPage(next.page)
          if (next.disabled !== undefined) setDisabled(next.disabled)
        })
      },
    }
  },
})
