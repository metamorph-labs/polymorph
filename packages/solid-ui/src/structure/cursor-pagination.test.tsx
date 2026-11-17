import { createSignal } from 'solid-js'

import { pagerHoldLaw, type CursorHold } from '@polymorph/conformance/pager-hold'

import { mount } from '../mount'
import CursorPagination from './CursorPagination'

/**
 * A CursorPagination the app holds while one of its buttons has focus, in the
 * Solid shell (`design/components/cursor-pagination.md`, A11y), as
 * `@polymorph/conformance/pager-hold` states it for every web shell.
 */
pagerHoldLaw({
  shell: 'Solid',
  member: 'CursorPagination',
  async mount({ append, asked }) {
    const [hold, setHold] = createSignal<CursorHold>({
      disabled: false,
      pending: false,
      hasNext: true,
    })
    await mount(() =>
      append ? (
        <CursorPagination
          mode="append"
          label="Tickets"
          hasPrevious={false}
          hasNext={hold().hasNext}
          pending={hold().pending}
          disabled={hold().disabled}
          onNext={asked}
        />
      ) : (
        <CursorPagination
          label="Tickets"
          hasPrevious
          hasNext={hold().hasNext}
          pending={hold().pending}
          disabled={hold().disabled}
          onPrevious={asked}
          onNext={asked}
        />
      ),
    )
    return {
      set(next) {
        setHold((was) => ({ ...was, ...next }))
      },
    }
  },
})
