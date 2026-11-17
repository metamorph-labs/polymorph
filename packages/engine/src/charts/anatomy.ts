import type { TooltipIndicator } from './types'

/**
 * The shapes the chart frame's parts draw from (`docs/charts.md`): an axis's
 * ticks, a tooltip's rows and the table twin's columns. The engine computes
 * them and every framework's frame renders them, so a tick's position and a
 * readout's text are decided once.
 */

export interface AxisTick {
  /** A stable key: the tick's value, so a renderer does not re-key when the label changes. */
  key: string
  /**
   * Distance from the axis's start, in px: down the block axis for `y`, along
   * the inline axis for `x`. The member computes it from the scale.
   */
  at: number
  label: string
  /**
   * Which end of the label sits on `at`, on an axis that runs along the inline
   * axis. Absent, the label is centred on `at`. A label that centred would be
   * drawn past an end of the plot is anchored at that end instead: `start` at
   * the plot's start, `end` at its end.
   */
  align?: 'start' | 'end'
}

export interface ChartTooltipRow {
  key: string
  label: string
  /** Pre-formatted by the caller, because `format.ts` owns every string a chart prints. */
  value: string
  /** A `var(--pm-chart-N)` reference, not a colour. */
  paint: string
}

export interface ChartTwinColumn {
  key: string
  label: string
  /** Right-aligned with tabular figures, for numeric chart values. */
  numeric?: boolean
}

/** The tooltip at a reading position, positioned within the plot. */
export interface ChartTooltipDrawing {
  /** The x label, such as a date or category; absent when the member's `hideLabel` is set. */
  header?: string
  rows: ChartTooltipRow[]
  /** The row key's shape. There is no `dashed`, because dashing reads as a projection. */
  indicator: TooltipIndicator
  /** Position within the plot, in px. The stylesheet keeps it inside the frame. */
  x: number
  y: number
  /**
   * Which side of the reading position to sit on. The member flips it near the
   * plot's inline end so the readout never leaves the frame.
   */
  side: 'start' | 'end'
}

/** What a chart shows at a reading position. */
export interface ChartReadout {
  /** One row per series at the position; empty when nothing is read. */
  rows: ChartTooltipRow[]
  /** What the live region says: a sentence, not the tooltip's layout. */
  announcement: string
  /** The tooltip, or `null` when it does not show. */
  tooltip: ChartTooltipDrawing | null
}
