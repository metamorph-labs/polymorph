import { CHART_SEQ_STEPS, type ChartSeqStep } from '@polymorph/theme'

import { formatValue, type NotationMessages } from './format'
import { estimateTextWidth, labelCapacity } from './geometry'
import { binOf, signedAmplitude, signedBinOf, thinLabels, valueExtent } from './scales'
import type { ChartDatum, ChartXAxis, ValueFormat } from './types'
import type { AxisTick } from './anatomy'
import { anchorAtEnds, ESTIMATED_AXIS_TEXT_PX } from './cartesian'
import type { MeasuredBox } from './measured-box'

/**
 * Band × band grid geometry for `Heatmap`.
 *
 * It is separate from `cartesian.ts` because a heatmap has no value *axis*. Its
 * measure is shown by colour, not length, so there are no ticks to place, no
 * zero to anchor and no domain to `nice()`. Instead there is a grid of equal
 * cells and a quantisation.
 *
 * **The gaps form the grid.** Cells are laid out with a 2px surface gap on both
 * axes and nothing is drawn between them. A gridline over filled cells would
 * compete with the data it is meant to organise.
 */

/** Touching marks are separated by a surface-coloured gap, never by a stroke. */
export const CELL_GAP_PX = 2

/** The minimum space between two band labels, so they do not read as one. */
const LABEL_GAP_PX = 12

export interface GridCell {
  /** The pair of band labels this cell sits at, stable across re-renders. */
  key: string
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
  /** `null` for an absent measurement, which is drawn as surface. */
  value: number | null
  /**
   * The emitted sequential step 1–7 this value quantises to. `null` when the
   * cell is absent, or when the grid is signed and the cell uses `arm`.
   */
  step: ChartSeqStep | null
  /**
   * The arm for a signed value: `signedBinOf`'s signed integer, `-3..-1` below
   * zero, `0` for **exactly zero** (the mid colour), and `1..3` above. `null`
   * when absent, or when the grid is unsigned and uses `step` instead.
   */
  arm: number | null
}

export interface GridGeometry {
  /** x band labels, in first-seen order, because the chart never reorders. */
  columns: readonly string[]
  /** y band labels, top-down in first-seen order. */
  rows: readonly string[]
  cellWidth: number
  cellHeight: number
  /** Row-major: every position in the grid, present or not. */
  cells: readonly GridCell[]
  columnTicks: AxisTick[]
  rowTicks: AxisTick[]
  /** The extent the ramp covers: the sequential scale legend's two bounds. */
  extent: readonly [number, number]
  /**
   * Whether the measure is signed. **Signed data uses diverging colours
   * automatically**, as in BarChart, with no prop. True when any measurement
   * is below zero.
   */
  signed: boolean
  /**
   * The symmetric range's half-width when signed: `[-A, +A]`,
   * `A = max(|lo|, |hi|)`, so equal magnitudes get equally strong colours even
   * when one side has no values. `0` when the grid is unsigned.
   */
  amplitude: number
}

export interface GridInput {
  data: readonly ChartDatum[]
  x: ChartXAxis
  /** The y band's field. Rows are ordered by first appearance in the data. */
  yKey: string
  /** The measure's field. */
  valueKey: string
  locale: string | undefined
  /** The catalog's notation; the host words a dated column at quarter granularity. */
  messages: NotationMessages
  plot: MeasuredBox | null
}

/**
 * A cell's identity: the pair of band labels it sits at.
 *
 * Encoded, not concatenated, because a label could contain any separator.
 * "a b" × "c" and "a" × "b c" are different cells that concatenation would
 * merge.
 */
const pairKey = (column: string, band: string) => JSON.stringify([column, band])

/** A band value as printed. `null` is a band with an empty name, not a missing row. */
const bandLabel = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** The bands a column contributes, in first-seen order. */
function bandOf(data: readonly ChartDatum[], key: string): string[] {
  const seen = new Set<string>()
  const domain: string[] = []
  for (const row of data) {
    const label = bandLabel(row[key])
    if (seen.has(label)) continue
    seen.add(label)
    domain.push(label)
  }
  return domain
}

/** The size of one cell after the gaps are subtracted from the length. */
function cellSize(length: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, (length - CELL_GAP_PX * (count - 1)) / count)
}

/**
 * The grid for one measured plot.
 *
 * `null` before the first measurement, like `cartesianGeometry`. The frame is
 * already at full height with its axes and twin in place, so nothing reflows
 * when the measurement arrives.
 */
