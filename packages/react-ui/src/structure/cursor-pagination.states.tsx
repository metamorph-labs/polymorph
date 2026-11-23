'use client'

import { useEffect, useState } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { CursorPagination } from './CursorPagination'

/** States fixture, from `design/components/cursor-pagination.md`'s States table. */

const noop = () => {}

/** The windows' addresses. Fragments, so a click a test leaves to the browser stays on the page. */
const PREVIOUS = '#before-26'
const NEXT = '#after-50'

/** How many frames the ran-out entry waits for its action before giving up. */
const ACTION_FRAMES = 60

/**
 * The append form after its last window arrived. The form says the list ran
 * out only once it has asked for a window, so this entry presses "Load more"
 * the way a reader would, once it is in the document, and the window that
 * answers has no next one. Its landmark has a name of its own, so the press
 * finds this pager in a gallery of them.
 */
function RanOut() {
  const [hasNext, setHasNext] = useState(true)
  useEffect(() => {
    let frame = 0
    let waited = 0
    const press = () => {
      const action = document.querySelector<HTMLButtonElement>(
        '[data-member="cursor-pagination"][aria-label="Event log"] button',
      )
      if (action === null) {
        if (++waited < ACTION_FRAMES) frame = requestAnimationFrame(press)
        return
      }
      action.click()
    }
    frame = requestAnimationFrame(press)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <CursorPagination
      mode="append"
      hasPrevious={false}
      hasNext={hasNext}
      position="120 shown"
      label="Event log"
      onNext={() => setHasNext(false)}
    />
  )
}

export const states: ComponentStates = {
  component: 'CursorPagination',

  entries: [
    {
      name: 'the first window — nothing behind it',
      render: () => (
        <CursorPagination hasPrevious={false} hasNext onPrevious={noop} onNext={noop} />
      ),
    },
    {
      name: 'a middle window',
      render: () => <CursorPagination hasPrevious hasNext onPrevious={noop} onNext={noop} />,
    },
    {
      name: 'the last window — nothing ahead of it',
      render: () => (
        <CursorPagination hasPrevious hasNext={false} onPrevious={noop} onNext={noop} />
      ),
    },
    {
      name: 'with a position, in the app’s words',
      render: () => (
        <CursorPagination hasPrevious hasNext position="26–50" onPrevious={noop} onNext={noop} />
      ),
    },
    {
      name: 'pending — a window is in flight',
      render: () => (
        <CursorPagination
          hasPrevious
          hasNext
          pending
          position="26–50"
          onPrevious={noop}
          onNext={noop}
        />
      ),
      expect: { 'data-pending': '' },
    },
    {
      name: 'held by the app — neither direction can be pressed',
      render: () => (
        <CursorPagination
          hasPrevious
          hasNext
          disabled
          position="26–50"
          onPrevious={noop}
          onNext={noop}
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'localized',
      render: () => (
        <CursorPagination
          hasPrevious
          hasNext
          label="Pagination des événements"
          messages={{ previous: 'Précédent', next: 'Suivant' }}
          onPrevious={noop}
          onNext={noop}
        />
      ),
    },
    {
      name: 'with addresses — both directions are links',
      render: () => (
        <CursorPagination
          hasPrevious
          hasNext
          position="26–50"
          previousHref={PREVIOUS}
          nextHref={NEXT}
          onPrevious={noop}
          onNext={noop}
        />
      ),
    },
    {
      name: 'append — more to load',
      render: () => <CursorPagination mode="append" hasPrevious={false} hasNext onNext={noop} />,
    },
    {
      name: 'append — with a position',
      render: () => (
        <CursorPagination
          mode="append"
          hasPrevious={false}
          hasNext
          position="50 shown"
          onNext={noop}
        />
      ),
    },
    {
      name: 'append — a window is in flight',
      render: () => (
        <CursorPagination
          mode="append"
          hasPrevious={false}
          hasNext
          pending
          position="50 shown"
          onNext={noop}
        />
      ),
      expect: { 'data-pending': '' },
    },
    {
      name: 'append — held by the app',
      render: () => (
        <CursorPagination
          mode="append"
          hasPrevious={false}
          hasNext
          disabled
          position="50 shown"
          onNext={noop}
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'append — with an address, the action is a link',
      render: () => (
        <CursorPagination
          mode="append"
          hasPrevious={false}
          hasNext
          position="50 shown"
          nextHref={NEXT}
          onNext={noop}
        />
      ),
    },
    {
      name: 'append — the list ran out',
      render: () => <RanOut />,
    },
    {
      name: 'append — one window, so nothing at all',
      render: () => (
        <CursorPagination mode="append" hasPrevious={false} hasNext={false} onNext={noop} />
      ),
      rendersNothing: true,
    },
    {
      name: 'one window — nothing at all, because one window is not a paginated list',
      render: () => (
        <CursorPagination hasPrevious={false} hasNext={false} onPrevious={noop} onNext={noop} />
      ),
      rendersNothing: true,
    },
  ],

  /*
   * As for Pagination: the root takes focus when a hold disables the button
   * that had it, so it draws the focus ring. Every control is a Button, or a
   * link that composes Button's class, so its `:hover`, `:focus-visible`,
   * `[data-state='loading']` and `:disabled` are asserted by
   * `button.states.tsx`.
   */
  requiredSelectors: [':focus-visible'],
}
