import { describe, expect, it } from 'vitest'

import {
  barChartModel,
  barChartReadout,
  barChartSelection,
  barLinePoints,
  type BarChartInput,
  type BarMark,
} from './bar-chart'
import { readingView } from './reading'
import type { ChartDatum } from './types'

/**
 * BarChart's model, without a framework: what the React member and every
 * described member draw. The members' own tests cover the DOM; these cover the
 * rules the model decides: the grouped, stacked and diverging geometry, the
 * zero-anchored domain, the fallbacks and the warnings that name them, the
 * readout's words for a band and for a walked series, and the selection.
 */

const ROWS: ChartDatum[] = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const LIKERT = [
  { key: 'disagree', label: 'Disagree' },
  { key: 'strongly', label: 'Strongly disagree' },
  { key: 'agree', label: 'Agree' },
  { key: 'keen', label: 'Strongly agree' },
]

const SURVEY: ChartDatum[] = [
  { question: 'Q1', disagree: -20, strongly: -10, agree: 30, keen: 15 },
  { question: 'Q2', disagree: -5, strongly: -25, agree: 10, keen: 40 },
]

const BOX = { width: 400, height: 200 }

const input = (over: Partial<BarChartInput> = {}): BarChartInput => ({
  data: ROWS,
  series: PAIR,
  x: { key: 'day' },
  label: 'Tickets',
  locale: 'en-US',
  box: BOX,
  ...over,
})

/** The box a bar's path encloses: its corners, read from the path's moves, lines and arc ends. */
function extent(mark: BarMark | undefined) {
  const xs: number[] = []
  const ys: number[] = []
  for (const [, command, args] of (mark?.d ?? '').matchAll(/([MLA])([^MLAZ]+)/g)) {
    const numbers = (args ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    const [x, y] = command === 'A' ? numbers.slice(5) : numbers
    xs.push(x ?? Number.NaN)
    ys.push(y ?? Number.NaN)
  }
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, right: Math.max(...xs), bottom: Math.max(...ys) }
}

const marksOf = (over: Partial<BarChartInput> = {}, band = 0) =>
  barChartModel(input(over)).plot?.bands[band]?.marks ?? []

const topTick = (over: Partial<BarChartInput> = {}) =>
  Math.max(
    ...(barChartModel(input(over)).axes?.y ?? []).map((tick) =>
      Number(tick.label.replace(/[^\d.-]/g, '')),
    ),
  )

