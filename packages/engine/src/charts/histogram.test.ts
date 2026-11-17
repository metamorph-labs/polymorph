import { describe, expect, it } from 'vitest'

import {
  histogramModel,
  histogramReadout,
  histogramSelection,
  type HistogramInput,
} from './histogram'
import { readingView } from './reading'
import { binSample } from './scales'

/**
 * Histogram's model, without a framework: what the React member and every
 * described member draw. The binning arithmetic is tested with `binSample` in
 * `charts.test.ts`; these cover what the model decides over the bins: the
 * contiguous bars, the empty bin, the axes, the warning, the readout's words
 * and the selection.
 */

/** A sample whose Sturges count is stable: n = 32 → ⌈log₂ 32⌉ + 1 = 6 target. */
const SAMPLE = Array.from({ length: 32 }, (_, index) => (index * 13) % 40)

const BOX = { width: 600, height: 200 }

const input = (over: Partial<HistogramInput> = {}): HistogramInput => ({
  data: SAMPLE,
  label: 'Spread',
  locale: 'en-US',
  box: BOX,
  ...over,
})

describe('histogramModel', () => {
  it('anchors the labels of the first and last edges at the plot’s ends', () => {
    const x = histogramModel(input()).axes?.x ?? []
    expect(x[0]?.at).toBe(0)
    expect(x.at(-1)?.at).toBe(BOX.width)
    expect(x[0]?.align).toBe('start')
    expect(x.at(-1)?.align).toBe('end')
    expect(x.slice(1, -1).every((tick) => tick.align === undefined)).toBe(true)
  })

  it('bins the sample through the engine wrapper, with a target count when given', () => {
    expect(histogramModel(input()).bins).toEqual(binSample(SAMPLE))
    expect(histogramModel(input({ bins: 20 })).bins).toEqual(binSample(SAMPLE, 20))
  })

  it('lays the bars contiguously, inset 1px at each shared edge and not at the outer edges', () => {
    const model = histogramModel(input())
    const bars = model.plot?.bars ?? []
    expect(bars.length).toBe(model.bins.length)
    const starts = bars.map((bar) => Number(/^M([\d.]+)/.exec(bar.d ?? '')?.[1]))
    expect(starts[0]).toBe(0)
    const width = BOX.width / model.bins.length
    expect(starts[1]).toBeCloseTo(width + 1)
    // Every hit target spans the bin's full width through the plot.
    expect(bars.every((bar) => bar.hit.height === BOX.height && bar.hit.width >= 24)).toBe(true)
  })

  it('draws no bar for an empty bin and keeps its place and its target', () => {
    const model = histogramModel(input({ data: [1, 1, 2, 9, 9] }))
    const empty = model.bins.findIndex((bin) => bin.count === 0)
    expect(empty).toBeGreaterThan(-1)
    const bar = model.plot?.bars[empty]
    expect(bar?.d).toBeNull()
    expect(bar?.index).toBe(empty)
    expect(model.twin.rows[empty]?.[1]).toBe('0')
  })

  it('anchors the count axis at zero and warns off auto, naming counts', () => {
    const model = histogramModel(input({ y: { domain: 'auto' } }))
    expect(model.warnings).toEqual([expect.stringContaining('counts')])
    expect(model.axes?.y.some((tick) => tick.label === '0')).toBe(true)
    expect(model.plot?.zero).toBe(BOX.height)
    expect(histogramModel(input()).warnings).toEqual([])
  })

  it('ticks the measure at bin edges, keeping the first and the last', () => {
    const model = histogramModel(input())
    const first = model.bins[0]?.from
    const last = model.bins.at(-1)?.to
    const keys = model.axes?.x.map((tick) => tick.key) ?? []
    expect(keys[0]).toBe(String(first))
    expect(keys.at(-1)).toBe(String(last))
    expect(model.axes?.x[0]?.at).toBe(0)
    expect(model.axes?.x.at(-1)?.at).toBe(BOX.width)
  })

  it('has no axes and no plot without bins or before the measurement', () => {
    expect(histogramModel(input({ data: [] })).axes).toBeNull()
    expect(histogramModel(input({ data: [] })).state).toBe('empty')
    expect(histogramModel(input({ box: null })).plot).toBeNull()
    expect(histogramModel(input({ box: null })).axes).toBeNull()
    expect(histogramModel(input({ box: { width: 0, height: 0 } })).plot).toBeNull()
  })

  it('draws a flat sample as one bar across the plot, with one edge on the axis', () => {
    const model = histogramModel(input({ data: [3, 3, 3, 3] }))
    expect(model.bins).toEqual([{ from: 3, to: 3, count: 4 }])
    expect(model.positions).toEqual([BOX.width / 2])
    const bar = model.plot?.bars[0]
    expect(bar?.hit).toEqual({ x: 0, y: 0, width: BOX.width, height: BOX.height })
    // The bar's path spans the plot: a zero-width bar would draw nothing while
    // the twin says the bin holds four.
    const xs = [...(bar?.d ?? '').matchAll(/[ML]\s*(-?[\d.]+)/g)].map((match) => Number(match[1]))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0)
    expect(model.axes?.x).toEqual([{ key: '3', at: BOX.width / 2, label: '3' }])
  })

  it('names the twin’s columns from the axes, or from the catalog', () => {
    expect(histogramModel(input()).twin.columns.map((column) => column.label)).toEqual([
      'Range',
      'Count',
    ])
    const named = histogramModel(input({ x: { label: 'Minutes' }, y: { label: 'Tickets' } }))
    expect(named.twin.columns.map((column) => column.label)).toEqual(['Minutes', 'Tickets'])
    const first = named.bins[0]!
    expect(named.twin.rows[0]).toEqual([`${first.from}–${first.to}`, String(first.count)])
  })

  it('formats the ranges with x.format', () => {
    const model = histogramModel(
      input({ data: [5, 12, 30], x: { format: { style: 'currency', currency: 'USD' } } }),
    )
    expect(model.ranges[0]).toMatch(/^\$[\d.,]+–\$[\d.,]+$/)
  })
})

