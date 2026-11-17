import { describe, expect, it } from 'vitest'

import {
  funnelChartModel,
  funnelChartReadout,
  funnelChartSelection,
  type FunnelChartInput,
  type FunnelStage,
} from './funnel-chart'
import { readingView } from './reading'

/**
 * FunnelChart's model, without a framework: what the React member and every
 * described member draw. The members' tests and the shared law cover the DOM;
 * these cover the rules the model decides: each bar's length against its
 * value, the shares and the step rates, what a zero or a rising stage does,
 * which text fits, the warnings, the readout's words and the selection.
 */

const SIGNUP: FunnelStage[] = [
  { key: 'visited', label: 'Visited', value: 12_400 },
  { key: 'signed', label: 'Signed up', value: 7688 },
  { key: 'activated', label: 'Activated', value: 3460 },
  { key: 'paid', label: 'Paid', value: 1488 },
]

const BOX = { width: 600, height: 224 }

const input = (over: Partial<FunnelChartInput> = {}): FunnelChartInput => ({
  stages: SIGNUP,
  label: 'Signup funnel',
  locale: 'en-US',
  box: BOX,
  ...over,
})

/** A bar path's run along the inline axis: its `M` x to its furthest x. */
function run(d: string): { from: number; to: number } {
  const xs = [...d.matchAll(/[MLA][^MLAZ]*/g)].map((command) => {
    const numbers = command[0].slice(1).trim().split(/\s+/).map(Number)
    // An arc's end point is its last two numbers; a move or a line has two.
    return numbers.at(-2) ?? 0
  })
  return { from: Math.min(...xs), to: Math.max(...xs) }
}

