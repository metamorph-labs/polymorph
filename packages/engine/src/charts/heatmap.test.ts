import { describe, expect, it } from 'vitest'

import { HIT_TARGET_MIN } from './geometry'
import { heatmapModel, heatmapReadout, heatmapSelection, type HeatmapInput } from './heatmap'
import type { ChartDatum } from './types'

/**
 * Heatmap's drawing without a framework: what the React member and every
 * described member render. The React member's tests cover the same rules
 * through the DOM; these cover the model's rules directly.
 */

const BOX = { width: 300, height: 120 }

const GRID: ChartDatum[] = ['Mon', 'Tue', 'Wed'].flatMap((day, row) =>
  ['08–12', '12–16', '16–20'].map((band, column) => ({
    band,
    day,
    tickets: 10 * (row + 1) + column,
  })),
)

/** Signed deltas over `[-8, +8]`, with one exact zero. */
const SIGNED: ChartDatum[] = [
  { shift: 'Morning', day: 'Mon', delta: -6 },
  { shift: 'Midday', day: 'Mon', delta: 8 },
  { shift: 'Evening', day: 'Mon', delta: 0 },
  { shift: 'Morning', day: 'Tue', delta: -1 },
  { shift: 'Midday', day: 'Tue', delta: 1 },
  { shift: 'Evening', day: 'Tue', delta: 3 },
]

const input = (overrides: Partial<HeatmapInput> = {}): HeatmapInput => ({
  data: GRID,
  x: { key: 'band' },
  y: { key: 'day', label: 'Day' },
  value: { key: 'tickets' },
  label: 'Volume',
  box: BOX,
  ...overrides,
})

const at = (index: number | null, series: number | null = 0) => ({
  index,
  series,
  active: index !== null,
})

describe('the heatmap model', () => {
  it('anchors a column label wider than the room beside its cell, and centres one that fits', () => {
    expect(heatmapModel(input()).axes?.x.every((tick) => tick.align === undefined)).toBe(true)
    const days = Array.from({ length: 14 }, (_, index) => `Jul ${index + 1}`)
    const model = heatmapModel(
      input({
        data: days.map((band) => ({ band, day: 'Mon', tickets: 1 })),
        box: { width: 300, height: 120 },
      }),
    )
    const x = model.axes?.x ?? []
    expect(x[0]?.label).toBe('Jul 1')
    expect(x[0]?.align).toBe('start')
    expect(x.at(-1)?.label).toBe('Jul 14')
    expect(x.at(-1)?.align).toBe('end')
    expect(x.slice(1, -1).every((tick) => tick.align === undefined)).toBe(true)
  })

  it('draws a cell per measurement and a pointer target per grid position', () => {
    const model = heatmapModel(
      input({ data: GRID.map((row, index) => (index === 4 ? { ...row, tickets: null } : row)) }),
    )
    expect(model.columns).toEqual(['08–12', '12–16', '16–20'])
    expect(model.rows).toEqual(['Mon', 'Tue', 'Wed'])
    // An absent cell draws nothing, and still has a target that reads "no data".
    expect(model.plot?.cells).toHaveLength(8)
    expect(model.plot?.hits).toHaveLength(9)
    for (const hit of model.plot?.hits ?? []) {
      expect(hit.width).toBeGreaterThanOrEqual(HIT_TARGET_MIN)
      expect(hit.height).toBeGreaterThanOrEqual(HIT_TARGET_MIN)
    }
    expect(model.warnings).toEqual([])
  })

  it('draws nothing before the plot is measured, and keeps the summary without a grid', () => {
    const model = heatmapModel(input({ box: null }))
    expect(model.plot).toBeNull()
    expect(model.axes).toBeNull()
    expect(model.columns).toEqual([])
    expect(model.summary).toBe('Volume. The same data is available as a table.')
  })

  it('quantises onto the seven sequential steps, with the extremes at the ends', () => {
    const model = heatmapModel(input())
    const paints = model.plot?.cells.map((cell) => cell.paint) ?? []
    for (const paint of paints) expect(paint).toMatch(/^var\(--pm-chart-seq-[1-7]\)$/)
    expect(paints[0]).toBe('var(--pm-chart-seq-1)')
    expect(paints.at(-1)).toBe('var(--pm-chart-seq-7)')
    expect(model.legend).toBe(true)
    expect(model.scale).toMatchObject({ variant: 'sequential', min: '10', max: '32' })
  })

  it('switches to the diverging arms on signed data, with the mid only at exactly zero', () => {
    const model = heatmapModel(
      input({ data: SIGNED, x: { key: 'shift' }, value: { key: 'delta' } }),
    )
    const paints = model.plot?.cells.map((cell) => cell.paint) ?? []
    expect(paints).toContain('var(--pm-chart-neg-3)')
    expect(paints).toContain('var(--pm-chart-pos-3)')
    expect(paints).toContain('var(--pm-chart-neg-1)')
    expect(paints).toContain('var(--pm-chart-pos-1)')
    expect(paints.filter((paint) => paint === 'var(--pm-chart-mid)')).toHaveLength(1)
    expect(paints.some((paint) => paint.includes('seq'))).toBe(false)
    // The symmetric range's bounds, not the data's extent.
    expect(model.scale).toEqual({ variant: 'diverging', min: '-8', zero: '0', max: '8' })
  })

  it('shows no scale legend over an extent that was never measured', () => {
    const unmeasured = heatmapModel(input({ data: GRID.map((row) => ({ ...row, tickets: null })) }))
    expect(unmeasured.plot?.cells).toHaveLength(0)
    expect(unmeasured.plot?.hits).toHaveLength(9)
    expect(unmeasured.legend).toBe(false)

    const empty = heatmapModel(input({ data: [] }))
    expect(empty.state).toBe('empty')
    expect(empty.legend).toBe(false)
    expect(empty.axes).toBeNull()
    expect(empty.plot).toBeNull()
    expect(empty.twin.rows).toEqual([])

    expect(heatmapModel(input({ loading: true })).state).toBe('loading')
  })

  it("summarises the grid's shape, with the activation hint when the chart is selectable", () => {
    expect(heatmapModel(input()).summary).toContain('Volume, 3 rows by 3 columns.')
    expect(heatmapModel(input()).summary).not.toContain('Enter or Space')
    expect(heatmapModel(input({ selectable: true })).summary).toContain(
      'Enter or Space selects the current reading.',
    )
  })

  it('lays out the twin as the same grid: a row per y and a column per x', () => {
    const model = heatmapModel(
      input({ data: GRID.map((row, index) => (index === 4 ? { ...row, tickets: null } : row)) }),
    )
    expect(model.twin.columns[0]).toEqual({ key: '__y', label: 'Day' })
    expect(model.twin.columns.slice(1).every((column) => column.numeric)).toBe(true)
    expect(model.twin.rows).toEqual([
      ['Mon', '10', '11', '12'],
      ['Tue', '20', '', '22'],
      ['Wed', '30', '31', '32'],
    ])
  })
})

