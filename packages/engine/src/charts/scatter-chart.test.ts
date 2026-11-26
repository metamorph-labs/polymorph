import { describe, expect, it } from 'vitest'

import { MARKER_RADIUS } from './cartesian'
import { DEFAULT_CHART_MESSAGES } from './messages'
import { readingView } from './reading'
import {
  scatterChartModel,
  scatterChartReadout,
  scatterChartSelection,
  type ScatterChartInput,
} from './scatter-chart'
import type { ChartDatum } from './types'

/**
 * ScatterChart's drawing without a framework: the rules every framework's
 * member renders from `scatterChartModel`. The React and Vue members' tests
 * cover the same chart through the DOM; these hold the model's rules directly.
 */

const ROWS: ChartDatum[] = [
  { minutes: 2, csat: 4.8 },
  { minutes: 6, csat: 4.1 },
  { minutes: 11, csat: 3.4 },
  { minutes: 14, csat: 3.1 },
]

const ONE = [{ key: 'csat', label: 'CSAT' }]

const BOX = { width: 400, height: 200 }

const chart = (overrides: Partial<ScatterChartInput> = {}): ScatterChartInput => ({
  data: ROWS,
  series: ONE,
  x: { key: 'minutes' },
  label: 'Correlation',
  locale: 'en-US',
  box: BOX,
  ...overrides,
})

const dots = (input: ScatterChartInput) =>
  scatterChartModel(input).plot?.groups.flatMap((group) => group.dots) ?? []

