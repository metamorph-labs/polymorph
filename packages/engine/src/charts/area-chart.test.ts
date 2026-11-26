import { describe, expect, it } from 'vitest'

import {
  areaChartModel,
  areaChartReadout,
  areaChartSelection,
  type AreaChartInput,
} from './area-chart'
import { brushSpan, brushValues } from './line-chart'
import { readingView } from './reading'
import type { ChartDatum } from './types'

/**
 * AreaChart's model, without a framework: what the React member and every
 * described member draw. The members' own tests cover the DOM; these cover the
 * rules the model decides: the stack and its total, the gap and the negative
 * value, the percent variant's shares, the restack on isolate, the warnings,
 * the readout's words, the selection, and the brush on a time x only.
 */

const WEEKS: ChartDatum[] = [
  { week: 'W30', urgent: 12, high: 34, normal: 68 },
  { week: 'W31', urgent: 16, high: 36, normal: 60 },
  { week: 'W32', urgent: 14, high: 38, normal: 64 },
]

const PRIORITY = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

const DAYS: ChartDatum[] = [
  { day: '2026-07-01', urgent: 4, high: 9 },
  { day: '2026-07-02', urgent: 6, high: 7 },
  { day: '2026-07-03', urgent: 5, high: 8 },
]

const BOX = { width: 400, height: 200 }

const input = (over: Partial<AreaChartInput> = {}): AreaChartInput => ({
  data: WEEKS,
  series: PRIORITY,
  x: { key: 'week' },
  label: 'Backlog',
  locale: 'en-US',
  box: BOX,
  ...over,
})

const read = (index: number | null, count = WEEKS.length) =>
  readingView({ index, series: null }, count)

const top = (over: Partial<AreaChartInput> = {}) =>
  Math.max(
    ...(areaChartModel(input(over)).axes?.y ?? []).map((tick) =>
      Number(tick.label.replace(/\D/g, '')),
    ),
  )

describe('areaChartModel', () => {
  it('stacks bottom-up in declaration order, a wash and an edge per band', () => {
    const model = areaChartModel(input())
    expect(model.plot?.bands.map((band) => band.key)).toEqual(['urgent', 'high', 'normal'])
    expect(model.plot?.bands.every((band) => band.fill.endsWith('Z') && band.edge !== '')).toBe(
      true,
    )
    // The first band sits on the baseline: its floor is zero at every x.
    expect(model.segments[0]?.map((segment) => segment.from)).toEqual([0, 0, 0])
    expect(model.segments[2]?.[0]?.to).toBe(114)
    expect(areaChartModel(input({ box: null })).plot).toBeNull()
  })

  it('reaches the running total on the value axis, and 100% in the percent variant', () => {
    expect(top()).toBeGreaterThanOrEqual(114)
    const percent = areaChartModel(input({ variant: 'percent' }))
    expect(percent.axes?.y.at(-1)?.label).toBe('100%')
    expect(percent.segments[2]?.[0]?.to).toBe(1)
  })

  it('restacks on the remaining total when a series is hidden, and keeps the full total with all hidden', () => {
    expect(top({ hidden: new Set(['normal']) })).toBeLessThan(top())
    expect(top({ hidden: new Set(['urgent', 'high', 'normal']) })).toBe(top())
    const hidden = areaChartModel(input({ hidden: new Set(['high']) }))
    expect(hidden.plot?.bands.map((band) => band.key)).toEqual(['urgent', 'normal'])
    expect(hidden.twin.rows[0]).toEqual(['W30', '12', '34', '68'])
  })

  it('breaks a band at a gap and at a negative value, which stays in the twin', () => {
    const model = areaChartModel(
      input({
        data: [
          { week: 'W30', urgent: 12, high: 34 },
          { week: 'W31', urgent: -8, high: 36 },
          { week: 'W32', urgent: 14, high: 38 },
          { week: 'W33', urgent: null, high: 30 },
          { week: 'W34', urgent: 10, high: 31 },
        ],
        series: PRIORITY.slice(0, 2),
      }),
    )
    expect(model.plot?.bands[0]?.fill.match(/M/g)).toHaveLength(3)
    expect(model.plot?.bands[0]?.edge.match(/M/g)).toHaveLength(3)
    expect(model.plot?.bands[1]?.fill.match(/M/g)).toHaveLength(1)
    expect(model.twin.rows[1]?.[1]).toBe('-8')
    expect(model.twin.rows[3]?.[1]).toBe('')
    expect(model.warnings.some((message) => message.includes('below zero'))).toBe(true)
  })

  it('shows value and share in the percent twin, and the value alone for a hidden series', () => {
    const model = areaChartModel(input({ variant: 'percent', hidden: new Set(['normal']) }))
    expect(model.twin.rows[0]?.[1]).toMatch(/^12 · \d+%$/)
    expect(model.twin.rows[0]?.[3]).toBe('68')
  })

  it('draws the baseline only when stacked, and annotations in the ratio domain', () => {
    expect(areaChartModel(input({ baseline: { value: 120 } })).plot?.ink?.rules).toHaveLength(1)
    const percent = areaChartModel(
      input({
        variant: 'percent',
        baseline: { value: 120 },
        annotations: [{ kind: 'band', from: 0.25, to: 0.5 }],
      }),
    )
    expect(percent.plot?.ink?.rules).toEqual([])
    expect(percent.plot?.wash[0]?.height).toBe(BOX.height / 4)
    expect(percent.warnings.some((message) => message.includes('every x totals 100%'))).toBe(true)
  })

  it('warns once per unlawful use, naming what the caller probably wants', () => {
    const lone = areaChartModel(input({ series: PRIORITY.slice(0, 1), y: { domain: 'auto' } }))
    expect(lone.warnings).toHaveLength(2)
    expect(lone.warnings[0]).toContain('variant="area"')
    expect(lone.warnings[1]).toContain('y.domain "auto"')

    const banded = areaChartModel(input({ brushable: true, syncId: 'pair' }))
    expect(banded.warnings).toHaveLength(2)
    expect(banded.brushOn).toBe(false)
    expect(banded.syncGroup).toBeUndefined()

    const linear = areaChartModel(
      input({
        data: [
          { minute: 0, urgent: 4, high: 9 },
          { minute: 10, urgent: 6, high: 7 },
        ],
        series: PRIORITY.slice(0, 2),
        x: { key: 'minute', scale: 'linear' },
        brushable: true,
        syncId: 'pair',
      }),
    )
    // One warning names LineChart; a linear x has no brush and no group, and still draws.
    expect(linear.warnings).toHaveLength(1)
    expect(linear.warnings[0]).toContain('LineChart')
    expect(linear.brushOn).toBe(false)
    expect(linear.syncGroup).toBeUndefined()
    expect(linear.domainValues).toEqual([null, null])
    expect(linear.plot?.bands).toHaveLength(2)

    const timed = areaChartModel(
      input({
        data: DAYS,
        series: PRIORITY.slice(0, 2),
        x: { key: 'day', scale: 'time' },
        brushable: true,
        syncId: 'pair',
      }),
    )
    expect(timed.warnings).toEqual([])
    expect(timed.brushOn).toBe(true)
    expect(timed.syncGroup).toBe('pair')
  })
})

