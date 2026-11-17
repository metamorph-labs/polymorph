import {
  chartDivergingRole,
  chartSeqRole,
  cssVar,
  type ChartDivergingArmStep,
} from '@polymorph/theme'

import type { AxisTick, ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { formatValue } from './format'
import { BAR_END_RADIUS, HIT_TARGET_MIN } from './geometry'
import {
  CELL_GAP_PX,
  cellAt,
  gridGeometry,
  gridTwinRows,
  type GridCell,
  type GridGeometry,
} from './grid'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_GRID_MESSAGES, spokenSummary } from './messages'
import type { ReadingPosition, ReadingView } from './reading'
import {
  chartState,
  type ChartDatum,
  type ChartMessages,
  type ChartState,
  type ChartTooltipConfig,
  type ChartXAxis,
  type ValueFormat,
} from './types'

/**
 * Heatmap's drawing (`design/components/heatmap.md`): everything the member
 * shows that follows from its props and the measured plot, and what it shows
 * at a reading position. Every framework's Heatmap renders it, so the grid,
 * the quantisation, the cells' colours, the scale legend's bounds and the
 * readout's words are decided once.
 *
 * The grid is the engine's band × band geometry (`gridGeometry`). Values
 * quantise to the seven emitted steps, never to a colour between two of them.
 * **Signed data switches to diverging colours automatically**: the symmetric
 * range `[-A, +A]`, the arms around `--pm-chart-mid`, and the mid only at
 * exactly zero. There are no series, so the scale legend replaces the series
 * legend, and the reading's second coordinate walks the rows.
 */

export interface HeatmapYAxis {
  key: string
  label?: string
}

export interface HeatmapValue {
  key: string
  format?: ValueFormat
}

