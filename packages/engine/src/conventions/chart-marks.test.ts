import { describe, expect, it, vi } from 'vitest'

import { barChartModel, barChartReadout, barChartSelection } from '../charts/bar-chart'
import { heatmapModel, heatmapReadout, heatmapSelection } from '../charts/heatmap'
import { lineChartModel, lineChartReadout, lineChartSelection } from '../charts/line-chart'
import { createReading, type ReadingPosition } from '../charts/reading'
import {
  scatterChartModel,
  scatterChartReadout,
  scatterChartSelection,
} from '../charts/scatter-chart'
import type { ChartDatum } from '../charts/types'
import {
  CHART_MARK_CAP,
  chartMarks,
  chartPosition,
  chooseChartMark,
  readChartPosition,
  type ChartMarkSource,
} from './chart-marks'

/**
 * What an agent picks in a chart (the `## Agent` section of each chart's
 * spec): the positions the reading's keys reach at which `onSelect` reports
 * something, each named by what the live region says there, and a pick that
 * moves the reading and runs the chart's own activation. The marks here come
 * from the chart engine's own models, readouts and selections, which every
 * renderer's chart draws with. A chart with more marks than the cap lists a
 * window of them around the reading position, which an agent moves.
 */

const BOX = { width: 400, height: 200 }

const ROWS: ChartDatum[] = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

function bars(series = PAIR) {
  const input = {
    data: ROWS,
    series,
    x: { key: 'day' },
    label: 'Tickets',
    locale: 'en-US',
    box: BOX,
  }
  const model = barChartModel(input)
  return {
    walk: { count: ROWS.length, seriesCount: model.visible.length, walkSeries: true },
    input,
    model,
    readout: barChartReadout,
    selection: barChartSelection,
  }
}

/** Three bands by three days, the middle cell absent. */
function grid() {
  const data = ['Mon', 'Tue', 'Wed'].flatMap((day, row) =>
    ['08–12', '12–16', '16–20'].map((band, column) => ({
      band,
      day,
      tickets: row === 1 && column === 1 ? null : 10 * (row + 1) + column,
    })),
  )
  const input = {
    data,
    x: { key: 'band' },
    y: { key: 'day' },
    value: { key: 'tickets' },
    label: 'Volume',
    box: BOX,
  }
  const model = heatmapModel(input)
  return {
    walk: {
      count: model.columns.length,
      seriesCount: model.rows.length,
      walkSeries: true,
      seriesStart: 0,
    },
    input,
    model,
    readout: heatmapReadout,
    selection: heatmapSelection,
  }
}

/** A week of hours: 24 columns of seven rows, 168 cells. */
function week() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const data = days.flatMap((day) =>
    Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, day, tickets: hour })),
  )
  const input = {
    data,
    x: { key: 'hour' },
    y: { key: 'day' },
    value: { key: 'tickets' },
    label: 'Tickets by hour',
    box: { width: 960, height: 280 },
  }
  const model = heatmapModel(input)
  return {
    walk: {
      count: model.columns.length,
      seriesCount: model.rows.length,
      walkSeries: true,
      seriesStart: 0,
    },
    input,
    model,
    readout: heatmapReadout,
    selection: heatmapSelection,
  }
}

/** A hundred weeks of one series, or of two: more bars than the cap. */
function weeks(series = [{ key: 'opened', label: 'Opened' }]) {
  const data = Array.from({ length: 100 }, (_, index) => ({
    week: `W${index + 1}`,
    opened: 100 + index,
    resolved: 90 + index,
  }))
  const input = { data, series, x: { key: 'week' }, label: 'Tickets', locale: 'en-US', box: BOX }
  const model = barChartModel(input)
  return {
    walk: { count: data.length, seriesCount: model.visible.length, walkSeries: true },
    input,
    model,
    readout: barChartReadout,
    selection: barChartSelection,
  }
}

/** A reading at rest, or at a position, as the chart's machine reports it. */
const at = (index: number | null, series: number | null = null) => ({
  now: () => ({ index, series }),
})

/** The positions a list of marks covers, in order, each once. */
const positions = (marks: readonly { id: string }[]) => [
  ...new Set(marks.map((mark) => Number(mark.id.split(':')[0]))),
]

