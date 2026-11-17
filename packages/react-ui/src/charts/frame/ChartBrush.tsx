import { brushDrawing } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-brush.module.css'

/*
 * No `'use client'`: this draws a range from props, with no hook and no
 * handler. The stateful part is `use-brush.ts`, which the member uses.
 */

/**
 * Draws the brush (the interaction rules in `docs/charts.md`): the active or
 * committed range, filled from `SELECTION_ROLES` with a 1px
 * `--pm-selection-border` edge. It adds no tokens, because a chart's selected
 * range is the same state as a selected row.
 *
 * Drawn *under* the marks, after the grid. A wash over the strokes would mute
 * the data the reader just selected. Only the range's two boundaries get edges;
 * the top and bottom belong to the plot.
 */

export interface ChartBrushProps {
  /** One end of the range along the x axis, in px; `from` and `to` may be in either order. */
  from: number
  to: number
  height: number
}

export function ChartBrush({ from, to, height }: ChartBrushProps) {
  const range = brushDrawing(from, to, height)
  return (
    <g className={styles.brush}>
      <rect className={styles.range} x={range.x} y={0} width={range.width} height={range.height} />
      <path className={styles.edge} d={range.near} />
      <path className={styles.edge} d={range.far} />
    </g>
  )
}