describe('areaChartReadout', () => {
  it('reads every visible series at the position, with the crosshair', () => {
    const model = areaChartModel(input())
    const readout = areaChartReadout(input(), model, read(0))
    expect(readout.announcement).toBe('W30: Urgent 12, High 34, Normal 68')
    expect(readout.crosshair).toMatch(/^M/)
    expect(readout.tooltip?.header).toBe('W30')
    expect(areaChartReadout(input(), model, read(null)).crosshair).toBeNull()
  })

  it('reads value and share in the percent variant, and no data for a gap', () => {
    const percent = input({ variant: 'percent' })
    const shares = areaChartReadout(percent, areaChartModel(percent), read(0))
    expect(shares.rows[0]?.value).toMatch(/^12 · \d+%$/)

    const gapped = input({
      data: [
        { week: 'W30', urgent: 12, high: 34 },
        { week: 'W31', urgent: null, high: 36 },
      ],
      series: PRIORITY.slice(0, 2),
    })
    const readout = areaChartReadout(gapped, areaChartModel(gapped), read(1, 2))
    expect(readout.announcement).toBe('W31: Urgent No data, High 36')
  })

  it('keeps the announcement and the crosshair without the tooltip', () => {
    const off = input({ tooltip: false })
    const readout = areaChartReadout(off, areaChartModel(off), read(1))
    expect(readout.tooltip).toBeNull()
    expect(readout.crosshair).not.toBeNull()
    expect(readout.announcement).toContain('Urgent 16')
  })
})

describe('areaChartSelection and the brush', () => {
  it('reports the row at the live position', () => {
    const model = areaChartModel(input())
    expect(areaChartSelection(input(), model, { index: 2, series: null })).toEqual({
      index: 2,
      datum: WEEKS[2],
    })
    expect(areaChartSelection(input(), model, { index: null, series: null })).toBeNull()
  })

  it('commits the rows’ ISO strings on a time x, sorted, over the span it draws', () => {
    const timed = input({
      data: DAYS,
      series: PRIORITY.slice(0, 2),
      x: { key: 'day', scale: 'time' },
    })
    const model = areaChartModel(timed)
    expect(brushValues(timed, model, 2, 0)).toEqual(['2026-07-01', '2026-07-03'])
    const span = brushSpan(model, { anchor: 0, edge: 2, committed: true })
    expect(span?.from).toBe(model.positions[0])
    expect(span?.to).toBe(model.positions[2])
  })
})

/** `y.label` names the measure every band is in, said once in the summary. */
describe('the measure', () => {
  it('says y.label once in the summary sentence, and not at a reading position', () => {
    const named = input({ y: { label: 'Open tickets' } })
    const model = areaChartModel(named)
    expect(model.summary).toBe(
      'Backlog showing Urgent, High and Normal, 3 points. Values: Open tickets. The same data is available as a table.',
    )
    const plain = areaChartModel(input())
    expect(areaChartReadout(named, model, read(1)).announcement).toBe(
      areaChartReadout(input(), plain, read(1)).announcement,
    )
  })
})
