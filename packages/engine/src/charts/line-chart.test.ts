import { describe, expect, it } from 'vitest'

import {
  brushSpan,
  brushValues,
  lineChartModel,
  lineChartReadout,
  lineChartSelection,
  syncIndexOf,
  syncValueAt,
  type LineChartInput,
} from './line-chart'
import { readingView } from './reading'
import type { ChartDatum } from './types'

/**
 * LineChart's model, without a framework: what the React member and every
 * described member draw. The members' own tests cover the DOM; these cover the
 * rules the model decides: the gap, the domain, the end labels, the warnings,
 * each row's x-domain value, the readout's words and the crosshair, the
 * selection, the brush's span and committed pair, and what the sync group sends
 * and receives.
 */

const DAYS: ChartDatum[] = [
  { day: '2026-07-01', opened: 28, resolved: 25 },
  { day: '2026-07-02', opened: 34, resolved: 30 },
  { day: '2026-07-03', opened: 31, resolved: 33 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const BOX = { width: 400, height: 200 }

const input = (over: Partial<LineChartInput> = {}): LineChartInput => ({
  data: DAYS,
  series: PAIR,
  x: { key: 'day', scale: 'time' },
  label: 'Tickets',
  locale: 'en-US',
  box: BOX,
  ...over,
})

const read = (index: number | null, count = DAYS.length) =>
  readingView({ index, series: null }, count)

describe('lineChartModel', () => {
  it('anchors the first and last x labels at the plot’s ends, and leaves the y axis centred', () => {
    const model = lineChartModel(input())
    const x = model.axes?.x ?? []
    expect(x[0]?.at).toBeCloseTo(0, 6)
    expect(x.at(-1)?.at).toBeCloseTo(BOX.width, 6)
    expect(x[0]?.align).toBe('start')
    expect(x.at(-1)?.align).toBe('end')
    expect(x.slice(1, -1).every((tick) => tick.align === undefined)).toBe(true)
    expect(model.axes?.y.every((tick) => tick.align === undefined)).toBe(true)
  })

  it('draws one stroke per visible series, and nothing before the measurement', () => {
    const model = lineChartModel(input())
    expect(model.plot?.strokes.map((stroke) => stroke.key)).toEqual(['opened', 'resolved'])
    expect(model.plot?.strokes[0]?.paint).toBe(model.painted[0]?.paint)
    expect(model.plot?.strokes[0]?.wash).toBeNull()
    expect(model.plot?.strokes[0]?.markers).toEqual([])
    expect(model.state).toBe('ready')
    expect(model.legend).toBe(true)

    const unmeasured = lineChartModel(input({ box: null }))
    expect(unmeasured.plot).toBeNull()
    expect(unmeasured.axes).toBeNull()
    expect(unmeasured.twin.rows).toHaveLength(3)
  })

  it('breaks a stroke at a gap and at a row with no x position, and puts no marker there', () => {
    const model = lineChartModel(
      input({
        data: [
          { day: '2026-07-01', opened: 28 },
          { day: 'not-a-date', opened: 30 },
          { day: '2026-07-03', opened: 31 },
          { day: '2026-07-04', opened: null },
          { day: '2026-07-05', opened: 33 },
        ],
        series: [{ key: 'opened', label: 'Opened' }],
        markers: true,
      }),
    )
    const stroke = model.plot?.strokes[0]
    expect(stroke?.line.match(/M/g)).toHaveLength(3)
    expect(stroke?.markers.map((marker) => marker.index)).toEqual([0, 2, 4])
    expect(model.positions[1]).toBeNull()
    expect(model.domainValues[1]).toBeNull()
  })

  it('washes the area variant to the domain floor and steps on request', () => {
    const area = lineChartModel(input({ variant: 'area' }))
    expect(area.plot?.strokes.every((stroke) => stroke.wash !== null)).toBe(true)
    const stepped = lineChartModel(input({ curve: 'step' }))
    expect(stepped.plot?.strokes[0]?.line).not.toContain('C')
    expect(lineChartModel(input()).plot?.strokes[0]?.line).toContain('C')
  })

  it('fits the domain to the data, draws the zero rule only when zero is in view', () => {
    const fitted = lineChartModel(input())
    expect(fitted.plot?.zeroRule).toBeNull()
    expect(fitted.axes?.y.some((tick) => tick.label === '0')).toBe(false)

    const anchored = lineChartModel(input({ y: { domain: 'zero' } }))
    expect(anchored.plot?.zeroRule).not.toBeNull()
    expect(anchored.axes?.y[0]?.label).toBe('0')
  })

  it('refits to the series that remain, and keeps the full domain with every series hidden', () => {
    const data: ChartDatum[] = [
      { day: '2026-07-01', opened: 400, resolved: 8 },
      { day: '2026-07-02', opened: 440, resolved: 10 },
    ]
    const top = (hidden: string[]) =>
      Math.max(
        ...(lineChartModel(input({ data, hidden: new Set(hidden) })).axes?.y ?? []).map((tick) =>
          Number(tick.label.replace(/\D/g, '')),
        ),
      )
    expect(top(['opened'])).toBeLessThan(top([]))
    expect(top(['opened', 'resolved'])).toBe(top([]))

    const hidden = lineChartModel(input({ data, hidden: new Set(['opened']) }))
    expect(hidden.visible.map((entry) => entry.key)).toEqual(['resolved'])
    // The twin never hides data.
    expect(hidden.twin.columns.map((column) => column.label)).toContain('Opened')
  })

  it('labels each endpoint, and drops every end label when two would collide', () => {
    const apart = lineChartModel(input())
    expect(apart.plot?.endLabels.map((end) => end.text)).toEqual(['31', '33'])
    expect(apart.plot?.endLabels[0]?.x).toBe(BOX.width)

    const close = lineChartModel(
      input({
        data: [
          { day: '2026-07-01', opened: 10, resolved: 90 },
          { day: '2026-07-02', opened: 50, resolved: 50.5 },
        ],
      }),
    )
    expect(close.plot?.endLabels).toEqual([])
  })

  it('draws an end label below an endpoint that has no room above it in the plot', () => {
    // The last value is the top of the domain, so the endpoint is at the plot's top edge and
    // the svg would cut a label drawn above it.
    const one = [{ key: 'opened', label: 'Opened' }]
    const rising = lineChartModel(
      input({
        series: one,
        data: [
          { day: '2026-07-01', opened: 20 },
          { day: '2026-07-02', opened: 60 },
          { day: '2026-07-03', opened: 100 },
        ],
      }),
    )
    const top = rising.plot?.endLabels[0]
    expect(top?.text).toBe('100')
    // Below the endpoint, with the whole of the text's height inside the plot.
    expect(top?.y).toBeGreaterThan(12)
    expect(top?.y).toBeLessThan(BOX.height / 4)

    // With room, the label is above its endpoint: the domain is 50 to 100, and 75 is halfway.
    const settling = lineChartModel(
      input({
        series: one,
        data: [
          { day: '2026-07-01', opened: 100 },
          { day: '2026-07-02', opened: 50 },
          { day: '2026-07-03', opened: 75 },
        ],
      }),
    )
    expect(settling.plot?.endLabels[0]?.y).toBeCloseTo(BOX.height / 2 - 6)
  })

  it('drops every end label when one drawn below its endpoint meets the next', () => {
    // The domain is 0 to 100, so the endpoints are 24px apart, which is room for two labels
    // drawn above them. The first has no room above and is drawn below, where the second is.
    const model = lineChartModel(
      input({
        data: [
          { day: '2026-07-01', opened: 20, resolved: 10 },
          { day: '2026-07-02', opened: 100, resolved: 88 },
        ],
      }),
    )
    expect(model.plot?.endLabels).toEqual([])
  })

  it('warns once per unlawful use, naming the alternative', () => {
    const banded = lineChartModel(
      input({
        data: [
          { week: 'W29', minutes: 38 },
          { week: 'W30', minutes: 35 },
        ],
        series: [{ key: 'minutes', label: 'Minutes' }],
        x: { key: 'week' },
        brushable: true,
        syncId: 'pair',
        emphasis: 'missing',
      }),
    )
    expect(banded.warnings).toHaveLength(3)
    expect(banded.warnings[0]).toContain('missing')
    expect(banded.warnings[1]).toContain('continuum')
    expect(banded.warnings[2]).toContain('Not synced')
    expect(banded.brushOn).toBe(false)
    expect(banded.syncGroup).toBeUndefined()
    expect(banded.domainValues).toEqual([null, null])

    const timed = lineChartModel(input({ brushable: true, syncId: 'pair' }))
    expect(timed.warnings).toEqual([])
    expect(timed.brushOn).toBe(true)
    expect(timed.syncGroup).toBe('pair')
    // A date-only string is a calendar date at local midnight.
    expect(timed.domainValues[0]).toBe(new Date(2026, 6, 1).getTime())
  })

  it('says the plot responds to Enter only when it is selectable', () => {
    expect(lineChartModel(input()).summary).not.toContain('Enter or Space selects')
    expect(lineChartModel(input({ selectable: true })).summary).toContain('Enter or Space selects')
  })
})

describe('lineChartReadout', () => {
  it('reads every series at the position, with a crosshair and a tooltip', () => {
    const model = lineChartModel(input())
    const readout = lineChartReadout(input(), model, read(0))
    expect(readout.announcement).toMatch(/^Jul.*: Opened 28, Resolved 25$/)
    expect(readout.rows.map((row) => row.value)).toEqual(['28', '25'])
    expect(readout.crosshair).toMatch(/^M/)
    expect(readout.tooltip?.side).toBe('end')
    expect(readout.tooltip?.y).toBe(BOX.height / 2)
    expect(readout.tooltip?.indicator).toBe('dot')

    // Past the halfway mark the tooltip opens inward.
    expect(lineChartReadout(input(), model, read(2)).tooltip?.side).toBe('start')
  })

  it('reads nothing at rest, and says no data for a gap', () => {
    const model = lineChartModel(input())
    expect(lineChartReadout(input(), model, read(null))).toEqual({
      rows: [],
      announcement: '',
      tooltip: null,
      crosshair: null,
    })
    const gapped = input({
      data: [
        { day: '2026-07-01', opened: 28 },
        { day: '2026-07-02', opened: null },
      ],
      series: [{ key: 'opened', label: 'Opened' }],
    })
    const readout = lineChartReadout(gapped, lineChartModel(gapped), read(1, 2))
    expect(readout.announcement).toContain('Opened No data')
  })

  it('keeps the announcement and the crosshair without the tooltip, and hides the label', () => {
    const model = lineChartModel(input())
    const off = lineChartReadout(input({ tooltip: false }), model, read(0))
    expect(off.tooltip).toBeNull()
    expect(off.crosshair).not.toBeNull()
    expect(off.announcement).toContain('Opened 28')

    const bare = lineChartReadout(input({ tooltip: { hideLabel: true } }), model, read(0))
    expect(bare.tooltip?.header).toBeUndefined()
    expect(bare.tooltip?.rows).toHaveLength(2)
  })

  it('draws no tooltip when every series is hidden', () => {
    const hidden = input({ hidden: new Set(['opened', 'resolved']) })
    const readout = lineChartReadout(hidden, lineChartModel(hidden), read(0))
    expect(readout.tooltip).toBeNull()
    expect(readout.crosshair).not.toBeNull()
  })
})

describe('lineChartSelection', () => {
  it('reports the row at the live position, or nothing at rest', () => {
    const model = lineChartModel(input())
    expect(lineChartSelection(input(), model, { index: 1, series: null })).toEqual({
      index: 1,
      datum: DAYS[1],
    })
    expect(lineChartSelection(input(), model, { index: null, series: null })).toBeNull()
    expect(lineChartSelection(input(), model, { index: 9, series: null })).toBeNull()
  })
})

describe('the brush over a continuous x', () => {
  it('spans the two rows on the plot, and nothing for a row with no position', () => {
    const model = lineChartModel(input())
    const span = brushSpan(model, { anchor: 2, edge: 0, committed: false })
    expect(span?.from).toBe(model.positions[2])
    expect(span?.to).toBe(model.positions[0])
    expect(span?.height).toBe(BOX.height)
    expect(brushSpan(model, null)).toBeNull()
    expect(
      brushSpan(lineChartModel(input({ box: null })), { anchor: 0, edge: 1, committed: false }),
    ).toBeNull()

    const garbled = lineChartModel(
      input({
        data: [
          { day: '2026-07-01', opened: 1 },
          { day: 'not-a-date', opened: 2 },
        ],
      }),
    )
    expect(brushSpan(garbled, { anchor: 0, edge: 1, committed: false })).toBeNull()
  })

  it('commits the rows’ ISO strings on a time x and their numbers on a linear x, sorted', () => {
    const timed = lineChartModel(input())
    expect(brushValues(input(), timed, 2, 0)).toEqual(['2026-07-01', '2026-07-03'])

    const linear = input({
      data: [
        { minute: 20, opened: 4 },
        { minute: 0, opened: 6 },
        { minute: 10, opened: 5 },
      ],
      series: [{ key: 'opened', label: 'Opened' }],
      x: { key: 'minute', scale: 'linear' },
    })
    expect(brushValues(linear, lineChartModel(linear), 0, 1)).toEqual([0, 20])
  })
})

describe('the sync group', () => {
  const garbled = input({
    data: [
      { day: '2026-07-01', opened: 1 },
      { day: 'not-a-date', opened: 2 },
      { day: '2026-07-08', opened: 3 },
    ],
  })

  it('sends a row’s x-domain value, null at rest, and nothing for a row with no x position', () => {
    const model = lineChartModel(garbled)
    expect(syncValueAt(model, 0)).toBe(new Date(2026, 6, 1).getTime())
    expect(syncValueAt(model, null), 'no reading clears the group').toBeNull()
    expect(syncValueAt(model, 1), 'an unplaced row sends nothing').toBeUndefined()
    expect(syncValueAt(model, 9)).toBeUndefined()
  })

  it('puts a received value on this chart’s nearest row, and clears on null', () => {
    const model = lineChartModel(garbled)
    // Two days after the first row is nearer to it than to the row a week later.
    expect(syncIndexOf(model, new Date(2026, 6, 3).getTime())).toBe(0)
    expect(syncIndexOf(model, new Date(2026, 6, 6).getTime())).toBe(2)
    expect(syncIndexOf(model, null)).toBeNull()

    const banded = lineChartModel(input({ x: { key: 'day', scale: 'band' } }))
    expect(syncIndexOf(banded, 0), 'a band x has no row to put it on').toBeUndefined()
  })
})

/** `y.label` names the measure every line is in, said once in the summary. */
describe('the measure', () => {
  it('says y.label once in the summary sentence, and not at a reading position', () => {
    const named = input({ y: { label: 'Tickets opened' } })
    const model = lineChartModel(named)
    expect(model.summary).toBe(
      'Tickets showing Opened and Resolved, 3 points. Values: Tickets opened. The same data is available as a table.',
    )
    const plain = lineChartModel(input())
    expect(lineChartReadout(named, model, read(1)).announcement).toBe(
      lineChartReadout(input(), plain, read(1)).announcement,
    )
  })
})
