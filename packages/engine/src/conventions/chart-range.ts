import type { BrushMachine, BrushReading } from '../charts/brush'

/**
 * What an agent reads of a chart's brush, and how it builds a range, for
 * every LineChart and AreaChart in every renderer (the `## Agent` section of
 * each spec). A person builds a range with the pointer or with Shift and the
 * arrow keys, and commits it, and the chart reports it to `onBrushEnd`. An
 * agent's range goes through the same machine by the same keys, so
 * `onBrushEnd` receives what a person's committed range reports.
 *
 * The range is in row indexes, the unit the chart's reading position uses.
 */

/** What these read of a chart: its rows, whether it takes `onBrushEnd`, and whether it brushes. */
export interface ChartRangeSource {
  readonly walk: { readonly count: number }
  readonly input: { readonly brushable?: boolean }
  readonly model: { readonly brushOn: boolean }
}

/** The range a person sees drawn, as an agent reads it. */
export interface ChartRange {
  /** The row the range starts on, where it was begun; `null` while there is none. */
  readonly start: number | null
  /** The row the range ends on, its moving edge; `null` while there is none. */
  readonly end: number | null
}

/**
 * The range on screen: the row it was begun on and the row it ends on, in
 * the order it was built, whether it is committed or not. Both are `null`
 * while there is none, on a chart with no brush, and when the rows have
 * changed since it was built, as a render reads it.
 */
export function chartRange(
  source: Pick<ChartRangeSource, 'walk'>,
  brush: Pick<BrushMachine, 'state'>,
): ChartRange {
  const state = brush.state(source.walk.count)
  return state === null ? { start: null, end: null } : { start: state.anchor, end: state.edge }
}

/**
 * Builds a range that ends on `row` and commits it, as a person's keys do:
 * Shift and an arrow toward the row, once per row, and then Enter. The range
 * starts where a person's would: at the start of a range a person has begun
 * and not committed, else at the reading position, which an agent sets with
 * `readChartPosition`. With nothing read, the first Shift and arrow lands on
 * an end, the first row for a range that runs right and the last for one that
 * runs left, as the reading's first arrow does, and the range starts there.
 *
 * Throws, and presses nothing, for a chart with no brush (no `onBrushEnd`, or
 * an x the chart does not brush), for a number that is not a row, and for a
 * range that would start and end on one row, which a person cannot commit.
 */
export function brushChartRange(
  source: ChartRangeSource,
  row: number,
  brush: Pick<BrushMachine, 'state' | 'key'>,
  reading: BrushReading,
): void {
  const { count } = source.walk
  if (source.input.brushable !== true) {
    throw new Error('The chart has no brush, because it takes no onBrushEnd.')
  }
  if (!source.model.brushOn) {
    throw new Error('The chart has no brush, because its x is not one this chart brushes.')
  }
  if (!Number.isInteger(row) || row < 0 || row >= count) {
    throw new Error(
      count <= 0
        ? 'The chart has no rows to brush.'
        : `The chart's rows are 0 to ${count - 1}, and ${row} is not one of them.`,
    )
  }
  const at = reading.now().index
  const open = brush.state()
  const begun = open !== null && !open.committed ? open.anchor : null
  const right = at === null ? row > 0 : row > at
  const start = begun ?? at ?? (right ? 0 : count - 1)
  if (start === row) {
    throw new Error(
      `A range runs between two rows, and this one would start and end on row ${row}.`,
    )
  }
  const key = right ? 'ArrowRight' : 'ArrowLeft'
  // Each press moves the reading one row toward `row`, so the presses end within the rows.
  for (let pressed = 0; reading.now().index !== row && pressed <= count; pressed += 1) {
    if (!brush.key(key, true, reading)) break
  }
  if (!brush.key('Enter', false, reading)) {
    throw new Error(`The chart's brush did not commit a range ending on row ${row}.`)
  }
}