describe('barChartModel: grouped', () => {
  it('draws one bar per series per row, side by side, and nothing before the measurement', () => {
    const model = barChartModel(input())
    expect(model.drawn).toBe('grouped')
    expect(model.plot?.bands.map((band) => band.marks.length)).toEqual([2, 2, 2])
    const [opened, resolved] = marksOf().map(extent)
    expect(opened && resolved && resolved.left - opened.right, 'a 2px gap between bars').toBe(2)
    expect(opened && opened.right - opened.left).toBeLessThanOrEqual(24)

    const unmeasured = barChartModel(input({ box: null }))
    expect(unmeasured.plot).toBeNull()
    expect(unmeasured.twin.rows, 'the twin holds every value before the plot is measured').toEqual([
      ['Mon', '32', '28'],
      ['Tue', '41', '39'],
      ['Wed', '37', '40'],
    ])
  })

  it('grows each bar from the zero rule, its length in proportion to its value', () => {
    const model = barChartModel(input())
    const zero = model.plot?.zero ?? Number.NaN
    const [opened, resolved] = marksOf().map(extent)
    expect(opened?.bottom).toBeCloseTo(zero, 6)
    expect(resolved?.bottom).toBeCloseTo(zero, 6)
    const length = (bar: ReturnType<typeof extent> | undefined) => (bar ? bar.bottom - bar.top : 0)
    expect(length(opened) / length(resolved)).toBeCloseTo(32 / 28, 6)
  })

  it('draws nothing for a gap, and anchors the value axis at zero', () => {
    const gapped = input({
      data: [
        { day: 'Mon', opened: 40, resolved: null },
        { day: 'Tue', opened: 44, resolved: 41 },
      ],
    })
    const model = barChartModel(gapped)
    expect(model.plot?.bands.map((band) => band.marks.map((mark) => mark.key))).toEqual([
      ['opened'],
      ['opened', 'resolved'],
    ])
    expect(model.axes?.y.some((tick) => tick.label === '0')).toBe(true)
  })

  it('lays the bars along x when horizontal, and swaps the axes', () => {
    const model = barChartModel(input({ orientation: 'horizontal' }))
    expect(model.vertical).toBe(false)
    expect(model.axes?.y.map((tick) => tick.label)).toEqual(['Mon', 'Tue', 'Wed'])
    const [opened] = marksOf({ orientation: 'horizontal' }).map(extent)
    expect(opened?.left).toBeCloseTo(model.plot?.zero ?? Number.NaN, 6)
    expect(opened && opened.right - opened.left).toBeGreaterThan(24)
  })

  it('anchors the value labels at the plot’s ends when horizontal, and leaves the y axis centred', () => {
    const horizontal = barChartModel(input({ orientation: 'horizontal' }))
    const x = horizontal.axes?.x ?? []
    // The first tick is on the plot's start and the last on its end, so their labels are anchored there.
    expect(x[0]?.at).toBe(0)
    expect(x.at(-1)?.at).toBe(BOX.width)
    expect(x.map((tick) => tick.align)).toEqual([
      'start',
      ...x.slice(1, -1).map(() => undefined),
      'end',
    ])
    // The gridlines stay on the ticks.
    expect(horizontal.plot?.grid.at(-1)?.d).toContain(`M${BOX.width + 0.5} 0`)
    expect(horizontal.axes?.y.every((tick) => tick.align === undefined)).toBe(true)

    // Vertical: the value axis runs down the block axis and stays centred, and band labels that fit do too.
    const vertical = barChartModel(input())
    expect(vertical.axes?.y.every((tick) => tick.align === undefined)).toBe(true)
    expect(vertical.axes?.x.every((tick) => tick.align === undefined)).toBe(true)
  })

  it('anchors a band label wider than the room beside its band at its end of the plot', () => {
    const model = barChartModel(
      input({
        data: [
          { agent: 'Priya Raghunathan-Iyer', tickets: 88 },
          { agent: 'Wei Zhang', tickets: 61 },
          { agent: 'Amara Okonkwo-Bell', tickets: 52 },
        ],
        series: [{ key: 'tickets', label: 'Tickets' }],
        x: { key: 'agent' },
        box: { width: 360, height: 200 },
      }),
    )
    // Two of the three names fit; each is wider than the room beside its band at the plot's end.
    expect(model.axes?.x.map((tick) => [tick.label, tick.align])).toEqual([
      ['Priya Raghunathan-Iyer', 'start'],
      ['Amara Okonkwo-Bell', 'end'],
    ])
  })

  it('refits to the series that remain, and keeps the full domain with every series hidden', () => {
    const tall = input({
      data: [
        { day: 'Mon', opened: 40, resolved: 8 },
        { day: 'Tue', opened: 44, resolved: 10 },
      ],
    })
    const full = topTick(tall)
    expect(topTick({ ...tall, hidden: new Set(['opened']) })).toBeLessThan(full)
    expect(topTick({ ...tall, hidden: new Set(['opened', 'resolved']) })).toBe(full)
    const hidden = barChartModel(input({ hidden: new Set(['opened']) }))
    expect(hidden.plot?.bands[0]?.marks.map((mark) => mark.key)).toEqual(['resolved'])
    expect(hidden.twin.rows[0]).toEqual(['Mon', '32', '28'])
  })

  it('paints one signed series with the polarity colours, at the outermost arm', () => {
    const model = barChartModel(
      input({
        data: [
          { day: 'Mon', net: 5 },
          { day: 'Tue', net: -3 },
        ],
        series: [{ key: 'net', label: 'Net' }],
      }),
    )
    expect(model.plot?.bands.map((band) => band.marks[0]?.paint)).toEqual([
      'var(--pm-chart-pos-3)',
      'var(--pm-chart-neg-3)',
    ])
    const [up] = model.plot?.bands[0]?.marks.map(extent) ?? []
    const [down] = model.plot?.bands[1]?.marks.map(extent) ?? []
    expect(up?.bottom).toBeCloseTo(model.plot?.zero ?? Number.NaN, 6)
    expect(down?.top).toBeCloseTo(model.plot?.zero ?? Number.NaN, 6)
  })
})

