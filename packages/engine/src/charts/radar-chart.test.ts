import { describe, expect, it } from 'vitest'

import { DEFAULT_CHART_MESSAGES } from './messages'
import {
  radarChartModel,
  radarChartReadout,
  radarChartSelection,
  type RadarChartInput,
} from './radar-chart'
import { readingView } from './reading'
import type { ChartDatum } from './types'

/**
 * RadarChart's drawing without a framework: the rules every framework's member
 * renders from `radarChartModel`. The React and Vue members' tests cover the
 * same chart through the DOM; these hold the model's rules directly.
 */

const AXES = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'coverage', label: 'Coverage' },
]

const ROWS: ChartDatum[] = [
  { agent: 4.5, team: 3.8 },
  { agent: 3.2, team: 3.6 },
  { agent: 4.8, team: 4.1 },
  { agent: 2.9, team: 3.4 },
  { agent: 3.9, team: 3.7 },
]

const PAIR = [
  { key: 'agent', label: 'Agent' },
  { key: 'team', label: 'Team' },
]

const BOX = { width: 400, height: 300 }

const chart = (overrides: Partial<RadarChartInput> = {}): RadarChartInput => ({
  axes: AXES,
  data: ROWS,
  series: PAIR,
  label: 'Profile',
  box: BOX,
  ...overrides,
})

const at = (index: number | null, series: number | null = 0) =>
  readingView({ index, series }, AXES.length, PAIR.length)

describe('the radar model', () => {
  it('draws nothing before the plot is measured, and nothing with no rows', () => {
    expect(radarChartModel(chart({ box: null })).plot).toBeNull()
    expect(radarChartModel(chart({ box: null })).positions).toEqual([])
    const empty = radarChartModel(chart({ data: [] }))
    expect(empty.plot).toBeNull()
    expect(empty.state).toBe('empty')
    expect(radarChartModel(chart({ loading: true })).state).toBe('loading')
  })

  it('centres the drawing and fits the outer radius to the shorter side', () => {
    const plot = radarChartModel(chart()).plot
    expect(plot?.center).toEqual({ x: 200, y: 150 })
    expect(plot?.transform).toBe('translate(200 150)')
    expect(plot?.radius).toBe(150)
    expect(plot?.angles).toHaveLength(5)
  })

  it('draws the rings as closed polygons through the spokes, then one spoke per axis', () => {
    const grid = radarChartModel(chart()).plot?.grid ?? []
    const rings = grid.filter((line) => line.key.startsWith('ring-'))
    const spokes = grid.filter((line) => line.key.startsWith('spoke-'))
    expect(rings.length).toBeGreaterThanOrEqual(3)
    for (const ring of rings) {
      expect(ring.d.endsWith('Z')).toBe(true)
      expect(ring.d).not.toContain('A')
    }
    expect(spokes).toHaveLength(5)
    expect(grid.indexOf(spokes[0]!)).toBe(rings.length)
  })

  it('runs one shared zero-based scale to the nice’d maximum, and says it in the summary', () => {
    const model = radarChartModel(chart())
    expect(model.plot?.top).toBe(5)
    expect(model.summary).toBe(
      'Profile, 5 axes by 2 series, one shared scale from zero to 5. The same data is available as a table.',
    )
    expect(radarChartModel(chart({ box: null })).summary).toContain('from zero to .')
    expect(radarChartModel(chart({ selectable: true })).summary).toContain(
      DEFAULT_CHART_MESSAGES.activationHint,
    )
  })

  it('draws a vertex per measured value and breaks the polygon at a gap', () => {
    const gapped = ROWS.map((row, index) => (index === 2 ? { agent: null, team: 3 } : row))
    const model = radarChartModel(chart({ data: gapped }))
    const [agent, team] = model.plot?.profiles ?? []
    expect(agent?.vertices.map((vertex) => vertex.index)).toEqual([0, 1, 3, 4])
    expect(team?.vertices).toHaveLength(5)
    expect(agent?.points[2]).toBeNull()
    expect((agent?.d.match(/M/g) ?? []).length).toBeGreaterThan(1)
    expect(team?.d.endsWith('Z')).toBe(true)
    // Series-major positions for the pointer, with the gap left unplaced.
    expect(model.positions).toHaveLength(10)
    expect(model.positions[2]).toBeNull()
    expect(model.positions[0]).toEqual({ x: 200, y: 150 - (4.5 / 5) * 150 })
  })

  it('refits the shared scale to the visible series, and keeps the full maximum with none', () => {
    const data = AXES.map((_, index) => ({ big: index === 0 ? 40 : 10, small: 2 }))
    const series = [
      { key: 'big', label: 'Big' },
      { key: 'small', label: 'Small' },
    ]
    expect(radarChartModel(chart({ data, series })).plot?.top).toBe(40)
    const isolated = radarChartModel(chart({ data, series, hidden: new Set(['big']) }))
    expect(isolated.plot?.top).toBe(2)
    expect(isolated.visible.map((entry) => entry.key)).toEqual(['small'])
    expect(isolated.painted).toHaveLength(2)
    const none = radarChartModel(chart({ data, series, hidden: new Set(['big', 'small']) }))
    expect(none.plot?.top).toBe(40)
    expect(none.plot?.profiles).toEqual([])
  })

  it('anchors each axis label away from the centre', () => {
    const labels = radarChartModel(chart({ axes: AXES.slice(0, 4), data: ROWS.slice(0, 4) })).plot
      ?.labels
    expect(labels?.map((name) => name.anchor)).toEqual(['middle', 'start', 'middle', 'end'])
    expect(labels?.[0]?.text).toBe('First response')
  })

  it('warns below three axes, above six, on a row count mismatch and above the cap', () => {
    const two = radarChartModel(chart({ axes: AXES.slice(0, 2), data: ROWS.slice(0, 2) }))
    expect(two.warnings).toEqual([expect.stringContaining('dumbbell')])
    const seven = [...AXES, { key: 'a', label: 'A' }, { key: 'b', label: 'B' }]
    const many = radarChartModel(chart({ axes: seven, data: seven.map(() => ({ agent: 1 })) }))
    expect(many.warnings).toEqual([expect.stringContaining('past 6')])
    const short = radarChartModel(chart({ data: ROWS.slice(0, 4) }))
    expect(short.warnings).toEqual([expect.stringContaining('4 rows against 5 axes')])
    expect(radarChartModel(chart({ data: [] })).warnings).toEqual([])

    const four = ['a', 'b', 'c', 'd'].map((key) => ({ key, label: key.toUpperCase() }))
    expect(radarChartModel(chart({ series: four, cap: null })).warnings).toEqual([])
    expect(radarChartModel(chart({ series: four, cap: 4 })).warnings).toEqual([])
    expect(radarChartModel(chart({ series: four, cap: 3 })).warnings).toEqual([
      expect.stringContaining('--pm-chart-cap'),
    ])
  })

  it('builds the twin as an axes × series grid, with a gap as an empty cell', () => {
    const gapped = ROWS.map((row, index) => (index === 2 ? { agent: null, team: 3 } : row))
    const model = radarChartModel(chart({ data: gapped, format: { style: 'percent' } }))
    expect(model.twin.columns).toEqual([
      { key: '__axis', label: '' },
      { key: 'agent', label: 'Agent', numeric: true },
      { key: 'team', label: 'Team', numeric: true },
    ])
    expect(model.twin.rows).toHaveLength(5)
    expect(model.twin.rows[2]?.[0]).toBe('CSAT')
    expect(model.twin.rows[2]?.[1]).toBe('')
    expect(model.legend).toBe(true)
    expect(radarChartModel(chart({ series: [PAIR[0]!] })).legend).toBe(false)
  })
})

