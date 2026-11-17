import { memberAttr, sparklineGeometry } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/sparkline.module.css'

/**
 * A small inline trend line beside a number (`design/components/sparkline.md`).
 *
 * It gives context for a number and is not a chart. It has no frame, axes,
 * legend, tooltip or table twin, and prints no numbers, because the Stat or
 * table cell around it shows the value. It is **not a small LineChart**. A
 * LineChart shows what happened; a Sparkline shows only the direction. Data
 * that needs inspecting belongs in a LineChart with its table.
 *
 * It is the only chart member without `'use client'`. It has no hooks, no
 * measurement and no handlers, so it can sit inside a server-rendered Stat
 * without making the Stat a client component.
 *
 * It is also the only chart scaled by `viewBox`. The tier's rule is to measure
 * width and never scale, because scaling distorts a chart's text, and a
 * Sparkline has no text. `vector-effect: non-scaling-stroke` keeps the stroke
 * at 2px through the scale; without it the stroke would still distort.
 */

export interface SparklineProps {
  /**
   * The values in chronological order, as the app supplies them; the
   * Sparkline never sorts. It is designed for about twelve points. `[]` or a
   * single point renders nothing, because a trend needs two.
   */
  data: readonly number[]
  /**
   * The accessible name, which should state the trend, e.g. "First response,
   * trending down". There is no table twin, so this is all a screen reader gets.
   */
  label: string
  /** `sm` matches the type scale (Stat rows, table cells); `md` suits a larger tile. */
  size?: 'sm' | 'md'
}

export function Sparkline({ data, label, size = 'sm' }: SparklineProps) {
  // The engine's drawing, which every framework's Sparkline renders: a non-finite entry is a
  // gap, not a zero, and fewer than two finite points draw nothing, because a single value is
  // the Stat's job and a lone dot would imply a shape the data does not have.
  const drawing = sparklineGeometry(data)
  if (drawing === null) return null
  const { end } = drawing

  return (
    <span
      className={styles.spark}
      data-size={size}
      role="img"
      aria-label={label}
      {...memberAttr('Sparkline')}
    >
      <svg
        className={styles.svg}
        viewBox={drawing.viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className={styles.line} d={drawing.d} />
        {/*
         * The dot marks the current period. It takes the accent and the line
         * does not, because the latest value is the point of interest.
         */}
        {end === null ? null : <circle className={styles.end} cx={end.x} cy={end.y} r={end.r} />}
      </svg>
    </span>
  )
}