describe('funnelChartModel', () => {
  it('draws one bar per stage from the label column, its length its value against the largest', () => {
    const model = funnelChartModel(input())
    const plot = model.plot
    expect(plot?.bars.map((bar) => bar.key)).toEqual(['visited', 'signed', 'activated', 'paid'])
    const runs = (plot?.bars ?? []).map((bar) => run(bar.d))
    for (const each of runs) expect(each.from).toBeCloseTo(plot?.start ?? 0, 5)
    const longest = (runs[0]?.to ?? 0) - (plot?.start ?? 0)
    SIGNUP.forEach((stage, index) => {
      const length = (runs[index]?.to ?? 0) - (plot?.start ?? 0)
      expect(length / longest).toBeCloseTo(stage.value / 12_400, 5)
      expect(model.ends[index]).toBeCloseTo(runs[index]?.to ?? 0, 5)
    })
    // One series: every bar takes slot 1.
    expect(new Set(plot?.bars.map((bar) => bar.paint))).toEqual(new Set(['var(--pm-chart-1)']))
  })

  it('stacks the stages top to bottom, one row each, with a target as tall as the row', () => {
    const model = funnelChartModel(input())
    expect(model.positions).toEqual([28, 84, 140, 196])
    for (const bar of model.plot?.bars ?? []) {
      expect(bar.hit.width).toBe(600)
      expect(bar.hit.height).toBe(56)
    }
  })

  it('states each share of the first stage and each step from the stage before', () => {
    const model = funnelChartModel(input())
    expect(model.shares).toEqual([1, 7688 / 12_400, 3460 / 12_400, 1488 / 12_400])
    expect(model.rates).toEqual([null, 7688 / 12_400, 3460 / 7688, 1488 / 3460])
    expect(model.plot?.values.map((value) => value.text)).toEqual([
      '12,400 · 100%',
      '7,688 · 62%',
      '3,460 · 27.9%',
      '1,488 · 12%',
    ])
    expect(model.plot?.steps.map((step) => step.text)).toEqual([
      '62% continued',
      '45% continued',
      '43% continued',
    ])
    // A step sits on the boundary between the two rows it joins, at the bars' start.
    expect(model.plot?.steps.map((step) => step.y)).toEqual([56, 112, 168])
    expect(model.plot?.steps.every((step) => step.x === model.plot?.start)).toBe(true)
  })

  it('writes every stage into the twin, with an empty cell where there is no step', () => {
    const model = funnelChartModel(input())
    expect(model.twin.columns.map((column) => column.label)).toEqual([
      'Stage',
      'Value',
      'Share',
      'Continued',
    ])
    expect(model.twin.rows).toEqual([
      ['Visited', '12,400', '100%', ''],
      ['Signed up', '7,688', '62%', '62%'],
      ['Activated', '3,460', '27.9%', '45%'],
      ['Paid', '1,488', '12%', '43%'],
    ])
    expect(model.summary).toBe('Signup funnel, 4 stages. The same data is available as a table.')
  })

  it('has no plot before the measurement and nothing to draw for no stages', () => {
    expect(funnelChartModel(input({ box: null })).plot).toBeNull()
    const empty = funnelChartModel(input({ stages: [] }))
    expect(empty.state).toBe('empty')
    expect(empty.plot).toBeNull()
    expect(empty.twin.rows).toEqual([])
  })

  it('draws one stage at full length, with its whole share and no step', () => {
    const model = funnelChartModel(input({ stages: SIGNUP.slice(0, 1) }))
    expect(model.plot?.bars).toHaveLength(1)
    expect(model.plot?.steps).toEqual([])
    expect(model.shares).toEqual([1])
    expect(model.summary).toContain('1 stage.')
  })

  it('gives no share and no step after a first stage of zero, never NaN', () => {
    const model = funnelChartModel(
      input({
        stages: [
          { key: 'a', label: 'A', value: 0 },
          { key: 'b', label: 'B', value: 0 },
        ],
      }),
    )
    expect(model.shares).toEqual([null, null])
    expect(model.rates).toEqual([null, null])
    expect(model.plot?.bars.map((bar) => bar.d)).toEqual(['', ''])
    expect(model.twin.rows).toEqual([
      ['A', '0', '', ''],
      ['B', '0', '', ''],
    ])
    expect(JSON.stringify(model)).not.toContain('NaN')
  })

  it('draws no bar for a stage of zero in the middle, and no step out of it', () => {
    const model = funnelChartModel(
      input({
        stages: [
          { key: 'a', label: 'A', value: 100 },
          { key: 'b', label: 'B', value: 0 },
          { key: 'c', label: 'C', value: 0 },
        ],
      }),
    )
    expect(model.plot?.bars.map((bar) => bar.d === '')).toEqual([false, true, true])
    expect(model.shares).toEqual([1, 0, 0])
    expect(model.rates).toEqual([null, 0, null])
    expect(model.plot?.steps.map((step) => step.text)).toEqual(['0% continued'])
  })

  it('draws equal stages at equal lengths, each step at the whole', () => {
    const model = funnelChartModel(
      input({
        stages: [
          { key: 'a', label: 'A', value: 50 },
          { key: 'b', label: 'B', value: 50 },
        ],
      }),
    )
    const [a, b] = (model.plot?.bars ?? []).map((bar) => run(bar.d))
    expect(a).toEqual(b)
    expect(model.ends[0]).toBe(model.ends[1])
    expect(model.rates).toEqual([null, 1])
  })

  it('draws a stage that rises as given, against the largest, and warns', () => {
    const model = funnelChartModel(
      input({
        stages: [
          { key: 'a', label: 'Trial', value: 100 },
          { key: 'b', label: 'Paid', value: 150 },
        ],
      }),
    )
    const start = model.plot?.start ?? 0
    expect((model.ends[1] ?? 0) - start).toBeGreaterThan((model.ends[0] ?? 0) - start)
    expect(((model.ends[0] ?? 0) - start) / ((model.ends[1] ?? 0) - start)).toBeCloseTo(100 / 150)
    expect(model.shares).toEqual([1, 1.5])
    expect(model.warnings.join(' ')).toMatch(/"Paid" is larger than the stage before/)
  })

  it('keeps a negative stage off the plot and in the twin, with a warning', () => {
    const model = funnelChartModel(
      input({
        stages: [
          { key: 'a', label: 'A', value: 40 },
          { key: 'b', label: 'B', value: -5 },
        ],
      }),
    )
    expect(model.plot?.bars[1]?.d).toBe('')
    expect(model.shares[1]).toBeNull()
    expect(model.twin.rows[1]).toEqual(['B', '-5', '', ''])
    expect(model.warnings.join(' ')).toMatch(/cannot be negative/)
  })

  it('caps the label column at two fifths of the plot for a very long label', () => {
    const long = 'Completed the identity verification step on the second attempt'
    const model = funnelChartModel(
      input({ stages: [{ key: 'a', label: long, value: 10 }, ...SIGNUP.slice(1)] }),
    )
    expect(model.plot?.labelWidth).toBe(600 * 0.4)
    expect(model.plot?.labels[0]?.text).toBe(long)
  })

  it('fits twelve stages at phone width: every label, no step lines, values while they fit', () => {
    const stages = Array.from({ length: 12 }, (_, index) => ({
      key: `s${index}`,
      label: `Stage ${index + 1}`,
      value: 1000 - index * 80,
    }))
    const model = funnelChartModel(input({ stages, box: { width: 303, height: 224 } }))
    const plot = model.plot
    expect(plot?.bars).toHaveLength(12)
    expect(plot?.labels).toHaveLength(12)
    // A row is shorter than a line and a bar, so the steps go to the tooltip and the twin.
    expect(plot?.steps).toEqual([])
    expect(plot?.values).toHaveLength(12)
    for (const value of plot?.values ?? []) {
      expect(value.x + value.text.length * 7.2).toBeLessThanOrEqual(303 + 0.001)
    }
  })

  it('drops whole labels at an even stride when the rows are shorter than a line', () => {
    const stages = Array.from({ length: 12 }, (_, index) => ({
      key: `s${index}`,
      label: `S${index + 1}`,
      value: 100 - index,
    }))
    const model = funnelChartModel(input({ stages, box: { width: 400, height: 144 } }))
    const kept = model.plot?.labels.map((label) => label.index)
    expect(kept?.length).toBeLessThan(12)
    expect(kept?.[0]).toBe(0)
    expect(kept?.at(-1)).toBe(11)
    // A value goes with its label.
    expect(model.plot?.values.map((value) => value.index)).toEqual(kept)
  })

  it('leaves the values to the tooltip on a plot too narrow for them and a bar', () => {
    const model = funnelChartModel(input({ box: { width: 150, height: 224 } }))
    expect(model.plot?.values).toEqual([])
    expect(model.plot?.bars.every((bar) => bar.d !== '')).toBe(true)
  })
})

