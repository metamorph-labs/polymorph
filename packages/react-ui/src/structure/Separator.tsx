import { memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/structure/separator.module.css'

/**
 * A thin line that divides content (`design/components/separator.md`).
 *
 * Used sparingly, and the API enforces it: no `spacing` prop and no margin. The
 * parent owns the gap, so a separator never disturbs a Stack's rhythm, and one
 * used where a gap would do looks visibly worse.
 *
 * The labelled divider ("OR" between an auth form and its providers) is
 * horizontal only, enforced by the type.
 */

export type SeparatorOrientation = 'horizontal' | 'vertical'

export type SeparatorProps =
  | {
      /** Vertical needs a sized flex row to stretch inside. */
      orientation?: SeparatorOrientation
      label?: undefined
    }
  | {
      orientation?: 'horizontal'
      /** The divider's text, rendered as given; the caller chooses the case, as in "OR". */
      label: string
    }

export function Separator({ orientation = 'horizontal', label }: SeparatorProps) {
  if (label !== undefined) {
    return (
      // Not decorative. The word is content and is read out. The rules on either
      // side are borders, which screen readers do not announce.
      <div className={styles.labelled} data-orientation="horizontal" {...memberAttr('Separator')}>
        <span className={styles.rule} />
        <span className={styles.label}>{label}</span>
        <span className={styles.rule} />
      </div>
    )
  }

  return (
    // Decorative, because the line only shows a grouping the DOM already has.
    // Menu's separators are semantic and come from Radix instead.
    <div
      className={styles.separator}
      data-orientation={orientation}
      aria-hidden="true"
      {...memberAttr('Separator')}
    />
  )
}
