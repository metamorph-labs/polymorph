'use client'

import { useRef, type ReactNode } from 'react'

import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/filter-bar.module.css'

/**
 * Search and filters with a clear button and result count (`design/components/filter-bar.md`).
 *
 * A member under the promotion rule: Relay's hand-built filter rows had the same
 * shape twice. Over an `Inline` it adds a clear button that exists *exactly*
 * while something is filtered, and a politely announced result count, which
 * `list-page.md` leaves to whatever owns the filters.
 */

export interface FilterResultCount {
  shown: number
  /**
   * Omitted when unknown: a cursor-paged list holds one window, and an invented
   * total would be a number nobody counted.
   */
  total?: number
}

/**
 * Every string the bar announces, localized by passing them (WCAG 3.1.2). Pass
 * all keys or none, so one row never mixes two languages.
 */
export interface FilterBarMessages {
  clear: string
  resultCount: (count: FilterResultCount) => string
}

const DEFAULT_MESSAGES: FilterBarMessages = {
  clear: 'Clear filters',
  resultCount: ({ shown, total }) =>
    total === undefined ? `${shown} results` : `${shown} of ${total} results`,
}

export interface FilterBarProps {
  /** A `SearchInput`, `sm` by convention. */
  search?: ReactNode
  /** Filter controls, each an `sm` `Select` with an `emptyOption`. */
  children?: ReactNode
  /** The only input that shows or hides the clear button. */
  isFiltered: boolean
  onClear: () => void
  resultCount?: FilterResultCount
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: FilterBarMessages
}

export function FilterBar({
  search,
  children,
  isFiltered,
  onClear,
  resultCount,
  messages = DEFAULT_MESSAGES,
}: FilterBarProps) {
  // The spec's `agent` fence. The clear Button is the bar's own part, so it is withheld and
  // `clear` stands in its place. The search and the filters are the application's members.
  const root = useRef<HTMLDivElement>(null)
  const clear = useRef<HTMLSpanElement>(null)
  useAgentMember({
    member: 'FilterBar',
    element: () => root.current,
    state: () => ({
      filtered: isFiltered,
      'result-count': resultCount === undefined ? '' : messages.resultCount(resultCount),
    }),
    actions: {
      clear: () => {
        if (!isFiltered) throw new Error('Nothing is filtered, so there is nothing to clear.')
        onClear()
      },
    },
    withholds: () => clear.current,
  })

  return (
    <div
      ref={root}
      className={styles.bar}
      data-filtered={isFiltered ? '' : undefined}
      {...memberAttr('FilterBar')}
    >
      <Inline gap={3} align="center" wrap>
        {search}
        {children}

        {/* Only while there is something to clear. A permanent clear button
            would suggest that filters are set when none are. */}
        {isFiltered ? (
          // Wrapped so the entrance animation targets this button and not every
          // button in the row, since a Select trigger is also a button.
          <span ref={clear} className={styles.clear}>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="clear"
              label={messages.clear}
              onClick={onClear}
            />
          </span>
        ) : null}

        {resultCount === undefined ? null : (
          /*
           * Polite, and announced once per settled change: the live region
           * holds only the count, which changes only with the numbers.
           */
          <span className={styles.count} aria-live="polite">
            {messages.resultCount(resultCount)}
          </span>
        )}
      </Inline>
    </div>
  )
}
