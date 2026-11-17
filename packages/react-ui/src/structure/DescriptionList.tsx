import type { ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/structure/description-list.module.css'

/**
 * Label and value pairs describing one entity (`design/components/description-list.md`).
 * For example a ticket's metadata in a DetailPage aside. Semantic
 * `<dl>`/`<dt>`/`<dd>`, with no substrate and no client directive, because
 * nothing is interactive.
 *
 * It describes **one** thing. A Table compares many, with `numeric` columns, and
 * a row with a control is a SettingsRow. Read-only, like Timeline, but for facts.
 */

export interface DescriptionListItem {
  /** A label is always text, so this is a string. */
  term: string
  /**
   * Often a vocabulary member, such as a Badge for status or a Link for
   * reporter. Plain strings get the detail style and components keep their own
   * (Accordion's rule). A detail that needs columns has outgrown the list.
   */
  detail: ReactNode
}

export type DescriptionListOrientation = 'vertical' | 'horizontal'

export interface DescriptionListProps {
  /** Rendered in the order given (Stat's rule: sorting is data logic). */
  items: DescriptionListItem[]
  /**
   * `vertical` (default) stacks term over detail and works at any width, as in
   * Timeline, because metadata often sits in a narrow aside. `horizontal` puts a
   * term column beside the details.
   */
  orientation?: DescriptionListOrientation
}

export function DescriptionList({ items, orientation = 'vertical' }: DescriptionListProps) {
  // An empty list renders nothing, and EmptyState covers that case, as in Timeline.
  if (items.length === 0) return null

  return (
    <dl className={styles.root} data-orientation={orientation} {...memberAttr('DescriptionList')}>
      {items.map((item, index) => (
        // The per-pair <div> is valid inside <dl> and keeps term and detail
        // together as one grid row or stacked block. One <dt> per <dd>: grouped
        // terms are valid HTML but unneeded, so `items` stays a flat array.
        <div className={styles.pair} key={index}>
          <dt className={styles.term}>{item.term}</dt>
          <dd className={styles.detail}>{item.detail}</dd>
        </div>
      ))}
    </dl>
  )
}
