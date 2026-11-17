import { describe, expect, it } from 'vitest'

import {
  donutChartModel,
  donutChartReadout,
  donutChartSelection,
  type DonutChartInput,
  type DonutSegment,
} from './donut-chart'
import { readingView } from './reading'

/**
 * DonutChart's model, without a framework: what the React member and every
 * described member draw. The members' own tests cover the DOM; these cover the
 * rules the model decides: the total, the shares, which segments take the
 * ring, the warnings, the readout's words and where it sits, and the selection.
 */

const CHANNELS: DonutSegment[] = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const BOX = { width: 400, height: 200 }

const input = (over: Partial<DonutChartInput> = {}): DonutChartInput => ({
  segments: CHANNELS,
  label: 'Channels',
  locale: 'en-US',
  box: BOX,
  ...over,
})

describe('donutChartModel', () => {
  it('draws one arc per segment with a share, in declaration order, at the plot centre', () => {
    const model = donutChartModel(input())
    expect(model.plot?.arcs.map((arc) => arc.key)).toEqual(['email', 'chat', 'phone', 'social'])
    expect(model.plot?.arcs.map((arc) => arc.index)).toEqual([0, 1, 2, 3])
    expect(model.plot?.transform).toBe('translate(200 100)')
    // The ring fits the plot's shorter side.
    expect(model.radius).toBe(100)
    expect(model.total).toBe(369)
    expect(model.plot?.arcs[0]?.paint).toBe(model.painted[0]?.paint)
  })

  it('has no plot before the measurement, and no arcs over an empty total', () => {
    expect(donutChartModel(input({ box: null })).plot).toBeNull()
    const zeroes = donutChartModel(
      input({
        segments: [
          { key: 'a', label: 'A', value: 0 },
          { key: 'b', label: 'B', value: 0 },
        ],
      }),
    )
    expect(zeroes.plot?.arcs).toEqual([])
    expect(zeroes.bearings).toEqual([])
    expect(zeroes.twin.rows.map((row) => row[2])).toEqual(['0%', '0%'])
  })

  it('keeps a zero segment off the ring and in the legend and the twin', () => {
    const model = donutChartModel(
      input({ segments: [...CHANNELS.slice(0, 3), { key: 'social', label: 'Social', value: 0 }] }),
    )
    expect(model.plot?.arcs).toHaveLength(3)
    expect(model.painted).toHaveLength(4)
    expect(model.twin.rows[3]).toEqual(['Social', '0', '0%'])
    // A zero segment still has a bearing, so a reader who arrows onto it gets a readout.
    expect(model.bearings).toHaveLength(4)
  })

  it('keeps a negative segment off the ring and in the twin, with a warning', () => {
    const model = donutChartModel(
      input({
        segments: [
          { key: 'sales', label: 'Sales', value: 400 },
          { key: 'refunds', label: 'Refunds', value: -60 },
        ],
      }),
    )
    expect(model.plot?.arcs.map((arc) => arc.key)).toEqual(['sales'])
    expect(model.total).toBe(400)
    expect(model.twin.rows[1]).toEqual(['Refunds', '-60', '0%'])
    expect(model.warnings).toEqual([expect.stringContaining('A share cannot be negative')])
  })

  it('counts a value that is not a number as zero, so the rest of the ring draws', () => {
    const model = donutChartModel(
      input({
        segments: [
          { key: 'email', label: 'Email', value: 214 },
          { key: 'chat', label: 'Chat', value: Number.NaN },
          { key: 'phone', label: 'Phone', value: 41 },
        ],
      }),
    )
    expect(model.plot?.arcs.map((arc) => arc.key)).toEqual(['email', 'phone'])
    expect(model.total).toBe(255)
    // The twin prints its em dash for an empty cell.
    expect(model.twin.rows[1]?.[1]).toBe('')
  })

  it('warns past six segments, naming the fold into "Other"', () => {
    const seven = Array.from({ length: 7 }, (_, index) => ({
      key: `k${index}`,
      label: `K${index}`,
      value: index + 1,
    }))
    expect(donutChartModel(input({ segments: seven })).warnings).toEqual([
      expect.stringContaining('"Other" segment'),
    ])
    expect(donutChartModel(input({ segments: seven.slice(0, 6) })).warnings).toEqual([])
  })

  it('grows a sliver’s pointer target past its painted arc', () => {
    const model = donutChartModel(
      input({
        segments: [
          { key: 'bulk', label: 'Bulk', value: 990 },
          { key: 'sliver', label: 'Sliver', value: 10 },
        ],
      }),
    )
    const sliver = model.plot?.arcs[1]
    expect(sliver?.hit).not.toBe('')
    expect(sliver?.hit).not.toBe(sliver?.d)
  })

  it('places the centre figure at the centre, with its label below', () => {
    const plot = donutChartModel(input({ center: { value: '369', label: 'Open tickets' } })).plot
    expect(plot?.center).toEqual({
      value: '369',
      label: 'Open tickets',
      x: 200,
      y: 100,
      labelY: 118,
    })
    expect(donutChartModel(input({ center: { value: '369' } })).plot?.center).not.toHaveProperty(
      'label',
    )
    expect(donutChartModel(input()).plot?.center).toBeNull()
  })

  it('shows a legend for two or more segments, and names the activation only with a select', () => {
    expect(donutChartModel(input()).legend).toBe(true)
    expect(
      donutChartModel(input({ segments: [{ key: 'all', label: 'All', value: 12 }] })).legend,
    ).toBe(false)
    expect(donutChartModel(input()).summary).toBe(
      'Channels, 4 segments. The same data is available as a table.',
    )
    expect(donutChartModel(input({ selectable: true })).summary).toContain('Enter or Space selects')
  })
})

