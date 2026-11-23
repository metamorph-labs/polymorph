'use client'

import { useState } from 'react'

import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { memberAttr, useAgentMember, useDevWarning } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/cursor-pagination.module.css'
import { usePagerFocus } from './pager-focus'
import { PagerLink } from './pager-link'

/**
 * Previous and next controls for a cursor-paged list
 * (`design/components/cursor-pagination.md`). It also shows the current position
 * when the app provides one. For APIs that return "there is more" and a token,
 * never a count.
 *
 * Not Pagination, which jumps to numbered pages and needs a page count. A cursor
 * list would have to invent `pageCount`, drawing uncounted pages and a last page
 * that may not be last. The default form replaces the window, so the list stays
 * bounded, which is the point of cursor paging. The `append` form is "Load
 * more": one action that adds the next window below the ones on screen. Both
 * forms read the same response and share every prop but the previous
 * direction, so they are one member.
 *
 * With `previousHref` and `nextHref`, a direction that can be pressed is a link
 * to its window's address (`pager-link.tsx`), so a crawler and a new tab can
 * follow it, and a plain click still calls the direction's handler.
 */

/**
 * The pager's words, localized by passing them (WCAG 3.1.2). Pass `previous`
 * and `next` both or neither, so one control never mixes two languages; the
 * append form's two are optional, so a pager written before them still
 * type-checks, and an app that localizes the append form passes them too.
 */
export interface CursorPaginationMessages {
  previous: string
  next: string
  /** The append form's action. Default: `Load more`. */
  more?: string
  /** What the append form says once the list has no more. Default: `No more to load`. */
  end?: string
}

const DEFAULT_MESSAGES = {
  previous: 'Previous',
  next: 'Next',
  more: 'Load more',
  end: 'No more to load',
} satisfies Required<CursorPaginationMessages>

/** What both forms take. */
interface CursorPaginationShared {
  /**
   * Whether the list returned a cursor that way; controlled, as cursors belong to
   * the list. The append form does not read it: it has no previous direction.
   */
  hasPrevious: boolean
  hasNext: boolean
  /** The next window: in place of this one, or in the append form below it. */
  onNext: () => void
  /**
   * The current window in the app's words, such as "26–50" or "Newest first,
   * page 2"; never a total, because the list does not return one.
   */
  position?: string
  /**
   * The requested window has not arrived: the pressed direction shows busy and
   * the other is disabled, so a slow fetch cannot be followed by a second request.
   */
  pending?: boolean
  /**
   * The app holds the pager while it does something else to the list: every control is
   * disabled and none shows busy. Not `pending`, which says the pager's own request is in flight.
   */
  disabled?: boolean
  label?: string
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: CursorPaginationMessages
  /**
   * The previous window's address, such as `?before=c25`. Given, previous is a link to it
   * while it can be pressed, so a crawler, a new tab and a reader whose script has not loaded
   * can follow it. A click the browser would follow in this tab calls `onPrevious` in place of
   * the navigation; a click with a modifier key opens the address. The append form does not
   * read it: it has no previous direction.
   */
  previousHref?: string
  /**
   * The next window's address, as `previousHref` is the previous one's: next, or in the append
   * form its action, is a link to it while it can be pressed, and a plain click calls `onNext`.
   */
  nextHref?: string
}

/** The link's classes, from this member's recipe. */
const LINK = { link: styles.link, label: styles.linkLabel, glyph: styles.linkGlyph }

/**
 * The two forms, as a union on `mode`, so the replace form's `onPrevious` is
 * required by the types and the append form, which has no previous direction,
 * takes none. A pager written before the append form passes `onPrevious` and
 * still type-checks.
 */
export type CursorPaginationProps = CursorPaginationShared &
  (
    | {
        /**
         * `replace` (the default) swaps the window for its neighbour, so the list stays
         * bounded. `append` is "Load more": one action that adds the next window below
         * the ones on screen, for a feed or a log read from the top.
         */
        mode?: 'replace'
        /** The previous window, in the replace form; the append form has no previous. */
        onPrevious: () => void
      }
    | { mode: 'append'; onPrevious?: undefined }
  )

type Direction = 'previous' | 'next'

