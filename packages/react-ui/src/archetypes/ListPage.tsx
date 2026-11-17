'use client'

import type { ReactNode } from 'react'

import { Inline } from '../layout/Inline'
import { memberAttr } from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import { EmptyState, type EmptyStateProps } from '../structure/EmptyState'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/list-page.module.css'

/**
 * The records screen (`design/archetypes/list-page.md`).
 *
 * Slots enforce the hierarchy, not review. A ListPage cannot be assembled in
 * the wrong order, because header, filters and body are props, not children.
 * It owns the only `PageHeader` on the page, and so the only `<h1>`.
 *
 * `emptyState` is required, which enforces the completeness law. The page
 * cannot be built without deciding what it shows when it has no records.
 * Empty states are often skipped, and here skipping one is a type error.
 *
 * It owns the `--pm-page-*` scope, declared on its root (red rule 6).
 */

export interface ListPageProps {
  title: string
  description?: string
  /** Vocabulary controls, including the page's one primary action. */
  actions?: ReactNode
  /**
   * The band above the filters (the dashboard block's section cards), with the
   * page's key numbers. By convention it is a `Grid` of Stats in Cards.
   *
   * It is a slot, not part of `children`, because of a law. The body is a
   * panel with Card's surface recipe, and cards do not nest, so stat cards
   * inside it would be boxes inside a box. It also stays in place during the
   * body swap, because a filter that matches nothing does not change how many
   * tickets are open.
   */
  summary?: ReactNode
  /** `sm` controls by convention, and never a solid Button. */
  filters?: ReactNode
  empty?: boolean
  /** The empty state, required so the page always defines what it shows with no records. */
  emptyState: EmptyStateProps
  /** A Table composition. */
  children: ReactNode
}

export function ListPage({
  title,
  description,
  actions,
  summary,
  filters,
  empty = false,
  emptyState,
  children,
}: ListPageProps) {
  return (
    <div className={styles.page} data-empty={empty ? '' : undefined} {...memberAttr('ListPage')}>
      <PageHeader title={title} description={description} actions={actions} />

      {/* No wrapper of its own. The page's row-gap sets the spacing, and a
          wrapper with its own gap would set page spacing from inside a slot. */}
      {summary}

      {filters === undefined ? null : (
        <Inline gap={3} wrap>
          {filters}
        </Inline>
      )}

      {/* The body swap is `listpage.bodyswap`: a crossfade with no layout
          animation. The two bodies have different heights, and animating the
          height would hide that difference.

          Both bodies share one grid cell during the swap, so the outgoing body
          fades under the incoming one instead of sitting above it in flow and
          pushing the page down for 220ms. Presence is `initial={false}`, so a
          page that loads empty does not fade in. */}
      <div className={styles.bodySlot}>
        <MotionPresence>
          <MotionSurface
            key={empty ? 'empty' : 'table'}
            binding="listpage.bodyswap"
            className={styles.body}
          >
            {empty ? <EmptyState {...emptyState} /> : children}
          </MotionSurface>
        </MotionPresence>
      </div>
    </div>
  )
}
