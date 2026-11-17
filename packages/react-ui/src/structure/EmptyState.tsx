import type { ReactNode } from 'react'

import { Icon, type IconRole, memberAttr } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import styles from '@polymorph/recipes/structure/empty-state.module.css'

/**
 * The mandatory message for a view with nothing to show (`design/components/empty-state.md`).
 *
 * One design for first run, filtered to zero and error-empty: in each, what the
 * reader came for is missing and something should say what to do next.
 *
 * The icon well stays muted even for `icon="error"`. A status colour would look
 * alarming, and the title already says what went wrong.
 */

export interface EmptyStateProps {
  icon?: IconRole
  /** Describes the situation, such as "No tickets yet" rather than "Empty". */
  title: string
  /** What to do about it. */
  description?: string
  /** One Button, `soft`/`accent` by convention, so the page's own primary stays primary. */
  action?: ReactNode
  /** A `ghost` Button, such as "Clear filters". */
  secondaryAction?: ReactNode
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  const hasActions = action !== undefined || secondaryAction !== undefined

  return (
    <div className={styles.empty} {...memberAttr('EmptyState')}>
      <span className={styles.well}>
        <Icon name={icon} size="lg" />
      </span>

      <h2 className={styles.title}>{title}</h2>
      {description === undefined ? null : <p className={styles.description}>{description}</p>}

      {hasActions ? (
        <div className={styles.actions}>
          <Inline gap={3} wrap justify="center">
            {action}
            {secondaryAction}
          </Inline>
        </div>
      ) : null}
    </div>
  )
}
