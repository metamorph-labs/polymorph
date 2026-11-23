import { PAGER_ADDRESSES, pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { mountElement } from '../mount'
import './CursorPagination'

/**
 * Where focus goes when the app holds a CursorPagination whose button has focus,
 * and when that hold ends, in both of its modes, as
 * `@polymorph/conformance/pager-hold` states it for every shell.
 */
pagerHoldLaw({
  shell: 'Elements',
  member: 'CursorPagination',
  async mount({ append, addressed, asked }) {
    const hold = { disabled: false, pending: false, hasNext: true }
    const addresses = addressed
      ? { previousHref: PAGER_ADDRESSES.previous, nextHref: PAGER_ADDRESSES.next }
      : {}
    const { set } = await mountElement(
      'poly-cursor-pagination',
      append
        ? {
            mode: 'append',
            label: 'Tickets',
            hasPrevious: false,
            ...hold,
            ...addresses,
            onNext: asked,
          }
        : {
            label: 'Tickets',
            hasPrevious: true,
            ...hold,
            ...addresses,
            onPrevious: asked,
            onNext: asked,
          },
    )
    return { set }
  },
})