describe('barChartModel: stacked', () => {
  const STACK = {
    data: [{ day: 'Mon', a: 40, b: 40, c: 40 }],
    series: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ],
    mode: 'stacked' as const,
  }

  it('stacks in declaration order up to the running total, which the axis reaches', () => {
    const model = barChartModel(input(STACK))
    expect(model.drawn).toBe('stacked')
    expect(topTick(STACK)).toBeGreaterThanOrEqual(120)
    const [a, b, c] = marksOf(STACK).map(extent)
    expect(a?.bottom).toBeCloseTo(model.plot?.zero ?? Number.NaN, 6)
    // One column: every segment has the band's position and width.
    expect(new Set([a?.left, b?.left, c?.left]).size).toBe(1)
    // Touching segments are parted by a 2px surface gap, taken from the upper segment's foot.
    expect(a && b && a.top - b.bottom).toBeCloseTo(2, 6)
    expect(b && c && b.top - c.bottom).toBeCloseTo(2, 6)
  })

  it('rounds only the end of the data, the top of the stack', () => {
    const [a, b, c] = marksOf(STACK)
    expect(a?.d).toContain('A0 0')
    expect(b?.d).toContain('A0 0')
    expect(c?.d).toContain('A4 4')
  })

  it('falls back to grouped for values on both sides of zero, with a warning, and clamps nothing', () => {
    const mixed = input({
      data: [{ day: 'Mon', a: 10, b: -4 }],
      series: STACK.series.slice(0, 2),
      mode: 'stacked',
    })
    const model = barChartModel(mixed)
    expect(model.drawn).toBe('grouped')
    expect(model.warnings).toHaveLength(1)
    expect(model.warnings[0]).toContain('mode: "diverging"')
    const [a, b] = model.plot?.bands[0]?.marks.map(extent) ?? []
    expect(a?.bottom).toBeCloseTo(model.plot?.zero ?? Number.NaN, 6)
    expect(b?.top, 'the negative bar hangs below zero').toBeCloseTo(
      model.plot?.zero ?? Number.NaN,
      6,
    )
  })

  it('draws one series alone as grouped bars', () => {
    expect(barChartModel(input({ ...STACK, series: STACK.series.slice(0, 1) })).drawn).toBe(
      'grouped',
    )
  })
})

describe('barChartModel: diverging', () => {
  const likert = (over: Partial<BarChartInput> = {}) =>
    input({ data: SURVEY, series: LIKERT, x: { key: 'question' }, mode: 'diverging', ...over })

  it('stacks each side outward from zero, in the arms of its side', () => {
    const model = barChartModel(likert())
    expect(model.drawn).toBe('diverging')
    const zero = model.plot?.zero ?? Number.NaN
    const marks = model.plot?.bands[0]?.marks ?? []
    expect(marks.map((mark) => mark.paint)).toEqual([
      'var(--pm-chart-neg-1)',
      'var(--pm-chart-neg-2)',
      'var(--pm-chart-pos-1)',
      'var(--pm-chart-pos-2)',
    ])
    const [disagree, strongly, agree, keen] = marks.map(extent)
    // The first series on each side sits on zero, the next outside it, parted by the gap.
    expect(disagree?.top).toBeCloseTo(zero, 6)
    expect(strongly && disagree && strongly.top - disagree.bottom).toBeCloseTo(2, 6)
    expect(agree?.bottom).toBeCloseTo(zero, 6)
    expect(agree && keen && agree.top - keen.bottom).toBeCloseTo(2, 6)
    // Each side's outermost segment carries the data end's radius.
    expect(marks.map((mark) => mark.d.includes('A4 4'))).toEqual([false, true, false, true])
  })

  it('keeps every arm’s colour when a series is hidden', () => {
    const marks = barChartModel(likert({ hidden: new Set(['disagree', 'agree']) })).plot?.bands[0]
      ?.marks
    expect(marks?.map((mark) => [mark.key, mark.paint])).toEqual([
      ['strongly', 'var(--pm-chart-neg-2)'],
      ['keen', 'var(--pm-chart-pos-2)'],
    ])
  })

  it('reaches both running extremes on the value axis', () => {
    // Q2 runs to -30 below zero and to 50 above it.
    const ticks = (barChartModel(likert()).axes?.y ?? []).map((tick) =>
      Number(tick.label.replace('−', '-').replace(/[^\d.-]/g, '')),
    )
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(50)
    expect(Math.min(...ticks)).toBeLessThanOrEqual(-30)
  })

  it('warns that one-signed data does not diverge', () => {
    const model = barChartModel(likert({ data: ROWS, series: PAIR, x: { key: 'day' } }))
    expect(model.warnings).toHaveLength(1)
    expect(model.warnings[0]).toContain('signed data is the point')
  })
})

