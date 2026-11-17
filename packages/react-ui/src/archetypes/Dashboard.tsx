import type { ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import { Card } from '../structure/Card'
import { PageHeader, type PageHeaderProps } from '../structure/PageHeader'
import { Stat, type StatProps } from '../structure/Stat'
import styles from '@polymorph/recipes/archetypes/dashboard.module.css'

/**
 * The overview screen (`design/archetypes/dashboard.md`).
 *
 * It is deliberately not a widget canvas. The regions are named and fixed. A
 * product that needs free-form layout needs the deferred builder, not an
 * archetype, because an archetype with a negotiable layout is not an
 * archetype.
 *
 * The stat row takes data, not nodes, so it stays a row of stats. With
 * `children`, it would soon also hold a chart, and then the grid would need
 * spans.
 */

export interface DashboardProps {
  title: string
  /**
   * PageHeader's: an InlineEdit of the title, for an overview of one thing the reader names, such
   * as an environment.
   */
  titleEdit?: PageHeaderProps['titleEdit']
  description?: string
  /** Header actions, which most dashboards do not have because they only display data. */
  actions?: ReactNode
  /** Two to four stats, because more than four belong in a table. */
  stats?: StatProps[]
  /** The main column. */
  primary: ReactNode
  /** The narrow column. Omit and `primary` spans the full width. */
  secondary?: ReactNode
}

export interface DashboardPanelProps {
  /** Rendered as an `h2` with the system's section-heading recipe. */
  title?: string
  children: ReactNode
}

/**
 * A named region. It is part of the archetype, because naming a region should
 * be built in, not improvised. Its title is Card's `title`, so the
 * section-heading recipe is written once, in Card's recipe.
 */
function Panel({ title, children }: DashboardPanelProps) {
  return <Card title={title}>{children}</Card>
}

function DashboardRoot({
  title,
  titleEdit,
  description,
  actions,
  stats,
  primary,
  secondary,
}: DashboardProps) {
  return (
    <div className={styles.page} {...memberAttr('Dashboard')}>
      <PageHeader title={title} titleEdit={titleEdit} description={description} actions={actions} />

      {stats === undefined || stats.length === 0 ? null : (
        // The count sets the columns, so two stats do not sit in a four-column
        // grid with two empty cells.
        <div className={styles.stats} data-count={String(stats.length)}>
          {stats.map((stat) => (
            <Card key={stat.label}>
              <Stat {...stat} />
            </Card>
          ))}
        </div>
      )}

      <div className={styles.body} data-secondary={secondary === undefined ? undefined : ''}>
        <div className={styles.primary}>{primary}</div>
        {secondary === undefined ? null : <div className={styles.secondary}>{secondary}</div>}
      </div>
    </div>
  )
}

export const Dashboard = Object.assign(DashboardRoot, { Panel })
