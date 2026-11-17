import type { ReadingOptions, ReadingPosition, ReadingView } from '../charts/reading'

/**
 * What an agent picks in a chart that takes `onSelect`, and how it picks one,
 * for every such chart in every renderer (the `## Agent` section of each
 * chart's spec).
 *
 * A chart draws its marks in an SVG hidden from the tree, and a person reaches
 * them through the plot's one focus stop: the arrow keys move the reading
 * position, the live region says what the position is on, and Enter reports
 * what `onSelect` reports there. So a mark an agent picks is a position the
 * keys reach, named by what a person hears there, and a pick moves the reading
 * to it and runs the chart's activation, the function Enter runs.
 *
 * A chart can hold hundreds of marks, and every snapshot an agent takes holds
 * the list. So the list is a window of at most `CHART_MARK_CAP` marks around
 * the reading position, and an agent moves the reading to bring other marks
 * into it, as a person moves it with the arrow keys.
 */

/**
 * The most marks a chart lists for an agent at once. A mark that names one
 * value costs about 40 to 60 bytes of a snapshot's JSON, so a full window is
 * about two kilobytes. A crosshair chart's mark names every series at its row,
 * so its window costs more in proportion.
 */
export const CHART_MARK_CAP = 40

/** One mark an agent can pick, as a `choices` state lists it. */
export interface ChartMarkChoice {
  readonly id: string
  readonly label: string
}

/** What a chart reads its marks from: the reading's walk and the chart's own engine functions. */
export interface ChartMarkSource<I, M> {
  /** The counts and the walk the chart gives its reading machine. */
  readonly walk: ReadingOptions
  /** The chart's input and model, as its readout and its selection take them. */
  readonly input: I
  readonly model: M
  /** The chart's readout, whose announcement is what the live region says at a position. */
  readonly readout: (input: I, model: M, view: ReadingView) => { readonly announcement: string }
  /** What the chart's `onSelect` reports at a position, or `null` where it reports nothing. */
  readonly selection: (input: I, model: M, at: ReadingPosition) => unknown
}

/** The chart's reading machine, as the helpers read and move it. */
export interface ChartMarkReading {
  readonly now: () => ReadingPosition
}

interface Mark {
  readonly id: string
  readonly at: ReadingPosition
}

/**
 * The marks at one position the reading's keys reach, with their ids: each
 * series Up and Down walk there. A chart whose Up and Down move nothing (one
 * series, or no walk) reads the position at the walk's series coordinate at
 * rest, where a person reads it.
 */
function marksAt(walk: ReadingOptions, index: number): Mark[] {
  const { seriesCount = 1, walkSeries = false, seriesStart = null } = walk
  if (!walkSeries || seriesCount <= 1)
    return [{ id: String(index), at: { index, series: seriesStart } }]
  return Array.from({ length: seriesCount }, (_, series) => ({
    id: `${index}:${series}`,
    at: { index, series },
  }))
}

/** The marks at a position at which the chart's `onSelect` reports something. */
function pickableAt<I, M>(source: ChartMarkSource<I, M>, index: number): Mark[] {
  return marksAt(source.walk, index).filter(
    (mark) => source.selection(source.input, source.model, mark.at) !== null,
  )
}

/**
 * The positions around `centre` whose marks fit under the cap, in order. The
 * window grows one position at a time, after the centre and then before it in
 * turn, and a side stops at its first position whose marks do not fit, so the
 * window is one run of whole positions. The centre is always in it, whole,
 * even when its own marks pass the cap. A chart whose marks all fit lists them
 * all.
 */
