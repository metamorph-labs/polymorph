import { cloneElement, type ReactElement, type ReactNode } from 'react'

import { Inline } from '../layout/Inline'
import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/page-header.module.css'

/**
 * Title, description and actions at the top of a working page (`design/components/page-header.md`).
 *
 * No size, variant or tone: page headers are uniform by law. `title` renders the
 * page's only `<h1>`, so AppShell has none and the archetypes rely on this one.
 *
 * The API carries the hierarchy law: `actions` takes at most one `solid`
 * Button, secondary actions are `outline` or `ghost`, and destructive actions
 * go behind the overflow or on the entity's own surface, not here.
 *
 * `titleEdit` is an InlineEdit beside the `<h1>`, never inside it, because a
 * control inside a heading joins the heading's name. The `<h1>` keeps the saved
 * title while the field is open, visually hidden, so the page's title is still
 * found among its headings. PageHeader adds no handler: the save is carried by
 * the InlineEdit's own events in every framework.
 */

export interface PageHeaderProps {
  title: string
  /**
   * An InlineEdit of the title, drawn beside the `<h1>`, with `title` as its `value` and `size="lg"`.
   * PageHeader hands it `valueHidden`, because the `<h1>` draws the value. The app gives it its
   * label, its handlers and, for a save that waits for a server, `editing`, `pending` and `error`.
   */
  titleEdit?: ReactElement<{ valueHidden?: boolean }>
  description?: string
  /** Vocabulary controls only: one primary, and the rest less prominent. */
  actions?: ReactNode
}

export function PageHeader({ title, titleEdit, description, actions }: PageHeaderProps) {
  const heading = <h1 className={styles.title}>{title}</h1>
  return (
    <header className={styles.header} {...memberAttr('PageHeader')}>
      <div className={styles.text}>
        {titleEdit === undefined ? (
          heading
        ) : (
          <div className={styles.titleRow}>
            {heading}
            {/* The `<h1>` draws the value, so the InlineEdit draws only its controls. */}
            <div className={styles.titleEdit}>{cloneElement(titleEdit, { valueHidden: true })}</div>
          </div>
        )}
        {description === undefined ? null : <p className={styles.description}>{description}</p>}
      </div>

      {actions === undefined ? null : (
        <Inline gap={3} wrap>
          {actions}
        </Inline>
      )}
    </header>
  )
}