describe('the scatter model', () => {
  it('anchors the first and last x labels at the plot’s ends, and leaves the gridlines on the ticks', () => {
    const model = scatterChartModel(chart())
    const x = model.axes?.x ?? []
    expect(x[0]?.align).toBe('start')
    expect(x.at(-1)?.align).toBe('end')
    expect(x.slice(1, -1).every((tick) => tick.align === undefined)).toBe(true)
    expect(model.axes?.y.every((tick) => tick.align === undefined)).toBe(true)
    const grid = model.plot?.grid.find((line) => line.key === `x-${x.at(-1)?.key}`)
    expect(grid?.d).toBe(`M${BOX.width + 0.5} 0L${BOX.width + 0.5} ${BOX.height}`)
  })

  it('draws nothing and shows no axes before the plot is measured or with no rows', () => {
    const unmeasured = scatterChartModel(chart({ box: null }))
    expect(unmeasured.plot).toBeNull()
    expect(unmeasured.axes).toBeNull()
    expect(unmeasured.points).toEqual([])
    const empty = scatterChartModel(chart({ data: [] }))
    expect(empty.plot).toBeNull()
    expect(empty.axes).toBeNull()
    expect(empty.state).toBe('empty')
    expect(scatterChartModel(chart({ loading: true })).state).toBe('loading')
  })

  it('places each observation by its two measures, on axes that fit the data', () => {
    const model = scatterChartModel(chart())
    // x runs 2–14 and y 3–5 after rounding out: neither axis is anchored at zero.
    expect(model.points[0]?.x).toBe(0)
    expect(model.points[0]?.y).toBeCloseTo(20)
    expect(model.points[3]?.x).toBe(BOX.width)
    expect(model.axes?.x[0]?.label).toBe('2')
    expect(model.axes?.y[0]?.label).toBe('3')
    // Without a bubble every mark is the 8px marker.
    expect(dots(chart()).map((dot) => dot.r)).toEqual(ROWS.map(() => MARKER_RADIUS))
  })

  it('anchors y at zero only when asked', () => {
    const anchored = scatterChartModel(chart({ y: { domain: 'zero' } }))
    expect(anchored.axes?.y[0]?.label).toBe('0')
  })

  it('draws gridlines on both axes, and a zero rule only for an axis whose domain holds zero', () => {
    const plain = scatterChartModel(chart()).plot
    expect(plain?.grid.some((line) => line.key.startsWith('y-'))).toBe(true)
    expect(plain?.grid.some((line) => line.key.startsWith('x-'))).toBe(true)
    expect(plain?.zero).toEqual([])

    const signed = scatterChartModel(
      chart({
        data: [
          { delta: -4, csat: 3.2 },
          { delta: 5, csat: 4.6 },
        ],
        x: { key: 'delta' },
      }),
    ).plot
    expect(signed?.zero.map((rule) => rule.key)).toEqual(['x'])
  })

  it('draws no mark for a null x, y or bubble value, never a zero', () => {
    const input = chart({
      data: [
        { minutes: 2, csat: 4.8, tickets: 40 },
        { minutes: null, csat: 4.1, tickets: 40 },
        { minutes: 9, csat: null, tickets: 40 },
        { minutes: 12, csat: 3.3, tickets: null },
      ],
      bubble: { key: 'tickets' },
    })
    expect(scatterChartModel(input).points.map((point) => point !== null)).toEqual([
      true,
      false,
      false,
      false,
    ])
    expect(dots(input).map((dot) => dot.index)).toEqual([0])
  })

  it('sizes bubbles by area between the 8px and 24px diameters', () => {
    const radii = dots(
      chart({
        data: [
          { minutes: 2, csat: 4.8, tickets: 10 },
          { minutes: 6, csat: 4.1, tickets: 100 },
          { minutes: 11, csat: 3.4, tickets: 47 },
        ],
        bubble: { key: 'tickets', label: 'Tickets handled' },
      }),
    ).map((dot) => dot.r)
    expect(radii[0]).toBe(4)
    expect(radii[1]).toBe(12)
    expect(radii[2]).toBeGreaterThan(4)
    expect(radii[2]).toBeLessThan(12)
  })

  it('keeps each mark keyed by its row, so a series draws only the rows it has', () => {
    const groups = scatterChartModel(
      chart({
        data: [
          { minutes: 2, triage: 4.8, escalations: null },
          { minutes: 6, triage: null, escalations: 4.1 },
        ],
        series: [
          { key: 'triage', label: 'Triage' },
          { key: 'escalations', label: 'Escalations' },
        ],
      }),
    ).plot?.groups
    expect(
      groups?.map((group) => [group.key, group.series, group.dots.map((dot) => dot.index)]),
    ).toEqual([
      ['triage', 0, [0]],
      ['escalations', 1, [1]],
    ])
  })

  it('refits y to the series a reader leaves shown, and keeps every series in the twin', () => {
    const data = [
      { minutes: 2, a: 40, b: 8 },
      { minutes: 6, a: 44, b: 10 },
    ]
    const series = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]
    const top = (input: ScatterChartInput) =>
      Number(scatterChartModel(input).axes?.y.at(-1)?.label ?? '0')
    const both = chart({ data, series })
    const isolated = chart({ data, series, hidden: new Set(['a']) })
    expect(top(isolated)).toBeLessThan(top(both))
    expect(scatterChartModel(isolated).visible.map((entry) => entry.key)).toEqual(['b'])
    expect(scatterChartModel(isolated).twin.columns.map((column) => column.key)).toEqual([
      '__x',
      'a',
      'b',
    ])
    // With every series hidden the axes keep the whole data's domain.
    const none = chart({ data, series, hidden: new Set(['a', 'b']) })
    expect(top(none)).toBe(top(both))
    expect(scatterChartModel(none).plot?.groups).toEqual([])
    expect(scatterChartModel(both).legend).toBe(true)
    expect(scatterChartModel(chart()).legend).toBe(false)
  })

  it('adds the bubble column to the twin under its label', () => {
    const twin = scatterChartModel(
      chart({
        data: [{ minutes: 2, csat: 4.8, tickets: 1200 }],
        x: { key: 'minutes', label: 'Minutes' },
        bubble: { key: 'tickets', label: 'Tickets handled', format: { style: 'compact' } },
      }),
    ).twin
    expect(twin.columns).toEqual([
      { key: '__x', label: 'Minutes' },
      { key: 'csat', label: 'CSAT', numeric: true },
      { key: '__tickets', label: 'Tickets handled', numeric: true },
    ])
    expect(twin.rows).toEqual([['2', '4.8', '1.2K']])
  })

  it('labels a time x at the granularity its ticks imply', () => {
    const model = scatterChartModel(
      chart({
        data: [
          { date: '2026-07-01', minutes: 4 },
          { date: '2026-07-29', minutes: 40 },
        ],
        series: [{ key: 'minutes', label: 'Incident minutes' }],
        x: { key: 'date', scale: 'time' },
      }),
    )
    expect(model.categories).toEqual(['Jul 1', 'Jul 29'])
    // Weekly ticks, so each tick names a day.
    expect(model.axes?.x.every((tick) => /^(Jun|Jul|Aug) \d+$/.test(tick.label))).toBe(true)
  })

  it('maps annotations onto the plane: a band washes under the marks, a rule inks over them', () => {
    const plot = scatterChartModel(
      chart({
        annotations: [
          { kind: 'band', from: 4.5, to: 5, label: 'Target' },
          { kind: 'line', value: 4 },
          { kind: 'point', x: 6, y: 4.1, label: 'Here' },
        ],
      }),
    ).plot
    expect(plot?.wash).toHaveLength(1)
    expect(plot?.ink?.rules).toHaveLength(1)
    expect(plot?.ink?.marks).toHaveLength(1)
    expect(plot?.ink?.marks[0]?.cx).toBeCloseTo(((6 - 2) / 12) * BOX.width)
    expect(plot?.ink?.marks[0]?.cy).toBeCloseTo(90)
    expect(scatterChartModel(chart()).plot?.ink).toBeNull()
  })
})