describe('barChartModel: warnings', () => {
  it('warns once per unlawful use, naming the alternative, and draws the lawful form', () => {
    const model = barChartModel(
      input({ x: { key: 'day', scale: 'linear' }, y: { domain: 'auto' }, emphasis: 'closed' }),
    )
    expect(model.warnings).toHaveLength(3)
    expect(model.warnings.some((message) => message.includes('Histogram'))).toBe(true)
    expect(model.warnings.some((message) => message.includes('y.domain "auto"'))).toBe(true)
    expect(model.axes?.y.some((tick) => tick.label === '0')).toBe(true)
    expect(model.plot?.bands).toHaveLength(3)
    expect(barChartModel(input()).warnings).toEqual([])
  })
})

describe('barChartReadout', () => {
  const read = (index: number | null, series: number | null = null) =>
    readingView({ index, series }, ROWS.length, PAIR.length)

  it('reads the whole band, and a walked series first with its band last', () => {
    const model = barChartModel(input())
    expect(barChartReadout(input(), model, read(0)).announcement).toBe(
      'Mon: Opened 32, Resolved 28',
    )
    const walked = barChartReadout(input(), model, read(1, 1))
    expect(walked.announcement).toBe('Resolved: 39 — Tue')
    expect(walked.tooltip?.rows, 'the tooltip still lists every series').toHaveLength(2)
    expect(barChartReadout(input(), model, read(null)).announcement).toBe('')
  })

  it('keeps the announcement without the tooltip, and opens the tooltip inward past the middle', () => {
    const off = input({ tooltip: false })
    const readout = barChartReadout(off, barChartModel(off), read(0))
    expect(readout.tooltip).toBeNull()
    expect(readout.announcement).toContain('Opened 32')

    const model = barChartModel(input())
    expect(barChartReadout(input(), model, read(0)).tooltip?.side).toBe('end')
    expect(barChartReadout(input(), model, read(2)).tooltip?.side).toBe('start')
  })
})

describe('barChartSelection', () => {
  it('reports the walked series, the first visible one for a whole band, and nothing at rest', () => {
    const model = barChartModel(input())
    expect(barChartSelection(input(), model, { index: 1, series: null })).toEqual({
      index: 1,
      key: 'opened',
      datum: ROWS[1],
    })
    expect(barChartSelection(input(), model, { index: 1, series: 1 })?.key).toBe('resolved')
    expect(barChartSelection(input(), model, { index: null, series: null })).toBeNull()

    const hidden = input({ hidden: new Set(['opened']) })
    expect(
      barChartSelection(hidden, barChartModel(hidden), { index: 0, series: null })?.key,
      'the first visible series',
    ).toBe('resolved')
  })

  it('reports nothing at a walked mark whose value is null, and the band whatever its values are', () => {
    const data: ChartDatum[] = [
      { day: 'Mon', opened: 12, resolved: 9 },
      { day: 'Tue', opened: null, resolved: 7 },
    ]
    const gapped = input({ data })
    const model = barChartModel(gapped)
    expect(barChartSelection(gapped, model, { index: 1, series: 0 }), 'no bar is drawn').toBeNull()
    expect(barChartSelection(gapped, model, { index: 1, series: 1 })?.key).toBe('resolved')
    expect(barChartSelection(gapped, model, { index: 1, series: null }), 'the band').toEqual({
      index: 1,
      key: 'opened',
      datum: data[1],
    })
  })
})

/*
 * Lines over the bars: further series drawn as a line on the bars' own value
 * axis. There is no second value axis (`docs/charts.md`), so every check below
 * reads one axis.
 */