describe('chartMarks', () => {
  it('lists each bar of each band, by its place in the reading, named as the live region says it', () => {
    expect(chartMarks(bars())).toEqual([
      { id: '0:0', label: 'Opened: 32 — Mon' },
      { id: '0:1', label: 'Resolved: 28 — Mon' },
      { id: '1:0', label: 'Opened: 41 — Tue' },
      { id: '1:1', label: 'Resolved: 39 — Tue' },
      { id: '2:0', label: 'Opened: 37 — Wed' },
      { id: '2:1', label: 'Resolved: 40 — Wed' },
    ])
  })

  it('reads each band whole where Up and Down walk nothing, as a person hears it', () => {
    expect(chartMarks(bars([{ key: 'opened', label: 'Opened' }]))).toEqual([
      { id: '0', label: 'Mon: Opened 32' },
      { id: '1', label: 'Tue: Opened 41' },
      { id: '2', label: 'Wed: Opened 37' },
    ])
  })

  it('reads a crosshair chart once per row, every series in the label', () => {
    const input = { data: ROWS, series: PAIR, x: { key: 'day' }, label: 'Tickets', box: BOX }
    const source = {
      walk: { count: ROWS.length },
      input,
      model: lineChartModel(input),
      readout: lineChartReadout,
      selection: lineChartSelection,
    }
    expect(chartMarks(source)).toEqual([
      { id: '0', label: 'Mon: Opened 32, Resolved 28' },
      { id: '1', label: 'Tue: Opened 41, Resolved 39' },
      { id: '2', label: 'Wed: Opened 37, Resolved 40' },
    ])
  })

  it('leaves out a position at which onSelect reports nothing', () => {
    const marks = chartMarks(grid())
    expect(marks).toHaveLength(8)
    expect(marks.map((mark) => mark.id)).not.toContain('1:1')
    expect(marks[0]).toEqual({ id: '0:0', label: '08–12, Mon: 10' })
    expect(marks.find((mark) => mark.id === '1:2')).toEqual({ id: '1:2', label: '12–16, Wed: 31' })
  })

  it('leaves out a point a scatter does not draw, which onSelect does not report', () => {
    const input = {
      data: [
        { minutes: 2, triage: 4.8, escalations: 4.2 },
        { minutes: 6, triage: 4.4, escalations: null },
        { minutes: null, triage: 4.1, escalations: 3.9 },
      ],
      series: [
        { key: 'triage', label: 'Triage' },
        { key: 'escalations', label: 'Escalations' },
      ],
      x: { key: 'minutes' },
      label: 'Handle time',
      locale: 'en-US',
      box: BOX,
    }
    const model = scatterChartModel(input)
    const source = {
      walk: {
        count: input.data.length,
        seriesCount: model.visible.length,
        walkSeries: true,
        seriesStart: 0,
      },
      input,
      model,
      readout: scatterChartReadout,
      selection: scatterChartSelection,
    }
    expect(chartMarks(source).map((mark) => mark.id)).toEqual(['0:0', '0:1', '1:0'])
    const reading = createReading(source.walk)
    expect(() => chooseChartMark(source, '1:1', reading, () => {})).toThrow(
      'No mark of the chart has the id "1:1".',
    )
  })

  it('lists whole columns of a week of hours, no more than the cap', () => {
    const marks = chartMarks(week())
    // Seven rows a column: as many whole columns as fit under the cap.
    const columns = Math.floor(CHART_MARK_CAP / 7)
    expect(marks).toHaveLength(columns * 7)
    expect(marks[0]).toEqual({ id: '0:0', label: '0:00, Mon: 0' })
    expect(marks.at(-1)).toEqual({
      id: `${columns - 1}:6`,
      label: `${columns - 1}:00, Sun: ${columns - 1}`,
    })
  })

  it('lists nothing for a chart with no positions', () => {
    const source = bars()
    expect(chartMarks({ ...source, walk: { ...source.walk, count: 0 } })).toEqual([])
  })
})

