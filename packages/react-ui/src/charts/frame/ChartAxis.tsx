import type { AxisTick } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-axis.module.css'

/**
 * The tick labels of a chart axis (`docs/charts.md`).
 *
 * The system default, set once here instead of per example: **muted tick text,
 * one zero-baseline stroke, hairline gridlines on the value axis only**. Chart
 * libraries often draw tick lines, an axis line and a vertical grid that each
 * example then turns off. Polymorph never draws them.
 *
 * Labels are HTML, not SVG `<text>`. An HTML span inherits the theme's numeric
 * font-feature settings, wraps and truncates by the same rules as the rest of
 * the vocabulary, and is read by assistive technology as text, not as a
 * graphic. The *marks* are SVG because they are geometry; the labels are HTML
 * because they are text.
 *
 * The member draws the gridlines into the plot's SVG, from the same tick
 * positions passed here, because a gridline belongs to the plot it crosses.
 */

export interface ChartAxisProps {
  orientation: 'x' | 'y'
  ticks: readonly AxisTick[]
  /**
   * The axis name, for when the unit is not obvious from the labels. It renders
   * as muted text beside the ticks. Most charts do not need one, because the
   * panel title usually covers it.
   */
  label?: string
}

export function ChartAxis({ orientation, ticks, label }: ChartAxisProps) {
  return (
    <div className={styles.axis} data-orientation={orientation} aria-hidden="true">
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className={styles.tick}
          data-align={tick.align}
          style={orientation === 'y' ? { top: `${tick.at}px` } : { left: `${tick.at}px` }}
        >
          {tick.label}
        </span>
      ))}
      {label === undefined ? null : <span className={styles.name}>{label}</span>}
    </div>
  )
}