export function gridGeometry(input: GridInput): GridGeometry | null {
  const { data, x, yKey, valueKey, locale, messages, plot } = input
  if (plot === null || plot.width <= 0 || plot.height <= 0) return null

  const columns = bandOf(data, x.key)
  const rows = bandOf(data, yKey)
  if (columns.length === 0 || rows.length === 0) return null

  const cellWidth = cellSize(plot.width, columns.length)
  const cellHeight = cellSize(plot.height, rows.length)
  const extent = valueExtent(data, valueKey)
  /*
   * Signed when any value is below zero. `valueExtent` returns `[0, 1]` for a
   * grid with no measurements, which is unsigned, so an empty grid shows no
   * polarity.
   */
  const signed = extent[0] < 0
  const amplitude = signed ? signedAmplitude(extent) : 0

  /*
   * One pass over the data into a lookup, instead of a scan per cell. A
   * fortnight of daily columns is a couple of hundred cells, and a scan per
   * cell would be quadratic. The first row for a pair wins, because the chart
   * never reorders.
   */
  const measured = new Map<string, number | null>()
  for (const row of data) {
    const at = pairKey(bandLabel(row[x.key]), bandLabel(row[yKey]))
    if (measured.has(at)) continue
    const value = row[valueKey]
    measured.set(at, typeof value === 'number' && Number.isFinite(value) ? value : null)
  }

  const cells: GridCell[] = []
  rows.forEach((band, row) => {
    columns.forEach((column, at) => {
      /*
       * Absent and present cells are both grid positions. An absent cell draws
       * nothing (surface, never bin 1), and a reader can still arrow to it and
       * hear "no data".
       */
      const value = measured.get(pairKey(column, band)) ?? null
      /*
       * One quantisation per grid, never both. An unsigned grid bins onto the
       * sequential ramp. A signed grid uses the arms around the mid, over the
       * symmetric range: also seven steps, showing polarity.
       */
      const bin = signed || value === null ? null : binOf(value, extent, CHART_SEQ_STEPS.length)
      cells.push({
        key: pairKey(column, band),
        column: at,
        row,
        x: at * (cellWidth + CELL_GAP_PX),
        y: row * (cellHeight + CELL_GAP_PX),
        width: cellWidth,
        height: cellHeight,
        value,
        step: bin === null ? null : ((bin + 1) as ChartSeqStep),
        arm: signed && value !== null ? signedBinOf(value, amplitude) : null,
      })
    })
  })

  /*
   * Labels are never rotated or clipped, so both axes drop whole labels at an
   * even stride once they stop fitting: by width along the top, by line boxes
   * down the side, as on a horizontal bar chart.
   */
  const widest = columns.reduce(
    (most, text) =>
      Math.max(
        most,
        estimateTextWidth(formatValue(text, x.format, locale, messages), ESTIMATED_AXIS_TEXT_PX),
      ),
    0,
  )
  const columnsKept = new Set(thinLabels(columns, labelCapacity(plot.width, widest, LABEL_GAP_PX)))
  const rowsKept = new Set(
    thinLabels(rows, labelCapacity(plot.height, ESTIMATED_AXIS_TEXT_PX * 1.5, 0)),
  )

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    cells,
    extent,
    signed,
    amplitude,
    columnTicks: anchorAtEnds(
      columns
        .map((column, at) => ({ column, at }))
        .filter((entry) => columnsKept.has(entry.column))
        .map((entry) => ({
          key: entry.column,
          at: entry.at * (cellWidth + CELL_GAP_PX) + cellWidth / 2,
          label: formatValue(entry.column, x.format, locale, messages),
        })),
      plot.width,
      LABEL_GAP_PX,
    ),
    rowTicks: rows
      .map((band, at) => ({ band, at }))
      .filter((entry) => rowsKept.has(entry.band))
      .map((entry) => ({
        key: entry.band,
        at: entry.at * (cellHeight + CELL_GAP_PX) + cellHeight / 2,
        label: entry.band,
      })),
  }
}

/** The cell at a grid position, or `undefined` past the edge. */
export function cellAt(geometry: GridGeometry, row: number, column: number): GridCell | undefined {
  if (row < 0 || column < 0 || row >= geometry.rows.length || column >= geometry.columns.length) {
    return undefined
  }
  return geometry.cells[row * geometry.columns.length + column]
}

/**
 * The twin rows: a row per y and a column per x, the same grid the plot draws,
 * as a real table.
 *
 * The ramp's light steps are under 3:1 against the surface, which the palette
 * law accepts *because* this table exists (the accessibility rules,
 * `docs/charts.md`). It is the relief channel, not an extra.
 */
export function gridTwinRows(
  geometry: GridGeometry,
  format: ValueFormat | undefined,
  locale: string | undefined,
): string[][] {
  return geometry.rows.map((band, row) => [
    band,
    ...geometry.columns.map((_, column) => {
      const cell = cellAt(geometry, row, column)
      return cell === undefined || cell.value === null
        ? ''
        : formatValue(cell.value, format, locale)
    }),
  ])
}
