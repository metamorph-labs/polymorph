'use client'

import { cloneElement, type ReactElement, type ReactNode } from 'react'

import { memberAttr, useSupplied } from '@polymorph/react'
import { Button } from '../controls/Button'
import styles from '@polymorph/recipes/archetypes/detail-page.module.css'

/**
 * The full view of one entity (`design/archetypes/detail-page.md`).
 *
 * `onBack` is required, and that is the archetype's one opinion. A detail page
 * is always reached from somewhere, usually a list the reader wants to return
 * to. An optional back control would be forgotten.
 *
 * The back button comes before the `<h1>` in the DOM as well as above it on
 * screen, so it is the first thing after the skip target instead of something
 * found by tabbing past the title.
 */

export interface DetailPageProps {
  backLabel: string
  onBack: () => void
  /** The entity's name, rendered as the page's `<h1>`. */
  title: string
  /**
   * An InlineEdit of the entity's name, drawn beside the `<h1>` as PageHeader draws one, with
   * `title` as its `value` and `size="lg"`. The page hands it `valueHidden`. The app gives it its
   * label, its handlers and, for a save that waits for a server, `editing`, `pending` and `error`.
   */
  titleEdit?: ReactElement<{ valueHidden?: boolean }>
  /** The identity row, such as Badges, an Avatar and timestamps. */
  meta?: ReactNode
  /** Header actions under PageHeader's law: at most one solid button, and destructive actions in a Menu. */
  actions?: ReactNode
  /**
   * A full-width `Tabs` as the tabbed body.
   *
   * Use either `tabs` or `children`, not both. A Tabs renders its own panels,
   * so a page with both would show the tab content and then the children below
   * it.
   */
  tabs?: ReactNode
  /** Stat and meta Cards, and when omitted the body is one column. */
  aside?: ReactNode
  /**
   * Keeps the aside in view while the main column scrolls, at the widths where
   * it is beside the main column. It is never taller than the visible box and
   * scrolls inside itself when it is longer. Default `false`: the aside
   * scrolls with the page.
   */
  stickyAside?: boolean
  /** The plain body, omitted when `tabs` provides it. */
  children?: ReactNode
}

export function DetailPage({
  backLabel,
  onBack,
  title,
  titleEdit,
  meta,
  actions,
  tabs,
  aside,
  stickyAside = false,
  children,
}: DetailPageProps) {
  // A server component may have passed the InlineEdit, and it is cloned below.
  const edit = useSupplied(titleEdit)
  const heading = <h1 className={styles.title}>{title}</h1>
  return (
    <div className={styles.page} {...memberAttr('DetailPage')}>
      <div className={styles.back}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          icon="back"
          label={backLabel}
          onClick={onBack}
        />
      </div>

      <div className={styles.header}>
        <div className={styles.identity}>
          {edit === undefined ? (
            heading
          ) : (
            // PageHeader's title row (`page-header.md`): the InlineEdit is beside the `<h1>` and
            // never inside it, and the page hands it `valueHidden`, because the `<h1>` draws it.
            <div className={styles.titleRow}>
              {heading}
              <div className={styles.titleEdit}>{cloneElement(edit, { valueHidden: true })}</div>
            </div>
          )}
          {meta === undefined ? null : <div className={styles.meta}>{meta}</div>}
        </div>
        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>

      {tabs}

      {/* The aside is a column, not a sidebar. It scrolls with the page,
          because readers lose their place with two independent scroll regions
          on one screen. With `stickyAside` it stays in view beside the main
          column instead, and scrolls inside itself only when it is longer
          than the visible box (`detail-page.md`).

          The body is skipped when the tabs are the body and there is no
          aside, because an empty grid row still adds a gutter. */}
      {children === undefined && aside === undefined ? null : (
        <div
          className={styles.body}
          data-aside={aside === undefined ? undefined : ''}
          data-sticky-aside={aside !== undefined && stickyAside ? '' : undefined}
        >
          <div className={styles.main}>{children}</div>
          {aside === undefined ? null : <div className={styles.aside}>{aside}</div>}
        </div>
      )}
    </div>
  )
}
