import type { CSSProperties } from 'react'

import type { ChartTooltipRow, TooltipIndicator } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-tooltip.module.css'

/*
 * No `'use client'`, on purpose. This renders a positioned box from props,
 * with no hook, no handler and no DOM reads. The *member* that decides the
 * reading position needs the directive; the readout does not. Adding one would
 * pull it and everything under it into the client bundle for no reason, and
 * the client-directive law checks both directions.
 */

/**
 * The chart tooltip (the interaction rules, `docs/charts.md`).
 *
 * **Not the overlay `Tooltip`, and not a portal**, for two reasons:
 *
 *  - The overlay Tooltip's hover delay is wrong for a tracking readout. A
 *    tooltip that appears after 700ms suits a control label; it is unusable for
 *    a value that follows the pointer.
 *  - A Radix portal would move the readout out of its frame. That breaks its
 *    positioning and puts a live surface outside the `figure` that assistive
 *    technology is reading.
 *
 * **The value comes first.** In the legend the label matters most and the
 * colour identifies it. Here the reader already knows the series and wants the
 * number, so the order is reversed: the value first, in `--pm-text-primary`
 * with tabular figures, then the label in secondary.
 *
 * Series names and formatted values are **data** and render as text nodes.
 */

export interface ChartTooltipProps {
  /** The x label, such as a date or category. `hideLabel` on the member removes it. */
  header?: string
  rows: readonly ChartTooltipRow[]
  /** The row key's shape. There is no `dashed`, because dashing reads as a projection. */
  indicator?: TooltipIndicator
  /** Position within the plot, in px. The stylesheet keeps it inside the frame. */
  x: number
  y: number
  /**
   * Which side of the reading position to sit on. The member flips it near the
   * plot's inline end so the readout never leaves the frame.
   */
  side?: 'start' | 'end'
}

export function ChartTooltip({
  header,
  rows,
  indicator = 'dot',
  x,
  y,
  side = 'end',
}: ChartTooltipProps) {
  if (rows.length === 0) return null

  return (
    <div
      className={styles.tooltip}
      data-indicator={indicator}
      data-side={side}
      style={{ '--pm-chart-tip-x': `${x}px`, '--pm-chart-tip-y': `${y}px` } as CSSProperties}
      /*
       * The pointer is already over the plot. A tooltip that could be hovered
       * would flicker as the pointer crossed it.
       */
      aria-hidden="true"
    >
      {header === undefined ? null : <p className={styles.header}>{header}</p>}
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.key} className={styles.row}>
            <span className={styles.key} style={{ '--pm-chart-key': row.paint } as CSSProperties} />
            <span className={styles.value}>{row.value}</span>
            <span className={styles.label}>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
