import { PAGER_ADDRESSES, pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { mountElement } from '../mount'
import './Pagination'

/**
 * Where focus goes when the app holds a Pagination whose button has focus, and
 * when that hold ends, as `@polymorph/conformance/pager-hold` states it for every
 * shell. The page is the law's: the element's change event for it is cancelled.
 */
pagerHoldLaw({
  shell: 'Elements',
  member: 'Pagination',
  async mount({ addressed, asked }) {
    const { set } = await mountElement(
      'poly-pagination',
      {
        label: 'Tickets',
        page: 3,
        pageCount: 7,
        disabled: false,
        ...(addressed ? { getPageHref: PAGER_ADDRESSES.page } : {}),
        onPageChange: asked,
      },
      { owns: ['page'] },
    )
    return { set }
  },
})