describe('funnelChartReadout', () => {
  const model = funnelChartModel(input())

  it('says the value, the share and the step, and shows them by the bar', () => {
    const readout = funnelChartReadout(input(), model, readingView({ index: 2, series: null }, 4))
    expect(readout.announcement).toBe('Activated: 3,460, 27.9%, 45% continued')
    expect(readout.tooltip?.header).toBe('45% continued')
    expect(readout.tooltip?.rows).toEqual([
      { key: 'activated', label: 'Activated', value: '3,460 · 27.9%', paint: 'var(--pm-chart-1)' },
    ])
    expect(readout.tooltip?.x).toBeCloseTo(model.ends[2] ?? 0)
    expect(readout.tooltip?.y).toBe(140)
  })

  it('says no step for the first stage and no share after a zero', () => {
    expect(
      funnelChartReadout(input(), model, readingView({ index: 0, series: null }, 4)).announcement,
    ).toBe('Visited: 12,400, 100%')
    const zero = input({ stages: [{ key: 'a', label: 'A', value: 0 }, ...SIGNUP.slice(1, 2)] })
    expect(
      funnelChartReadout(zero, funnelChartModel(zero), readingView({ index: 1, series: null }, 2))
        .announcement,
    ).toBe('Signed up: 7,688')
  })

  it('keeps the announcement and drops the visual layer with the tooltip off', () => {
    const readout = funnelChartReadout(
      input({ tooltip: false }),
      model,
      readingView({ index: 1, series: null }, 4),
    )
    expect(readout.tooltip).toBeNull()
    expect(readout.announcement).toContain('Signed up')
  })

  it('reads nothing at rest', () => {
    expect(
      funnelChartReadout(input(), model, readingView({ index: null, series: null }, 4)),
    ).toEqual({ rows: [], announcement: '', tooltip: null })
  })
})

describe('funnelChartSelection', () => {
  it('reports the stage read, and nothing at rest or for a value that is not a number', () => {
    const model = funnelChartModel(input())
    expect(funnelChartSelection(input(), model, { index: 1, series: null })).toEqual({
      index: 1,
      key: 'signed',
      label: 'Signed up',
      value: 7688,
    })
    expect(funnelChartSelection(input(), model, { index: null, series: null })).toBeNull()
    const bad = input({ stages: [{ key: 'a', label: 'A', value: Number.NaN }] })
    expect(funnelChartSelection(bad, funnelChartModel(bad), { index: 0, series: null })).toBeNull()
  })
})