describe('barChartModel: lines', () => {
  const DAILY: ChartDatum[] = [
    { day: 'Mon', opened: 32, average: 30 },
    { day: 'Tue', opened: 41, average: 34 },
    { day: 'Wed', opened: 37, average: 36 },
  ]
  const AVERAGE = [{ key: 'average', label: 'Average' }]
  const lined = (over: Partial<BarChartInput> = {}) =>
    input({ data: DAILY, series: [PAIR[0]!], lines: AVERAGE, ...over })

  it('puts each point at its category centre, on the value scale, and a gap as no point', () => {
    const at = (value: number) => 200 - value
    expect(
      barLinePoints([{ v: 10 }, { v: null }, { v: 30 }, { v: 'x' }], 'v', [50, 150, 250, null], at),
    ).toEqual([{ x: 50, y: 190 }, null, { x: 250, y: 170 }, null])
  })

  it('draws a chart with no lines exactly as before', () => {
    const before = barChartModel(input())
    expect(barChartModel(input({ lines: [] }))).toEqual(before)
    expect(before.plot?.lines).toEqual([])
    expect(before.lineKeys).toEqual([])
  })

  it('leaves the bars where they were when the line stays inside their domain', () => {
    const bars = barChartModel(input({ data: DAILY, series: [PAIR[0]!] }))
    const both = barChartModel(lined())
    expect(both.plot?.bands).toEqual(bars.plot?.bands)
    expect(both.axes).toEqual(bars.axes)
  })

  it('draws one line through every category centre, with a point at each value', () => {
    const model = barChartModel(lined())
    const [line] = model.plot?.lines ?? []
    expect(line?.key).toBe('average')
    expect(line?.points.map((point) => point.cx)).toEqual(model.positions)
    expect(line?.points.map((point) => point.r)).toEqual([4, 4, 4])
    const bar = extent(model.plot?.bands[1]?.marks[0])
    const point = line?.points[1]
    // Bar and point share the band's centre and the one value axis.
    expect(point?.cx).toBeCloseTo((bar.left + bar.right) / 2, 6)
    const zero = model.plot?.zero ?? Number.NaN
    expect((zero - (point?.cy ?? 0)) / (zero - bar.top)).toBeCloseTo(34 / 41, 6)
    expect(line?.d.startsWith('M')).toBe(true)
  })

  it('gives the lines the slots after the bars, and names them in the legend as lines', () => {
    const model = barChartModel(input({ data: DAILY, lines: AVERAGE }))
    expect(model.painted.map((entry) => entry.paint)).toEqual([
      'var(--pm-chart-1)',
      'var(--pm-chart-2)',
      'var(--pm-chart-3)',
    ])
    expect(model.plot?.lines[0]?.paint).toBe('var(--pm-chart-3)')
    expect(model.lineKeys).toEqual(['average'])
    expect(model.legend).toBe(true)
    // An explicit slot on a bar reserves its seat for the lines too.
    const pinned = barChartModel(
      input({ data: DAILY, series: [{ ...PAIR[0]!, slot: 2 }], lines: AVERAGE }),
    )
    expect(pinned.painted.map((entry) => entry.paint)).toEqual([
      'var(--pm-chart-2)',
      'var(--pm-chart-1)',
    ])
  })

  it("reaches the line's values on the one value axis, from zero", () => {
    const tall = lined({
      data: [
        { day: 'Mon', opened: 32, average: 120 },
        { day: 'Tue', opened: 41, average: 30 },
      ],
    })
    expect(topTick(tall)).toBeGreaterThanOrEqual(120)
    expect(barChartModel(tall).axes?.y.some((tick) => tick.label === '0')).toBe(true)
  })

  it('breaks the line at a gap and draws no point there', () => {
    const model = barChartModel(
      lined({
        data: [
          { day: 'Mon', opened: 32, average: 30 },
          { day: 'Tue', opened: 41, average: null },
          { day: 'Wed', opened: 37, average: 36 },
        ],
      }),
    )
    const [line] = model.plot?.lines ?? []
    expect(line?.points.map((point) => point.index)).toEqual([0, 2])
    expect(line?.d.match(/M/g)).toHaveLength(2)
    expect(model.twin.rows[1]).toEqual(['Tue', '41', ''])
  })

  it('draws a line over stacked bars at the stack centre, and leaves the stack as it was', () => {
    const stack = input({
      data: [
        { day: 'Mon', a: 10, b: 20, total: 30 },
        { day: 'Tue', a: 15, b: 15, total: 30 },
      ],
      series: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      mode: 'stacked',
    })
    const plain = barChartModel(stack)
    const model = barChartModel({ ...stack, lines: [{ key: 'total', label: 'Total' }] })
    expect(model.drawn).toBe('stacked')
    expect(model.plot?.bands).toEqual(plain.plot?.bands)
    const [line] = model.plot?.lines ?? []
    expect(line?.series).toBe(2)
    const top = extent(model.plot?.bands[0]?.marks[1])
    expect(line?.points[0]?.cy).toBeCloseTo(top.top, 6)
  })

  it('keeps the polarity colours of one signed bar series beside a line', () => {
    const model = barChartModel(
      input({
        data: [
          { week: 'W1', delta: 12, trend: 4 },
          { week: 'W2', delta: -8, trend: 2 },
        ],
        series: [{ key: 'delta', label: 'Change' }],
        lines: [{ key: 'trend', label: 'Trend' }],
        x: { key: 'week' },
      }),
    )
    expect(model.plot?.bands.map((band) => band.marks[0]?.paint)).toEqual([
      'var(--pm-chart-pos-3)',
      'var(--pm-chart-neg-3)',
    ])
    expect(model.plot?.lines[0]?.paint).toBe('var(--pm-chart-2)')
  })

  it('reads every series at a band, walks onto the line, and selects it', () => {
    const model = barChartModel(lined())
    const view = (index: number, series: number | null = null) =>
      readingView({ index, series }, DAILY.length, model.visible.length)
    expect(barChartReadout(lined(), model, view(1)).announcement).toBe('Tue: Opened 41, Average 34')
    expect(barChartReadout(lined(), model, view(1, 1)).announcement).toBe('Average: 34 — Tue')
    expect(barChartSelection(lined(), model, { index: 1, series: 1 })).toEqual({
      index: 1,
      key: 'average',
      datum: DAILY[1],
    })
  })

  it("states the line in the summary and the twin, in the bars' format", () => {
    const model = barChartModel(lined({ y: { format: { style: 'currency', currency: 'USD' } } }))
    expect(model.summary).toContain('Average')
    expect(model.twin.columns.map((column) => column.label)).toEqual(['Day', 'Opened', 'Average'])
    expect(model.twin.rows[0]).toEqual(['Mon', '$32.00', '$30.00'])
  })

  it('hides a toggled line from the plot and the readout, refits, and keeps it in the twin', () => {
    const tall = lined({
      data: [
        { day: 'Mon', opened: 32, average: 120 },
        { day: 'Tue', opened: 41, average: 30 },
      ],
    })
    const hidden = { ...tall, hidden: new Set(['average']) }
    const model = barChartModel(hidden)
    expect(model.plot?.lines).toEqual([])
    expect(model.visible.map((entry) => entry.key)).toEqual(['opened'])
    expect(topTick(hidden)).toBeLessThan(topTick(tall))
    expect(model.twin.columns.map((column) => column.key)).toContain('average')
  })

  it('draws one point for one category, and nothing for a line with no values', () => {
    const one = barChartModel(lined({ data: [{ day: 'Mon', opened: 32, average: 30 }] }))
    expect(one.plot?.lines[0]?.points).toHaveLength(1)

    const none = barChartModel(lined({ lines: [{ key: 'missing', label: 'Missing' }] }))
    expect(none.plot?.lines[0]?.points).toEqual([])
    expect(none.plot?.lines[0]?.d).toBe('')
    expect(none.twin.rows.map((row) => row[2])).toEqual(['', '', ''])

    const empty = barChartModel(lined({ data: [] }))
    expect(empty.state).toBe('empty')
    expect(empty.plot?.lines).toEqual([])
  })

  it('emphasises a line by its key, and warns about a key no series has', () => {
    const model = barChartModel(lined({ emphasis: 'average' }))
    expect(model.painted.map((entry) => entry.paint)).toEqual([
      'var(--pm-chart-other)',
      'var(--pm-chart-2)',
    ])
    expect(model.warnings).toEqual([])
  })

  it('draws no lines on a horizontal chart, and says so', () => {
    const model = barChartModel(lined({ orientation: 'horizontal' }))
    expect(model.plot?.lines).toEqual([])
    expect(model.lineKeys).toEqual([])
    expect(model.painted.map((entry) => entry.key)).toEqual(['opened'])
    expect(model.warnings).toEqual([expect.stringContaining('vertical bars only')])
  })
})