export function CursorPagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  mode = 'replace',
  position,
  pending = false,
  disabled = false,
  label = 'Pagination',
  messages,
  previousHref,
  nextHref,
}: CursorPaginationProps) {
  // The direction the reader pressed. `pending` says a window is loading but not
  // which one, and the busy state belongs on the button that was pressed.
  const [asked, setAsked] = useState<Direction | null>(null)

  // The append form has asked for a window. The list has then paged, so a
  // missing next window means it ran out, not that it never grew. It is the
  // member's own memory, so the app passes its query library's flags as they
  // are and never says how many windows are on screen.
  const [paged, setPaged] = useState(false)

  // Clears the pressed direction when the fetch settles. Adjusted during render
  // on the transition (React's pattern for state that follows a prop), not on
  // `!pending`, which would clear it if `pending` turns true a tick late.
  const [wasPending, setWasPending] = useState(pending)
  if (wasPending !== pending) {
    setWasPending(pending)
    if (!pending) setAsked(null)
  }

  const append = mode === 'append'

  // A hold that disables the button with focus moves focus to the root, and
  // gives it back when the hold ends. A busy button is not disabled, so it
  // keeps focus until its window arrives. The controls are named in the order
  // they are drawn, as a button or as a link: the append form's action leaves
  // when its list runs out.
  const focus = usePagerFocus(
    disabled,
    append ? (hasNext || pending ? ['more'] : []) : ['previous', 'next'],
  )

  const words = messages ?? DEFAULT_MESSAGES
  const more = messages?.more ?? DEFAULT_MESSAGES.more
  const end = messages?.end ?? DEFAULT_MESSAGES.end
  useDevWarning(
    !append && hasPrevious && onPrevious === undefined,
    'CursorPagination: `hasPrevious` with no `onPrevious` draws a previous button that does nothing.',
  )
  useDevWarning(
    append && messages !== undefined && (messages.more === undefined || messages.end === undefined),
    'CursorPagination: the append form shows `messages.more` and `messages.end`; pass them with the others, so one control never mixes two languages.',
  )

  const go = (direction: Direction) => () => {
    setAsked(direction)
    if (direction === 'previous') onPrevious?.()
    else {
      setPaged(true)
      onNext()
    }
  }

  // The spec's `agent` fence. The pager's Buttons are its own parts, so it withholds them and
  // declares their two directions as its own. A direction a person cannot press is refused: one
  // with no window, and either while a window is in flight.
  useAgentMember({
    member: 'CursorPagination',
    element: () => focus.ref.current,
    state: () => ({
      'has-previous': !append && hasPrevious,
      'has-next': hasNext,
      position: position ?? '',
      pending,
      disabled,
    }),
    actions: {
      previous: () => {
        if (append) throw new Error('The append form has no previous window.')
        if (!hasPrevious) throw new Error('There is no previous window.')
        if (pending) throw new Error('A window is in flight; wait for it to arrive.')
        go('previous')()
      },
      next: () => {
        if (!hasNext) throw new Error('There is no next window.')
        if (pending) throw new Error('A window is in flight; wait for it to arrive.')
        go('next')()
      },
    },
    withholds: () => focus.ref.current,
  })

  // A single window is not a paginated list (Pagination's rule). The pager stays
  // while loading, because only the new window says whether it is the last. The
  // append form stays once it has asked for a window, to say the list ran out.
  if (append ? !hasNext && !pending && !paged : !hasPrevious && !hasNext && !pending) return null

  // `disabled` is the app's hold. While a window is in flight it adds nothing: the
  // pressed direction is busy, which is not disabled and keeps its focus, and the
  // other is disabled already.

  // The append form's list has run out: it asked for a window, and there is no
  // next one and none in flight. Under the check above, `paged` holds here.
  const ended = !hasNext && !pending

  // With an address, a direction that can be pressed is a link to its window. One with no
  // window, a held pager's and either while a window is in flight stay Buttons, because a
  // control that cannot be followed is not drawn as a link.
  const follows = !pending && !disabled
  const previousLink = previousHref !== undefined && hasPrevious && follows
  const nextLink = nextHref !== undefined && hasNext && follows

  return (
    <nav
      className={styles.pagination}
      aria-label={label}
      aria-busy={pending ? true : undefined}
      data-pending={pending ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      {...focus}
      {...memberAttr('CursorPagination')}
    >
      {/* Wraps, as Pagination does. In a narrow container the three parts move
          onto a second line instead of overflowing. */}
      <Inline gap={2} align="center" wrap>
        {append ? (
          <>
            {position === undefined ? null : (
              // Polite: each window that arrives changes it once.
              <span className={styles.position} aria-live="polite">
                {position}
              </span>
            )}
            {ended ? null : nextLink ? (
              <PagerLink
                classes={LINK}
                href={nextHref}
                onFollow={go('next')}
                variant="outline"
                size="sm"
                label={more}
              />
            ) : (
              /*
               * Outline, not ghost: a lone action at the foot of a list needs an
               * edge to read as a control, with no arrows or numbers beside it.
               * Busy while a window is in flight, which keeps its focus and name
               * and ignores presses.
               */
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                label={more}
                loading={pending}
                // A busy action is not disabled, so it keeps its focus through a hold.
                disabled={disabled && !pending}
                onClick={go('next')}
              />
            )}
          </>
        ) : (
          <>
            {previousLink ? (
              <PagerLink
                classes={LINK}
                href={previousHref}
                onFollow={go('previous')}
                variant="ghost"
                size="sm"
                icon="previous"
                label={words.previous}
              />
            ) : (
              <Button
                variant="ghost"
                tone="neutral"
                size="sm"
                icon="previous"
                label={words.previous}
                loading={pending && asked === 'previous'}
                disabled={!hasPrevious || (pending ? asked !== 'previous' : disabled)}
                onClick={go('previous')}
              />
            )}

            {position === undefined ? null : (
              /*
               * Polite, like FilterBar's count. The text only changes with the
               * window, so the position is announced once per move.
               */
              <span className={styles.position} aria-live="polite">
                {position}
              </span>
            )}

            {nextLink ? (
              <PagerLink
                classes={LINK}
                href={nextHref}
                onFollow={go('next')}
                variant="ghost"
                size="sm"
                trailingIcon="next"
                label={words.next}
              />
            ) : (
              <Button
                variant="ghost"
                tone="neutral"
                size="sm"
                trailingIcon="next"
                label={words.next}
                loading={pending && asked === 'next'}
                disabled={!hasNext || (pending ? asked !== 'next' : disabled)}
                onClick={go('next')}
              />
            )}
          </>
        )}
      </Inline>

      {append ? (
        /*
         * A status region from the form's first render, empty until the list
         * runs out, because a region that mounts with its words announces
         * nothing. It is a line of its own under the row.
         */
        <span className={styles.end} role="status">
          {ended ? end : null}
        </span>
      ) : null}
    </nav>
  )
}