export interface HeatmapInput {
  data: readonly ChartDatum[]
  x: ChartXAxis
  y: HeatmapYAxis
  value: HeatmapValue
  /** The chart's accessible name. */
  label: string
  locale?: string | undefined
  messages?: ChartMessages | undefined
  /** The tooltip's configuration; it shapes the readout and not the marks. */
  tooltip?: ChartTooltipConfig | false | undefined
  loading?: boolean | undefined
  /** Whether the member has an `onSelect`: the summary then says the plot responds to Enter. */
  selectable?: boolean | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One drawn cell: a measurement, painted with its step or its arm. */
export interface HeatmapCell {
  key: string
  /** The cell's column, the reading's index. */
  column: number
  /** The cell's row, the reading's second coordinate. */
  row: number
  x: number
  y: number
  width: number
  height: number
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-cell`. */
  paint: string
}

/**
 * One grid position's pointer target: the cell plus its gaps, at least the
 * minimum hit size. Every position has one, present or absent, so a pointer
 * over a hole in the grid gets the same "no data" a keyboard user hears.
 */
export interface HeatmapHit {
  key: string
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
}

/** The plot at its measured size. */
export interface HeatmapPlot {
  width: number
  height: number
  /** The cells' corner radius, the engine's `BAR_END_RADIUS`, so a cell's corners match a bar's data end. */
  radius: number
  /** The cells with a measurement. An absent cell draws nothing and shows the surface. */
  cells: HeatmapCell[]
  hits: HeatmapHit[]
}

/** The scale legend: which ramp it draws, and the extent it covers, formatted. */
export interface HeatmapScale {
  /** `diverging` on a signed grid, with three labels; `sequential` otherwise, with two. */
  variant: 'sequential' | 'diverging'
  min: string
  /** The centre label, which only the diverging variant draws. */
  zero: string
  max: string
}

export interface HeatmapModel {
  state: ChartState
  /** The grid, or `null` before the plot is measured and when there are no rows. */
  grid: GridGeometry | null
  /** The x band labels, which the reading's index walks; empty without a grid. */
  columns: readonly string[]
  /** The y band labels, which the reading's second coordinate walks; empty without a grid. */
  rows: readonly string[]
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use. Heatmap's props have none, so the list is empty. */
  warnings: string[]
  /** Whether the scale legend shows: only over a measured extent. */
  legend: boolean
  scale: HeatmapScale
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /** The tick labels of the two band axes, or `null` without a grid. */
  axes: { y: AxisTick[]; x: AxisTick[] } | null
  /** The cells and the pointer targets, or `null` before the plot is measured. */
  plot: HeatmapPlot | null
}

/**
 * The colour token for a quantised cell. On a signed grid it is the cell's arm
 * (`0` is `--pm-chart-mid`, exactly zero); otherwise it is the sequential step.
 * An absent cell gets `null` and shows the surface. The marks and the tooltip
 * key use this mapping; the scale legend draws the emitted steps directly.
 */
function cellPaint(cell: GridCell): string | null {
  if (cell.arm !== null) {
    if (cell.arm === 0) return cssVar('chart.mid')
    const step = Math.min(3, Math.abs(cell.arm)) as ChartDivergingArmStep
    return cssVar(chartDivergingRole(cell.arm > 0 ? 'pos' : 'neg', step))
  }
  return cell.step === null ? null : cssVar(chartSeqRole(cell.step))
}

export function heatmapModel(input: HeatmapInput): HeatmapModel {
  const {
    data,
    x,
    y,
    value,
    label,
    locale,
    messages = DEFAULT_GRID_MESSAGES,
    loading = false,
    selectable = false,
    box,
  } = input
  const state = chartState(data, loading)
  const grid = gridGeometry({
    data,
    x,
    yKey: y.key,
    valueKey: value.key,
    locale,
    messages,
    plot: box,
  })

  /*
   * The ramp legend shows only when the extent was measured, which is not the
   * same as "there is data". A grid whose every value is `null` has cells but
   * no extent, and a legend reading 0 to 1 over it would show a range that was
   * never measured. This is the same fault as an axis over no values.
   */
  const measured =
    grid !== null && grid.cells.some((cell) => cell.step !== null || cell.arm !== null)

  /*
   * The signed legend uses the symmetric range's bounds, not the data's. The
   * arms are binned against `[-A, +A]` even when one side has no values, so
   * equal magnitudes get equally strong colours.
   */
  const scale: HeatmapScale = {
    variant: grid?.signed ? 'diverging' : 'sequential',
    min: formatValue(grid?.signed ? -grid.amplitude : (grid?.extent[0] ?? 0), value.format, locale),
    zero: formatValue(0, value.format, locale),
    max: formatValue(grid?.signed ? grid.amplitude : (grid?.extent[1] ?? 0), value.format, locale),
  }

  /*
   * The axis names are not drawn, which is the tier's default. On a grid the
   * name would sit at the axis's end, where a band label already is, so "Jul
   * 14" and "Date" would overlap. The names head the twin's first column
   * instead.
   */
  const axes = grid === null || state === 'empty' ? null : { y: grid.rowTicks, x: grid.columnTicks }

  let plot: HeatmapPlot | null = null
  if (grid !== null && box !== null) {
    const cells: HeatmapCell[] = []
    const hits: HeatmapHit[] = []
    for (const cell of grid.cells) {
      /*
       * An absent cell draws nothing and shows the surface, never bin 1. The
       * lightest step means a measurement of almost nothing, which is not the
       * same as no measurement.
       */
      const paint = cellPaint(cell)
      if (paint !== null) {
        cells.push({
          key: cell.key,
          column: cell.column,
          row: cell.row,
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          paint,
        })
      }
      // The pointer target: the cell plus its gaps, at least the minimum hit size.
      const width = Math.max(cell.width + CELL_GAP_PX, HIT_TARGET_MIN)
      const height = Math.max(cell.height + CELL_GAP_PX, HIT_TARGET_MIN)
      hits.push({
        key: cell.key,
        column: cell.column,
        row: cell.row,
        x: cell.x + cell.width / 2 - width / 2,
        y: cell.y + cell.height / 2 - height / 2,
        width,
        height,
      })
    }
    plot = { width: box.width, height: box.height, radius: BAR_END_RADIUS, cells, hits }
  }

  return {
    state,
    grid,
    columns: grid?.columns ?? [],
    rows: grid?.rows ?? [],
    /*
     * The summary gives the grid's shape, not a count of measurements. "42
     * cells" over a mostly absent fortnight is not useful, and the shape tells
     * a reader whether to open the table.
     */
    summary: spokenSummary(
      messages.heatmapSummary({
        label,
        grid: grid === null ? undefined : { rows: grid.rows.length, columns: grid.columns.length },
      }),
      messages,
      selectable,
    ),
    warnings: [],
    legend: state !== 'empty' && measured,
    scale,
    twin: {
      columns: [
        { key: '__y', label: y.label ?? '' },
        ...(grid?.columns ?? []).map((column) => ({
          key: column,
          label: formatValue(column, x.format, locale, messages),
          numeric: true,
        })),
      ],
      rows: grid === null ? [] : gridTwinRows(grid, value.format, locale),
    },
    axes,
    plot,
  }
}

/**
 * What the chart shows at a reading position: the read cell's row, the live
 * region's sentence ("x, y: value") and the tooltip at the cell's centre.
 *
 * The position is a cell: `index` is its column and `series` its row, so
 * Left/Right walk x and Up/Down walk y. An absent cell reads as the catalog's
 * `noData`, in both the tooltip and the sentence. `tooltip: false` removes only
 * the visual layer: the announcement stays.
 */
export function heatmapReadout(
  input: HeatmapInput,
  model: HeatmapModel,
  view: ReadingView,
): ChartReadout {
  const { x, value, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_GRID_MESSAGES
  const read =
    model.grid === null || view.index === null
      ? undefined
      : cellAt(model.grid, view.series ?? 0, view.index)
  if (read === undefined) return { rows: [], announcement: '', tooltip: null }

  const column = formatValue(model.columns[read.column] ?? '', x.format, locale, messages)
  const row = model.rows[read.row] ?? ''
  /** The cell's text in both readouts. An absent measurement shows the no-data message. */
  const shown =
    read.value === null ? messages.noData : formatValue(read.value, value.format, locale)
  const rows: ChartTooltipRow[] = [
    {
      key: read.key,
      label: row,
      value: shown,
      // The cell's step or arm, so the readout's key matches the colour on screen.
      paint: cellPaint(read) ?? cssVar('chart.other'),
    },
  ]
  const centre = read.x + read.width / 2
  return {
    rows,
    announcement: `${column}, ${row}: ${shown}`,
    tooltip:
      tooltip === false || !view.active || box === null
        ? null
        : {
            ...(tooltip.hideLabel ? {} : { header: column }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            x: centre,
            y: read.y + read.height / 2,
            side: centre > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the read cell's column, row and
 * value. An absent cell reports nothing, because the payload's `value` must be
 * a number, and so does a position off the grid. `null` when nothing is read.
 */
export function heatmapSelection(
  _input: HeatmapInput,
  model: HeatmapModel,
  at: ReadingPosition,
): { x: string | number; y: string | number; value: number } | null {
  if (model.grid === null || at.index === null) return null
  const cell = cellAt(model.grid, at.series ?? 0, at.index)
  if (cell === undefined || cell.value === null) return null
  return {
    x: model.grid.columns[cell.column] ?? '',
    y: model.grid.rows[cell.row] ?? '',
    value: cell.value,
  }
}