describe('the window of marks', () => {
  it('lists every mark of a chart with no more than the cap', () => {
    const source = bars()
    const all = chartMarks(source)
    expect(chartMarks(source, at(2, 1))).toEqual(all)
    expect(all).toHaveLength(6)
  })

  it('lists the cap from the first position while nothing is read', () => {
    const marks = chartMarks(weeks())
    expect(marks).toHaveLength(CHART_MARK_CAP)
    expect(chartMarks(weeks(), at(null))).toEqual(marks)
    expect(positions(marks)).toEqual(Array.from({ length: CHART_MARK_CAP }, (_, index) => index))
  })

  it('follows the reading position, with the position in the middle', () => {
    const marks = chartMarks(weeks(), at(60))
    expect(marks).toHaveLength(CHART_MARK_CAP)
    // The window grows after the position first, and then before it, in turn.
    const shown = positions(marks)
    expect(shown[0]).toBe(60 - Math.floor((CHART_MARK_CAP - 1) / 2))
    expect(shown.at(-1)).toBe(60 + Math.ceil((CHART_MARK_CAP - 1) / 2))
  })

  it('reaches the last positions when the reading is at the end', () => {
    const marks = chartMarks(weeks(), at(99))
    expect(marks).toHaveLength(CHART_MARK_CAP)
    expect(positions(marks)).toEqual(
      Array.from({ length: CHART_MARK_CAP }, (_, index) => 100 - CHART_MARK_CAP + index),
    )
    expect(marks.at(-1)).toEqual({ id: '99', label: 'W100: Opened 199' })
  })

  it('keeps a position’s marks together, and holds no more than the cap', () => {
    const pair = [
      { key: 'opened', label: 'Opened' },
      { key: 'resolved', label: 'Resolved' },
    ]
    for (const reading of [at(null), at(0, 1), at(37, 0), at(99, 1)]) {
      const marks = chartMarks(weeks(pair), reading)
      expect(marks.length).toBeLessThanOrEqual(CHART_MARK_CAP)
      expect(marks).toHaveLength(2 * Math.floor(CHART_MARK_CAP / 2))
      for (const position of positions(marks)) {
        expect(marks.filter((mark) => mark.id.startsWith(`${position}:`))).toHaveLength(2)
      }
    }
    // Seven rows a column do not divide the cap: the window holds whole columns, under it.
    const grid = chartMarks(week(), at(23, 3))
    expect(grid.length).toBeLessThanOrEqual(CHART_MARK_CAP)
    expect(grid.length % 7).toBe(0)
    expect(grid.at(-1)?.id).toBe('23:6')
  })

  it('gives a mark the same id and label whatever window it is in', () => {
    const source = weeks()
    const early = chartMarks(source, at(30))
    const late = chartMarks(source, at(50))
    const shared = early.filter((mark) => late.some((other) => other.id === mark.id))
    expect(shared.length).toBeGreaterThan(0)
    for (const mark of shared) expect(late.find((other) => other.id === mark.id)).toEqual(mark)
    expect(early.find((mark) => mark.id === '40')).toEqual({ id: '40', label: 'W41: Opened 140' })
  })

  it('holds the reading’s position whole when its marks alone pass the cap', () => {
    // Three columns of more rows than the cap: a column is never split.
    const rows = CHART_MARK_CAP + 5
    const data = ['a', 'b', 'c'].flatMap((column) =>
      Array.from({ length: rows }, (_, row) => ({ column, row: `r${row}`, value: row })),
    )
    const input = {
      data,
      x: { key: 'column' },
      y: { key: 'row' },
      value: { key: 'value' },
      label: 'Tall',
      box: BOX,
    }
    const model = heatmapModel(input)
    const source = {
      walk: {
        count: model.columns.length,
        seriesCount: model.rows.length,
        walkSeries: true,
        seriesStart: 0,
      },
      input,
      model,
      readout: heatmapReadout,
      selection: heatmapSelection,
    }
    const marks = chartMarks(source, at(1, 0))
    expect(marks).toHaveLength(rows)
    expect(positions(marks)).toEqual([1])
  })

  it('counts only the marks onSelect reports, so a column with an absent cell gives room to another', () => {
    const marks = chartMarks(grid(), at(1))
    expect(marks).toHaveLength(8)
    expect(marks.map((mark) => mark.id)).not.toContain('1:1')
  })
})