describe('donutChartReadout', () => {
  const read = (over: Partial<DonutChartInput>, index: number | null) => {
    const given = input(over)
    const model = donutChartModel(given)
    return donutChartReadout(
      given,
      model,
      readingView({ index, series: null }, given.segments.length),
    )
  }

  it('says the label, the value and the share, and shows the same in the tooltip', () => {
    const readout = read({}, 1)
    expect(readout.announcement).toBe('Chat: 96, 26%')
    expect(readout.rows).toEqual([
      { key: 'chat', label: 'Chat', value: '96 · 26%', paint: expect.stringContaining('var(') },
    ])
    expect(readout.tooltip?.rows).toEqual(readout.rows)
    expect(readout.tooltip).not.toHaveProperty('header')
  })

  it('places the tooltip outside the ring on the bearing, inside the block edges', () => {
    // The first segment's bearing is up and to the right: the readout opens toward the start.
    const first = read({}, 0).tooltip
    expect(first?.x).toBeGreaterThan(200)
    expect(first?.side).toBe('start')
    // Twelve o'clock is above the top edge on a ring that fills the height, so it is held 24px in.
    expect(first?.y).toBeGreaterThanOrEqual(24)
    const last = read({}, 3).tooltip
    expect(last?.x).toBeLessThan(200)
    expect(last?.side).toBe('end')
  })

  it('keeps the announcement without the tooltip, and is silent at rest', () => {
    const off = read({ tooltip: false }, 0)
    expect(off.tooltip).toBeNull()
    expect(off.announcement).toBe('Email: 214, 58%')
    expect(read({ box: null }, 0).tooltip).toBeNull()
    expect(read({}, null)).toEqual({ rows: [], announcement: '', tooltip: null })
  })

  it('prints an em dash for a value that is not a number', () => {
    const readout = read(
      {
        segments: [
          { key: 'email', label: 'Email', value: 214 },
          { key: 'chat', label: 'Chat', value: Number.NaN },
        ],
      },
      1,
    )
    expect(readout.announcement).toBe('Chat: —, 0%')
  })
})

describe('donutChartSelection', () => {
  it('reports the segment with its share, and nothing for a value that is not a number', () => {
    const given = input()
    const model = donutChartModel(given)
    expect(donutChartSelection(given, model, { index: 1, series: null })).toEqual({
      key: 'chat',
      label: 'Chat',
      value: 96,
      share: 96 / 369,
    })
    expect(donutChartSelection(given, model, { index: null, series: null })).toBeNull()

    const gapped = input({ segments: [{ key: 'a', label: 'A', value: Number.NaN }] })
    expect(
      donutChartSelection(gapped, donutChartModel(gapped), { index: 0, series: null }),
    ).toBeNull()
  })
})