describe('the scatter warnings', () => {
  const four = [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
    { key: 'c', label: 'C' },
    { key: 'd', label: 'D' },
  ]

  it('warns above the palette’s any-neighbour cap, naming the token, and still draws every series', () => {
    const over = scatterChartModel(chart({ series: four, cap: 3 }))
    expect(over.warnings).toHaveLength(1)
    expect(over.warnings[0]).toContain('4 series')
    expect(over.warnings[0]).toContain('--pm-chart-cap')
    expect(over.plot?.groups).toHaveLength(4)
    // A cap the series fit, and a cap not read (no theme), warn about nothing.
    expect(scatterChartModel(chart({ series: four, cap: 4 })).warnings).toEqual([])
    expect(scatterChartModel(chart({ series: four, cap: null })).warnings).toEqual([])
    expect(scatterChartModel(chart({ series: four })).warnings).toEqual([])
  })

  it('warns on a band x, naming BarChart, and renders it linear', () => {
    const model = scatterChartModel(chart({ x: { key: 'minutes', scale: 'band' } }))
    expect(model.warnings).toEqual([
      'ScatterChart takes a linear or time x — a band compares named things, which is BarChart. Rendering linear.',
    ])
    expect(model.points[0]?.x).toBe(0)
  })

  it('passes the series resolution’s warnings on', () => {
    const model = scatterChartModel(
      chart({ series: [{ key: 'csat', label: 'CSAT', tone: 'danger', slot: 2 }] }),
    )
    expect(model.warnings).toHaveLength(1)
    expect(model.warnings[0]).toContain('sets both tone and slot')
  })
})