describe('the radar readout and selection', () => {
  it('says "axis: series, value" at a vertex, and nothing at rest', () => {
    const input = chart()
    const model = radarChartModel(input)
    expect(radarChartReadout(input, model, at(null)).announcement).toBe('')
    expect(radarChartReadout(input, model, at(0)).announcement).toBe('First response: Agent, 4.5')
    expect(radarChartReadout(input, model, at(4, 1)).announcement).toBe('Coverage: Team, 3.7')
  })

  it('says the catalog’s no-data text at a gap and shows no tooltip there', () => {
    const input = chart({ data: ROWS.map((row, index) => (index === 2 ? { team: 3 } : row)) })
    const readout = radarChartReadout(input, radarChartModel(input), at(2))
    expect(readout.announcement).toBe('CSAT: Agent, No data')
    expect(readout.tooltip).toBeNull()
  })

  it('places the tooltip just outside the vertex, inside the block margins, and flips its side', () => {
    const input = chart()
    const model = radarChartModel(input)
    const top = radarChartReadout(input, model, at(0)).tooltip
    expect(top?.header).toBe('First response')
    expect(top?.rows).toHaveLength(1)
    expect(top?.indicator).toBe('dot')
    expect(top?.x).toBeCloseTo(200)
    expect(top?.y).toBe(24)
    expect(top?.side).toBe('end')
    const left = radarChartReadout(input, model, at(4)).tooltip
    expect(left?.side).toBe('end')
    const right = radarChartReadout(input, model, at(1)).tooltip
    expect(right?.side).toBe('start')
  })

  it('removes only the visual layer with tooltip off, and the header with hideLabel', () => {
    const off = chart({ tooltip: false })
    const readout = radarChartReadout(off, radarChartModel(off), at(0))
    expect(readout.tooltip).toBeNull()
    expect(readout.announcement).not.toBe('')
    const bare = chart({ tooltip: { hideLabel: true, indicator: 'line' } })
    const tooltip = radarChartReadout(bare, radarChartModel(bare), at(0)).tooltip
    expect(tooltip?.header).toBeUndefined()
    expect(tooltip?.indicator).toBe('line')
  })

  it('reports the axis key, the series key and the value, and nothing at a gap or at rest', () => {
    const input = chart({ data: ROWS.map((row, index) => (index === 2 ? { team: 3 } : row)) })
    const model = radarChartModel(input)
    expect(radarChartSelection(input, model, { index: 1, series: 0 })).toEqual({
      axis: 'resolution',
      key: 'agent',
      value: 3.2,
    })
    expect(radarChartSelection(input, model, { index: 1, series: 1 })?.key).toBe('team')
    expect(radarChartSelection(input, model, { index: 2, series: 0 })).toBeNull()
    expect(radarChartSelection(input, model, { index: null, series: 0 })).toBeNull()
  })
})
