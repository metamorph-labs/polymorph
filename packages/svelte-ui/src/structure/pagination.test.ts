import { tick } from 'svelte'

import { PAGER_ADDRESSES, pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import Pagination from './Pagination.svelte'

/**
 * A Pagination the app holds while one of its buttons has focus, in the
 * Svelte shell (`design/components/pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Svelte',
  member: 'Pagination',
  async mount({ addressed, asked }) {
    const props = live({
      label: 'Tickets',
      page: 3,
      pageCount: 7,
      disabled: false,
      getPageHref: addressed ? PAGER_ADDRESSES.page : undefined,
      onPageChange: asked,
    })
    await render(Pagination, props)
    return {
      set(next) {
        if (next.page !== undefined) props.page = next.page
        if (next.disabled !== undefined) props.disabled = next.disabled
        return tick()
      },
    }
  },
})
