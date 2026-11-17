import { tick } from 'svelte'

import { pagerHoldLaw } from '@polymorph/conformance/pager-hold'

import { render } from '../mount'
import { live } from '../testing/live.svelte'
import CursorPagination from './CursorPagination.svelte'

/**
 * A CursorPagination the app holds while one of its buttons has focus, in the
 * Svelte shell (`design/components/cursor-pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Svelte',
  member: 'CursorPagination',
  async mount({ append, asked }) {
    const props = live({
      mode: append ? ('append' as const) : ('replace' as const),
      label: 'Tickets',
      hasPrevious: !append,
      hasNext: true,
      pending: false,
      disabled: false,
      onPrevious: append ? undefined : asked,
      onNext: asked,
    })
    await render(CursorPagination, props)
    return {
      set(next) {
        Object.assign(props, next)
        return tick()
      },
    }
  },
})