describe('the heatmap readout', () => {
  it('reads a cell as "x, y: value", and positions the tooltip at its centre', () => {
    const model = heatmapModel(input())
    const readout = heatmapReadout(input(), model, at(1, 1))
    expect(readout.announcement).toBe('12–16, Tue: 21')
    expect(readout.rows).toEqual([
      expect.objectContaining({ label: 'Tue', value: '21', paint: model.plot?.cells[4]?.paint }),
    ])
    const cell = model.plot?.cells[4]
    expect(readout.tooltip).toMatchObject({
      header: '12–16',
      indicator: 'dot',
      x: (cell?.x ?? 0) + (cell?.width ?? 0) / 2,
      y: (cell?.y ?? 0) + (cell?.height ?? 0) / 2,
      side: 'end',
    })
    expect(heatmapReadout(input(), model, at(2, 0)).tooltip?.side).toBe('start')
  })

  it('reads an absent cell as no data, and nothing when nothing is read', () => {
    const data = GRID.map((row, index) => (index === 4 ? { ...row, tickets: null } : row))
    const model = heatmapModel(input({ data }))
    const absent = heatmapReadout(input({ data }), model, at(1, 1))
    expect(absent.announcement).toBe('12–16, Tue: No data')
    expect(absent.rows[0]?.paint).toBe('var(--pm-chart-other)')
    expect(heatmapReadout(input({ data }), model, at(null))).toEqual({
      rows: [],
      announcement: '',
      tooltip: null,
    })
  })

  it('keeps the announcement without the tooltip, and drops the header with hideLabel', () => {
    const model = heatmapModel(input())
    const off = heatmapReadout(input({ tooltip: false }), model, at(0))
    expect(off.tooltip).toBeNull()
    expect(off.announcement).toBe('08–12, Mon: 10')
    const bare = heatmapReadout(
      input({ tooltip: { hideLabel: true, indicator: 'line' } }),
      model,
      at(0),
    )
    expect(bare.tooltip?.header).toBeUndefined()
    expect(bare.tooltip?.indicator).toBe('line')
  })
})

describe('the heatmap selection', () => {
  it('reports the read cell, and nothing for an absent cell or no reading', () => {
    const data: ChartDatum[] = [
      { band: '08–12', day: 'Mon', tickets: 10 },
      { band: '12–16', day: 'Mon', tickets: null },
    ]
    const model = heatmapModel(input({ data }))
    expect(heatmapSelection(input({ data }), model, { index: 0, series: 0 })).toEqual({
      x: '08–12',
      y: 'Mon',
      value: 10,
    })
    expect(heatmapSelection(input({ data }), model, { index: 0, series: null })?.value).toBe(10)
    expect(heatmapSelection(input({ data }), model, { index: 1, series: 0 })).toBeNull()
    expect(heatmapSelection(input({ data }), model, { index: null, series: 0 })).toBeNull()
    expect(heatmapSelection(input({ data }), model, { index: 5, series: 0 })).toBeNull()
  })
})
