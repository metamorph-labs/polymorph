'use client'

import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { memberAttr, PAGINATION_ELLIPSIS, paginationWindow, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/pagination.module.css'
import { usePagerFocus } from './pager-focus'
import { PagerLink } from './pager-link'

/**
 * Numbered page controls for paged lists (`design/components/pagination.md`).
 *
 * Numbered pages only. "Load more" and infinite scroll show more results rather
 * than jumping to a page, and one component doing both would have to guess.
 * Renders nothing below two pages, because one page is not a paginated list.
 *
 * With `getPageHref`, a control that goes to another page is a link to that
 * page's address (`pager-link.tsx`), so a crawler and a new tab can follow it,
 * and a plain click still calls `onPageChange`.
 */

export type SiblingCount = 1 | 2

/**
 * Every accessible name the pager uses, localized by passing them (WCAG 3.1.2).
 * Pass all keys or none, so one control never mixes two languages.
 */
export interface PaginationMessages {
  previous: string
  next: string
  /** A numbered button's accessible name; the visible text stays the digit. */
  page: (page: number) => string
}

const DEFAULT_MESSAGES: PaginationMessages = {
  previous: 'Previous page',
  next: 'Next page',
  page: (page) => `Page ${page}`,
}

export interface PaginationProps {
  /** 1-based and controlled, because the current page belongs to the list. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  siblingCount?: SiblingCount
  /**
   * The app holds the pager while it does something else to the list: every control is
   * disabled, the current page too, and no page is asked for.
   */
  disabled?: boolean
  label?: string
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: PaginationMessages
  /**
   * A page's address, such as `?page=3`. Given, each control that goes to another page is a
   * link to that page's address, so a crawler, a new tab and a reader whose script has not loaded
   * can follow it. A click the browser would follow in this tab calls `onPageChange` in place of
   * the navigation; a click with a modifier key opens the address. The current page, a control
   * with nowhere to go and a held pager's controls stay buttons.
   */
  getPageHref?: (page: number) => string
}

/** The link's classes, from this member's recipe. */
const LINK = { link: styles.link, label: styles.linkLabel, glyph: styles.linkGlyph }

/**
 * The visible pages, as data (`paginationWindow`): always the first, the last
 * and `page ± siblings`, with a gap of two or more as an ellipsis. The controls
 * are Buttons or links in a Button's look, so this arithmetic is the only logic
 * that can be wrong, and it is written once in the engine for every framework's
 * Pagination. It is re-exported here for the vocabulary's index.
 */
export { paginationWindow }

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  disabled = false,
  label = 'Pagination',
  messages = DEFAULT_MESSAGES,
  getPageHref,
}: PaginationProps) {
  const window = paginationWindow(page, pageCount, siblingCount)

  // The addresses the controls link to. A held pager links to none, because a held control
  // cannot be followed.
  const address = disabled ? undefined : getPageHref
  // A direction is a link only to a page the list has. A `page` outside the list still draws
  // its arrows, and an address for a page that does not exist is one a crawler would follow.
  const exists = (to: number) => to >= 1 && to <= pageCount

  // A hold that disables the button with focus moves focus to the root, and
  // gives it back when the hold ends. The controls are named in the order they
  // are drawn, a page by its number, so a page drawn again, as a new element or
  // as a link, is the same control.
  const focus = usePagerFocus(disabled, [
    'previous',
    ...window.filter((entry) => entry !== PAGINATION_ELLIPSIS),
    'next',
  ])

  // The spec's `agent` fence. The pager's Buttons are its own parts, so it withholds them and an
  // agent asks for a page by its number. The page is the caller's, so `set` asks as a press
  // does, through `onPageChange`.
  useAgentMember({
    member: 'Pagination',
    element: () => focus.ref.current,
    state: () => ({ page, 'page-count': pageCount, disabled }),
    actions: {
      set: {
        argument: 'number',
        run: (asked) => {
          if (!Number.isInteger(asked) || asked < 1 || asked > pageCount) {
            throw new Error(`There is no page ${asked}; the pages run from 1 to ${pageCount}.`)
          }
          if (asked !== page) onPageChange(asked)
        },
      },
    },
    withholds: () => focus.ref.current,
  })

  if (window.length === 0) return null

  return (
    <nav
      className={styles.pagination}
      aria-label={label}
      data-disabled={disabled ? '' : undefined}
      {...focus}
      {...memberAttr('Pagination')}
    >
      {/* Wraps, because eleven pages means eleven controls: in a narrow
          container the row continues on a second line, with the same `gap`. */}
      <Inline gap={1} align="center" wrap>
        {address !== undefined && page > 1 && exists(page - 1) ? (
          <PagerLink
            classes={LINK}
            href={address(page - 1)}
            onFollow={() => onPageChange(page - 1)}
            variant="ghost"
            size="sm"
            iconOnly
            icon="previous"
            label={messages.previous}
          />
        ) : (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="previous"
            label={messages.previous}
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
        )}

        {window.map((entry, index) =>
          entry === PAGINATION_ELLIPSIS ? (
            // Not a button, and it has no name. It stands for pages that are not
            // offered, so there is nothing to act on.
            <span
              // The gaps are keyed by position, because two gaps differ only in
              // where they are.
              key={`gap-${index}`}
              className={styles.ellipsis}
              aria-hidden="true"
            >
              …
            </span>
          ) : entry === page ? (
            // Soft, not solid. The page's single solid button belongs to its
            // primary action, and a pager must not use it. A held pager disables
            // it with the others, so no control looks pressable; it keeps
            // `aria-current`, so the page is still named.
            <Button
              key={entry}
              variant="soft"
              tone="accent"
              size="sm"
              current
              label={String(entry)}
              aria-label={messages.page(entry)}
              disabled={disabled}
            />
          ) : address !== undefined ? (
            // Another page, with an address: a link to it. The current page is never a link
            // to itself.
            <PagerLink
              key={entry}
              classes={LINK}
              href={address(entry)}
              onFollow={() => onPageChange(entry)}
              variant="ghost"
              size="sm"
              label={String(entry)}
              aria-label={messages.page(entry)}
            />
          ) : (
            <Button
              key={entry}
              variant="ghost"
              tone="neutral"
              size="sm"
              label={String(entry)}
              aria-label={messages.page(entry)}
              disabled={disabled}
              onClick={() => onPageChange(entry)}
            />
          ),
        )}

        {address !== undefined && page < pageCount && exists(page + 1) ? (
          <PagerLink
            classes={LINK}
            href={address(page + 1)}
            onFollow={() => onPageChange(page + 1)}
            variant="ghost"
            size="sm"
            iconOnly
            icon="next"
            label={messages.next}
          />
        ) : (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="next"
            label={messages.next}
            disabled={disabled || page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          />
        )}
      </Inline>
    </nav>
  )
}
