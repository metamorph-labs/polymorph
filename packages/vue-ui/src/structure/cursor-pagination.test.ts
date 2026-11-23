import { h, nextTick, reactive } from 'vue'

import { PAGER_ADDRESSES, pagerHoldLaw, type CursorHold } from '@polymorph/conformance/pager-hold'

import { mount } from '../mount'
import CursorPagination from './CursorPagination.vue'

/**
 * A CursorPagination the app holds while one of its buttons has focus, in the
 * Vue shell (`design/components/cursor-pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Vue',
  member: 'CursorPagination',
  async mount({ append, addressed, asked }) {
    const hold = reactive<CursorHold>({ disabled: false, pending: false, hasNext: true })
    const addresses = addressed
      ? { previousHref: PAGER_ADDRESSES.previous, nextHref: PAGER_ADDRESSES.next }
      : {}
    await mount(() =>
      append
        ? h(CursorPagination, {
            mode: 'append',
            label: 'Tickets',
            hasPrevious: false,
            hasNext: hold.hasNext,
            pending: hold.pending,
            disabled: hold.disabled,
            ...addresses,
            onNext: asked,
          })
        : h(CursorPagination, {
            label: 'Tickets',
            hasPrevious: true,
            hasNext: hold.hasNext,
            pending: hold.pending,
            disabled: hold.disabled,
            ...addresses,
            onPrevious: asked,
            onNext: asked,
          }),
    )
    return {
      set(next) {
        Object.assign(hold, next)
        return nextTick()
      },
    }
  },
})
