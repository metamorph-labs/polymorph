'use client'

import type { FormEvent, ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { EmptyState, type EmptyStateProps } from '../structure/EmptyState'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/search-page.module.css'

/**
 * The page for a query and its results (`design/archetypes/search-page.md`).
 *
 * Its subject is a query: the field, the filters under it, and what the query
 * found. It is not ListPage, whose subject is a set of records in one panelled
 * table and whose filters narrow what is already listed. It draws nothing
 * below the field until it is asked, and its results are groups of different
 * kinds that flow down the page.
 *
 * `emptyState` is required, as ListPage's is, so the page cannot be built
 * without deciding what it says when a query finds nothing.
 *
 * It owns the `--pm-page-*` scope, declared on its root (red rule 6).
 */

export interface SearchPageProps {
  title: string
  description?: string
  /** Vocabulary controls, including the page's one primary action. */
  actions?: ReactNode
  /** The query field: a SearchInput, or a FormField with an Input whose `trailing` is a submit Button. */
  search: ReactNode
  /**
   * The search landmark's name. A shell often has a search of its own, and
   * two landmarks of one kind are told apart only by their names.
   */
  searchLabel: string
  /**
   * Makes the landmark a real `<form>`, so Enter in the field submits. Without
   * it the application searches as the reader types.
   */
  onSubmit?: () => void
  /** A FilterBar, or `sm` controls, under the field. */
  filters?: ReactNode
  /** The query found nothing: the results region holds the empty state. */
  empty?: boolean
  /** The empty state, required so the page always says what it shows when a query finds nothing. */
  emptyState: EmptyStateProps
  /** A search is running: the results region is busy, and the last results stay in it. */
  pending?: boolean
  /** Groups of results, each a Heading, a List and a CursorPagination. None before a query. */
  children?: ReactNode
}

export function SearchPage({
  title,
  description,
  actions,
  search,
  searchLabel,
  onSubmit,
  filters,
  empty = false,
  emptyState,
  pending = false,
  children,
}: SearchPageProps) {
  // The page owns the submit, so the browser never navigates. `noValidate`
  // below leaves an empty query to the application, which draws its own
  // message where it wants one.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit?.()
  }

  const query = (
    <>
      {search}
      {filters === undefined ? null : (
        <Inline gap={3} wrap>
          {filters}
        </Inline>
      )}
    </>
  )

  return (
    <div
      className={styles.page}
      data-empty={empty ? '' : undefined}
      data-pending={pending ? '' : undefined}
      {...memberAttr('SearchPage')}
    >
      <PageHeader title={title} description={description} actions={actions} />

      {/* The same landmark either way. Only a page that submits is a form,
          because a form without a submit would still navigate on Enter. */}
      {onSubmit === undefined ? (
        <div
          role="search"
          aria-label={searchLabel}
          className={styles.search}
          data-search-page-part="search"
        >
          {query}
        </div>
      ) : (
        <form
          role="search"
          aria-label={searchLabel}
          className={styles.search}
          data-search-page-part="search"
          onSubmit={submit}
          noValidate
        >
          {query}
        </form>
      )}

      {/* The swap moves no focus and plays no motion: the reader's place is
          the field, and a page that searches as the reader types would
          animate on every keystroke. */}
      <div
        className={styles.results}
        aria-busy={pending ? true : undefined}
        data-search-page-part="results"
      >
        {empty ? <EmptyState {...emptyState} /> : children}
      </div>
    </div>
  )
}