function windowAround<I, M>(source: ChartMarkSource<I, M>, centre: number): Mark[] {
  const { count } = source.walk
  const held = pickableAt(source, centre)
  const before: Mark[][] = []
  const after: Mark[][] = []
  let total = held.length
  let low = centre - 1
  let high = centre + 1
  let early = low >= 0
  let late = high < count
  let next: 'after' | 'before' = 'after'
  while (early || late) {
    const side: 'after' | 'before' = (next === 'after' && late) || !early ? 'after' : 'before'
    next = side === 'after' ? 'before' : 'after'
    const marks = pickableAt(source, side === 'after' ? high : low)
    if (total + marks.length > CHART_MARK_CAP) {
      if (side === 'after') late = false
      else early = false
      continue
    }
    total += marks.length
    if (side === 'after') {
      after.push(marks)
      high += 1
      late = high < count
    } else {
      before.unshift(marks)
      low -= 1
      early = low >= 0
    }
  }
  return [...before.flat(), ...held, ...after.flat()]
}

/**
 * The reading position along the chart, 0-based: the number a mark's id
 * starts with, clamped to the positions the chart has now, as a render
 * clamps it. `null` while nothing is read, and on a chart with no positions.
 */
export function chartPosition(
  source: { readonly walk: ReadingOptions },
  reading: ChartMarkReading,
): number | null {
  const { index } = reading.now()
  const { count } = source.walk
  if (index === null || count <= 0) return null
  return Math.min(count - 1, Math.max(0, index))
}

/**
 * The marks an agent can pick: each position the keys reach at which
 * `onSelect` reports something, in the order the keys walk them. A mark's
 * label is what the live region says with the reading on it. Its id is its
 * place in the reading: the position along the chart (`3`), and in a chart
 * whose Up and Down walk more than one series or row, that one after a colon
 * (`3:1`). A position at which `onSelect` reports nothing, such as an absent
 * cell, is not a mark, because a person's press there does nothing.
 *
 * A chart with at most `CHART_MARK_CAP` marks lists every one. A larger chart
 * lists the whole positions around the reading position, at most the cap in
 * all, or around the first position while nothing is read. A mark's id is the
 * same whatever the window holds.
 */
export function chartMarks<I, M>(
  source: ChartMarkSource<I, M>,
  reading?: ChartMarkReading,
): ChartMarkChoice[] {
  if (source.walk.count <= 0) return []
  const centre = reading === undefined ? null : chartPosition(source, reading)
  return windowAround(source, centre ?? 0).map(({ id, at }) => ({
    id,
    label: source.readout(source.input, source.model, { ...at, active: true }).announcement,
  }))
}

/**
 * Moves the reading to a position along the chart as Left and Right do: the
 * series a person walked to stays, the tooltip shows the position and the
 * live region says it. `onSelect` is not called. Throws for a number that is
 * not a whole position of the chart.
 */
export function readChartPosition(
  source: { readonly walk: ReadingOptions },
  position: number,
  reading: ChartMarkReading & {
    readonly moveTo: (index: number | null, series?: number | null) => void
  },
): void {
  const { count } = source.walk
  if (!Number.isInteger(position) || position < 0 || position >= count) {
    throw new Error(
      count <= 0
        ? 'The chart has no positions to read.'
        : `The chart's positions are 0 to ${count - 1}, and ${position} is not one of them.`,
    )
  }
  reading.moveTo(position, reading.now().series)
}

/**
 * Picks the mark an id names as a person does: moves the reading to it, which
 * shows its tooltip and says it in the live region, and runs `activate`, the
 * chart's own function that Enter runs, so `onSelect` receives what a
 * person's press there gives. Throws for an id that names no mark.
 */
export function chooseChartMark<I, M>(
  source: ChartMarkSource<I, M>,
  id: string,
  reading: { readonly moveTo: (index: number | null, series?: number | null) => void },
  activate: () => void,
): void {
  // An id starts with its position, so only that position's marks are read.
  const index = Number(id.split(':')[0])
  const mark =
    Number.isInteger(index) && index >= 0 && index < source.walk.count
      ? pickableAt(source, index).find((candidate) => candidate.id === id)
      : undefined
  if (mark === undefined) throw new Error(`No mark of the chart has the id "${id}".`)
  reading.moveTo(mark.at.index, mark.at.series)
  activate()
}