describe('the scatter readout and selection', () => {
  const two = chart({
    data: [
      { minutes: 2, triage: 4.8, escalations: 4.2 },
      { minutes: 14, triage: 4.1, escalations: null },
    ],
    series: [
      { key: 'triage', label: 'Triage' },
      { key: 'escalations', label: 'Escalations' },
    ],
  })
  const view = (index: number | null, series: number | null = 0) =>
    readingView({ index, series }, 2, 2)

  it('says nothing and shows no tooltip when nothing is read', () => {
    const model = scatterChartModel(two)
    expect(scatterChartReadout(two, model, view(null))).toEqual({
      rows: [],
      announcement: '',
      tooltip: null,
    })
  })

  it('announces "x, y: series" for the read mark, and shows the tooltip at it', () => {
    const model = scatterChartModel(two)
    const first = scatterChartReadout(two, model, view(0))
    expect(first.announcement).toBe('2, 4.8: Triage')
    expect(first.tooltip).toMatchObject({ header: '2', x: 0, indicator: 'dot', side: 'end' })
    expect(first.tooltip?.rows.map((row) => row.value)).toEqual(['4.8'])
    expect(scatterChartReadout(two, model, view(0, 1)).announcement).toBe('2, 4.2: Escalations')
    // Past the plot's middle the tooltip opens inward.
    expect(scatterChartReadout(two, model, view(1)).tooltip?.side).toBe('start')
  })

  it('announces a gap with the catalog’s no-data text, and shows no tooltip for it', () => {
    const model = scatterChartModel(two)
    const gap = scatterChartReadout(two, model, view(1, 1))
    expect(gap.announcement).toBe(`14, ${DEFAULT_CHART_MESSAGES.noData}: Escalations`)
    expect(gap.tooltip).toBeNull()
  })

  it('adds the bubble value to the sentence and the rows', () => {
    const input = chart({
      data: [{ minutes: 2, csat: 4.8, tickets: 40 }],
      bubble: { key: 'tickets', label: 'Tickets handled' },
    })
    const readout = scatterChartReadout(
      input,
      scatterChartModel(input),
      readingView({ index: 0, series: 0 }, 1, 1),
    )
    expect(readout.announcement).toBe('2, 4.8, 40: CSAT')
    expect(readout.rows.map((row) => [row.label, row.value])).toEqual([
      ['CSAT', '4.8'],
      ['Tickets handled', '40'],
    ])
  })

  it('keeps the announcement when the tooltip is off, and drops the header on hideLabel', () => {
    const model = scatterChartModel(two)
    const off = scatterChartReadout({ ...two, tooltip: false }, model, view(0))
    expect(off.tooltip).toBeNull()
    expect(off.announcement).toBe('2, 4.8: Triage')
    const bare = scatterChartReadout(
      { ...two, tooltip: { hideLabel: true, indicator: 'line' } },
      model,
      view(0),
    )
    expect(bare.tooltip?.header).toBeUndefined()
    expect(bare.tooltip?.indicator).toBe('line')
  })

  it('reports the row, the walked series and the datum, or nothing when nothing is read', () => {
    const model = scatterChartModel(two)
    expect(scatterChartSelection(two, model, { index: 1, series: null })).toEqual({
      index: 1,
      key: 'triage',
      datum: two.data[1],
    })
    expect(scatterChartSelection(two, model, { index: 0, series: 1 })?.key).toBe('escalations')
    expect(scatterChartSelection(two, model, { index: null, series: 0 })).toBeNull()
  })

  it('reports nothing where the plot draws no point, which the keys reach and the live region names', () => {
    const model = scatterChartModel(two)
    // Escalations has no value at the second row: the reading is there, and it has no data.
    expect(scatterChartReadout(two, model, view(1, 1)).announcement).toBe(
      `14, ${DEFAULT_CHART_MESSAGES.noData}: Escalations`,
    )
    expect(scatterChartSelection(two, model, { index: 1, series: 1 })).toBeNull()
    expect(scatterChartSelection(two, model, { index: 1, series: 0 })?.key).toBe('triage')

    // A null x and a null bubble value draw no point either, and a time x that does not parse.
    const sized = chart({
      data: [
        { minutes: 2, csat: 4.8, tickets: 40 },
        { minutes: null, csat: 4.1, tickets: 40 },
        { minutes: 12, csat: 3.3, tickets: null },
      ],
      bubble: { key: 'tickets' },
    })
    const drawn = scatterChartModel(sized)
    expect(
      [0, 1, 2].map((index) => scatterChartSelection(sized, drawn, { index, series: 0 })),
    ).toEqual([{ index: 0, key: 'csat', datum: sized.data[0] }, null, null])
    const timed = chart({
      data: [
        { day: '2026-07-01', csat: 4.8 },
        { day: 'not a day', csat: 4.1 },
      ],
      x: { key: 'day', scale: 'time' },
    })
    const dated = scatterChartModel(timed)
    expect(dated.points.map((point) => point !== null)).toEqual([true, false])
    expect(scatterChartSelection(timed, dated, { index: 1, series: 0 })).toBeNull()
  })

  it('says the plot responds to Enter in the summary when it is selectable', () => {
    expect(scatterChartModel(chart({ selectable: true })).summary).toContain('Enter or Space')
    expect(scatterChartModel(chart()).summary).not.toContain('Enter or Space')
  })
})

/** A scatter chart's two measures, `y.label` and `x.label`, said together in the summary. */
describe('the measures', () => {
  it('says y.label against x.label in the summary sentence', () => {
    const both = chart({
      x: { key: 'minutes', label: 'Handle time (min)' },
      y: { label: 'Satisfaction' },
    })
    expect(scatterChartModel(both).summary).toBe(
      'Correlation showing CSAT, 4 points. Values: Satisfaction against Handle time (min). The same data is available as a table.',
    )
    expect(scatterChartModel(chart({ y: { label: 'Satisfaction' } })).summary).toContain(
      '4 points. Values: Satisfaction. The same',
    )
    expect(
      scatterChartModel(chart({ x: { key: 'minutes', label: 'Handle time (min)' } })).summary,
    ).toContain('4 points. Values against Handle time (min). The same')
    expect(scatterChartModel(chart()).summary).not.toContain('Values')
  })

  it('keeps x.label at the head of the twin’s first column', () => {
    const both = chart({
      x: { key: 'minutes', label: 'Handle time (min)' },
      y: { label: 'Satisfaction' },
    })
    expect(scatterChartModel(both).twin.columns.map((column) => column.label)).toEqual([
      'Handle time (min)',
      'CSAT',
    ])
  })
})