describe('histogramReadout', () => {
  const read = (over: Partial<HistogramInput>, index: number | null) => {
    const given = input(over)
    const model = histogramModel(given)
    return {
      model,
      readout: histogramReadout(
        given,
        model,
        readingView({ index, series: null }, model.bins.length),
      ),
    }
  }

  it('says the en-dash range and its count, and heads the tooltip with the range', () => {
    const { model, readout } = read({}, 0)
    const first = model.bins[0]!
    expect(readout.announcement).toBe(`${first.from}–${first.to}: ${first.count}`)
    expect(readout.tooltip?.header).toBe(`${first.from}–${first.to}`)
    expect(readout.rows).toEqual([
      {
        key: 'count',
        label: 'Count',
        value: String(first.count),
        paint: 'var(--pm-chart-1)',
      },
    ])
    expect(readout.tooltip?.x).toBe(model.positions[0])
    expect(readout.tooltip?.y).toBe(BOX.height / 2)
    expect(readout.tooltip?.side).toBe('end')
  })

  it('opens the tooltip inward past the halfway mark, and drops its header on hideLabel', () => {
    const { model, readout } = read({ tooltip: { hideLabel: true } }, 40)
    expect(readout.tooltip?.side).toBe('start')
    expect(readout.tooltip?.x).toBe(model.positions.at(-1))
    expect(readout.tooltip).not.toHaveProperty('header')
  })

  it('keeps the announcement without the tooltip, and is silent at rest', () => {
    const off = read({ tooltip: false }, 0).readout
    expect(off.tooltip).toBeNull()
    expect(off.announcement).not.toBe('')
    expect(read({}, null).readout).toEqual({ rows: [], announcement: '', tooltip: null })
  })
})

describe('histogramSelection', () => {
  it('reports the bin’s edges and count, and nothing at rest', () => {
    const given = input()
    const model = histogramModel(given)
    const first = model.bins[0]!
    expect(histogramSelection(given, model, { index: 0, series: null })).toEqual({
      bin: { from: first.from, to: first.to, count: first.count },
    })
    expect(histogramSelection(given, model, { index: null, series: null })).toBeNull()
  })
})