describe('chartPosition', () => {
  it('is the reading’s position along the chart, and null while nothing is read', () => {
    const source = weeks()
    expect(chartPosition(source, at(null))).toBeNull()
    expect(chartPosition(source, at(42))).toBe(42)
    expect(chartPosition(grid(), at(2, 1))).toBe(2)
  })

  it('is clamped to the positions the chart has now, as a render clamps it', () => {
    expect(chartPosition(bars(), at(9))).toBe(2)
    const source = bars()
    expect(chartPosition({ ...source, walk: { ...source.walk, count: 0 } }, at(1))).toBeNull()
  })
})

describe('readChartPosition', () => {
  it('moves the reading along the chart as Left and Right do, and calls nothing', () => {
    const source = weeks()
    const reading = createReading(source.walk)
    readChartPosition(source, 97, reading)
    expect(reading.now()).toEqual({ index: 97, series: null })
    expect(chartPosition(source, reading)).toBe(97)
    expect(positions(chartMarks(source, reading))).toContain(99)
  })

  it('keeps the series a person walked to', () => {
    const source = bars()
    const reading = createReading(source.walk)
    for (const key of ['Home', 'ArrowDown', 'ArrowDown']) reading.key(key)
    readChartPosition(source, 2, reading)
    expect(reading.now()).toEqual({ index: 2, series: 1 })

    // A person's Right from the same place reaches the same reading.
    const walked = createReading(source.walk)
    for (const key of ['Home', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight'])
      walked.key(key)
    expect(walked.now()).toEqual(reading.now())
  })

  it('refuses a number that is not a position of the chart, and moves nothing', () => {
    const source = bars()
    const reading = createReading(source.walk)
    expect(() => readChartPosition(source, 3, reading)).toThrow(
      "The chart's positions are 0 to 2, and 3 is not one of them.",
    )
    expect(() => readChartPosition(source, -1, reading)).toThrow()
    expect(() => readChartPosition(source, 1.5, reading)).toThrow()
    expect(() => readChartPosition({ walk: { count: 0 } }, 0, reading)).toThrow(
      'The chart has no positions to read.',
    )
    expect(reading.now().index).toBeNull()
  })
})

describe('chooseChartMark', () => {
  it('moves the reading to the mark and runs the activation Enter runs, with what Enter reports there', () => {
    const source = bars()
    const reading = createReading(source.walk)
    const onSelect = vi.fn()
    const activate = () => onSelect(barChartSelection(source.input, source.model, reading.now()))
    chooseChartMark(source, '2:1', reading, activate)
    expect(reading.now()).toEqual({ index: 2, series: 1 })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ index: 2, key: 'resolved', datum: ROWS[2] })

    // A person reaches the same mark with the keys, and Enter reports the same.
    const walked = createReading(source.walk)
    for (const key of ['End', 'ArrowDown', 'ArrowDown']) walked.key(key)
    expect(barChartSelection(source.input, source.model, walked.now())).toEqual(
      onSelect.mock.calls[0]?.[0],
    )
  })

  it('reads a position at the walk’s series at rest where Up and Down walk nothing', () => {
    const source = grid()
    const single: ChartMarkSource<typeof source.input, typeof source.model> = {
      ...source,
      walk: { ...source.walk, seriesCount: 1 },
    }
    const moves: ReadingPosition[] = []
    chooseChartMark(
      single,
      '2',
      { moveTo: (index, series) => moves.push({ index, series: series ?? null }) },
      () => {},
    )
    expect(moves).toEqual([{ index: 2, series: 0 }])
  })

  it('picks a mark by its id wherever the window is', () => {
    const source = weeks()
    const reading = createReading(source.walk)
    const activate = vi.fn()
    chooseChartMark(source, '99', reading, activate)
    expect(reading.now()).toEqual({ index: 99, series: null })
    expect(activate).toHaveBeenCalledOnce()
  })

  it('refuses an id that names no mark, and moves nothing', () => {
    const source = grid()
    const reading = createReading(source.walk)
    const activate = vi.fn()
    expect(() => chooseChartMark(source, '1:1', reading, activate)).toThrow(
      'No mark of the chart has the id "1:1".',
    )
    expect(() => chooseChartMark(source, 'Tue', reading, activate)).toThrow()
    expect(() => chooseChartMark(source, '3:0', reading, activate)).toThrow()
    expect(() => chooseChartMark(source, '01:0', reading, activate)).toThrow()
    expect(reading.now().index).toBeNull()
    expect(activate).not.toHaveBeenCalled()
  })
})
