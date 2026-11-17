import { cleanup, render } from '@testing-library/react'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  CHART_MARK_CAP,
  type ChartDatum,
  type ChartXAxis,
  type ComponentStates,
} from '@polymorph/react'
import {
  createAgentBridge,
  type AgentBridge,
  type AgentSnapshotMember,
} from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { BarChart } from './BarChart'
import { Heatmap } from './Heatmap'
import { ScatterChart } from './ScatterChart'
import { states as areaChart } from './area-chart.states'
import { states as barChart } from './bar-chart.states'
import { states as donutChart } from './donut-chart.states'
import { states as funnelChart } from './funnel-chart.states'
import { states as heatmap } from './heatmap.states'
import { states as histogram } from './histogram.states'
import { states as lineChart } from './line-chart.states'
import { states as radarChart } from './radar-chart.states'
import { states as scatterChart } from './scatter-chart.states'
import { states as treemap } from './treemap.states'

/**
 * What an agent picks in a chart (the `## Agent` section of each chart's
 * spec), held to what a person picks. Each chart that takes `onSelect` lists
 * the marks the keys reach, each labelled with what the live region says
 * there, and an agent's `choose` gives `onSelect` what a person's Enter gives
 * at the same mark. A chart with more marks than the cap lists a window of
 * them around the reading position, and an agent's `read` moves the reading
 * as a person's Left and Right do. A chart whose legend toggles lists its
 * series, and an agent's `toggle` presses a key as a person's press does. A
 * chart with neither `onSelect` nor such a legend registers nothing.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const FIXTURES: readonly ComponentStates[] = [
  areaChart,
  barChart,
  donutChart,
  funnelChart,
  heatmap,
  histogram,
  lineChart,
  radarChart,
  scatterChart,
  treemap,
]

/**
 * The charts whose legend toggles, each with the first fixture entry that draws
 * the legend and gives no `onSelect`, which its spec's legend statements name.
 */
const LEGENDS: Readonly<Record<string, string>> = {
  AreaChart: 'backlog composition',
  BarChart: 'grouped',
  LineChart: 'the Relay pair',
  RadarChart: 'skills matrix',
  ScatterChart: 'two teams',
}

/** The charts with a brush, each with its fixture entry `brushable`, which gives `onBrushEnd`. */
const BRUSHES: readonly string[] = ['AreaChart', 'LineChart']

/** The series coordinate at rest of a chart whose Up and Down walk from it, as its reading starts. */
const SERIES_START: Readonly<Record<string, number | null>> = {
  BarChart: null,
  Heatmap: 0,
  RadarChart: 0,
  ScatterChart: 0,
}

type Item = { id: string; label: string }

/**
 * The entry's chart, as its fixture renders it, with `onSelect` replaced. Each
 * chart's fixture has one entry with `onSelect`, named `selectable`.
 */
function entry(fixture: ComponentStates, name: string, onSelect?: (selection: unknown) => void) {
  const found = fixture.entries.find((candidate) => candidate.name === name)
  const element = found?.render()
  if (!isValidElement(element)) throw new Error(`${fixture.component} has no entry "${name}"`)
  return cloneElement(element as ReactElement<{ onSelect?: unknown }>, { onSelect })
}

/** The chart's handle, once the chart has measured its plot and lists its marks. */
async function listed(bridge: AgentBridge, member: string): Promise<AgentSnapshotMember> {
  let found: AgentSnapshotMember | undefined
  await vi.waitFor(() => {
    found = bridge.snapshot().members.find((candidate) => candidate.member === member)
    expect((found?.state['items'] as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0)
  })
  return found as AgentSnapshotMember
}

/** The chart's handle, once the chart has drawn its legend and lists its series. */
async function withLegend(bridge: AgentBridge, member: string): Promise<AgentSnapshotMember> {
  let found: AgentSnapshotMember | undefined
  await vi.waitFor(() => {
    found = bridge.snapshot().members.find((candidate) => candidate.member === member)
    expect((found?.state['series'] as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(1)
  })
  return found as AgentSnapshotMember
}

/** The chart's state, as a snapshot reads it now. */
function stateOf(bridge: AgentBridge, member: string): Record<string, unknown> {
  return bridge.snapshot().members.find((candidate) => candidate.member === member)?.state ?? {}
}

/** The positions a list of marks covers, in order, each once. */
const positions = (items: readonly Item[]) => [
  ...new Set(items.map((item) => Number(item.id.split(':')[0]))),
]

/**
 * The keys that take a person's reading from rest to the mark an id names:
 * from the nearer end of the chart, then Down to the series.
 */
function keysTo(member: string, id: string, count: number): string {
  const [index = 0, series] = id.split(':').map(Number)
  const along =
    index <= count - 1 - index
      ? `{Home}${'{ArrowRight}'.repeat(index)}`
      : `{End}${'{ArrowLeft}'.repeat(count - 1 - index)}`
  if (series === undefined) return along
  const start = SERIES_START[member] ?? null
  // From rest, the first Down lands on the first series, as the first Right lands on the first position.
  const downs = start === null ? series + 1 : series - start
  return along + '{ArrowDown}'.repeat(downs)
}

/** The plot's one focus stop, the figure and the live region of a rendered chart. */
function parts(container: HTMLElement) {
  return {
    surface: container.querySelector<HTMLElement>('[role="img"][tabindex="0"]') as HTMLElement,
    figure: container.querySelector('figure') as HTMLElement,
    live: container.querySelector('[aria-live]') as HTMLElement,
  }
}

describe.each(FIXTURES.map((fixture) => [fixture.component, fixture] as const))(
  'an agent and %s',
  (member, fixture) => {
    it('registers without onSelect only when its legend toggles, and lists no mark then', () => {
      const bridge = createAgentBridge()
      try {
        const shown = render(entry(fixture, 'selectable'))
        const toggles = shown.container.querySelector('figure > ul button') !== null
        const registered = bridge.snapshot().members.filter((found) => found.member === member)
        expect(registered.length).toBe(toggles ? 1 : 0)
        for (const chart of registered) expect(chart.state['items']).toEqual([])
      } finally {
        bridge.dispose()
      }
    })

    it('lists each mark a person can pick, named as the live region says it, and picks one as Enter does', async () => {
      const bridge = createAgentBridge()
      try {
        const person = vi.fn()
        const shown = render(entry(fixture, 'selectable', person))
        const chart = await listed(bridge, member)
        expect(chart.name).toBe(shown.container.querySelector('figure')?.getAttribute('aria-label'))
        expect(chart.actions).toEqual(
          member in LEGENDS
            ? [
                { name: 'read', argument: 'number' },
                { name: 'choose', argument: 'id', among: 'items' },
                { name: 'toggle', argument: 'id', among: 'series' },
                ...(BRUSHES.includes(member) ? [{ name: 'brush', argument: 'number' }] : []),
              ]
            : [
                { name: 'read', argument: 'number' },
                { name: 'choose', argument: 'id' },
              ],
        )
        const items = chart.state['items'] as Item[]
        const count = chart.state['count'] as number
        const last = items.at(-1) as Item

        // A person walks to the last mark with the keys, hears it, and presses Enter.
        const { surface, live } = parts(shown.container)
        surface.focus()
        await userEvent.keyboard(keysTo(member, last.id, count))
        await vi.waitFor(() => expect(live.textContent).toBe(last.label))
        await userEvent.keyboard('{Enter}')
        expect(person).toHaveBeenCalledTimes(1)
        shown.unmount()

        // An agent picks the same mark on a fresh chart, and onSelect receives the same.
        const agent = vi.fn()
        render(entry(fixture, 'selectable', agent))
        const fresh = await listed(bridge, member)
        const { results } = await bridge.act([{ id: fresh.id, action: 'choose', value: last.id }])
        expect(results).toMatchObject([{ ok: true }])
        expect(agent).toHaveBeenCalledExactlyOnceWith(person.mock.calls[0]?.[0])
      } finally {
        bridge.dispose()
      }
    })

    it('reads the position a person’s keys leave, and reads along the chart as Left and Right do', async () => {
      const bridge = createAgentBridge()
      try {
        const onSelect = vi.fn()
        const shown = render(entry(fixture, 'selectable', onSelect))
        const chart = await listed(bridge, member)
        const count = chart.state['count'] as number
        expect(chart.state['position']).toBeNull()
        expect(Number.isInteger(count) && count >= 2).toBe(true)
        expect(Math.max(...positions(chart.state['items'] as Item[]))).toBeLessThan(count)
        const { surface, figure, live } = parts(shown.container)
        expect(figure.hasAttribute('data-position')).toBe(false)

        // A person's keys move the position the snapshot reports, and the figure shows it.
        surface.focus()
        await userEvent.keyboard('{Home}{ArrowRight}')
        await vi.waitFor(() => expect(stateOf(bridge, member)['position']).toBe(1))
        expect(figure.getAttribute('data-position')).toBe('1')

        // An agent reads the last position: the live region says it, and onSelect is not called.
        const { results } = await bridge.act([{ id: chart.id, action: 'read', value: count - 1 }])
        expect(results).toMatchObject([
          { ok: true, changed: { position: { from: 1, to: count - 1 } } },
        ])
        await vi.waitFor(() => expect(figure.getAttribute('data-position')).toBe(String(count - 1)))
        const said = live.textContent
        expect(said).not.toBe('')
        expect(onSelect).not.toHaveBeenCalled()

        // A person's End from the same place reaches the same reading, and hears the same.
        await userEvent.keyboard('{Home}{End}')
        await vi.waitFor(() => expect(live.textContent).toBe(said))
        expect(stateOf(bridge, member)['position']).toBe(count - 1)

        // Escape clears the reading, and the position with it.
        await userEvent.keyboard('{Escape}')
        await vi.waitFor(() => expect(stateOf(bridge, member)['position']).toBeNull())
        expect(figure.hasAttribute('data-position')).toBe(false)
      } finally {
        bridge.dispose()
      }
    })

    it('refuses to read a number that is not a position, and moves nothing', async () => {
      const bridge = createAgentBridge()
      try {
        render(entry(fixture, 'selectable', vi.fn()))
        const chart = await listed(bridge, member)
        const count = chart.state['count'] as number
        for (const value of [count, -1, 0.5]) {
          const { results } = await bridge.act([{ id: chart.id, action: 'read', value }])
          expect(results).toMatchObject([{ ok: false, error: { code: 'failed' } }])
        }
        const { results } = await bridge.act([{ id: chart.id, action: 'read', value: count }])
        expect(results).toMatchObject([
          {
            error: {
              message: `read failed: The chart's positions are 0 to ${count - 1}, and ${count} is not one of them.`,
            },
          },
        ])
        expect(stateOf(bridge, member)['position']).toBeNull()
      } finally {
        bridge.dispose()
      }
    })
  },
)

describe('an agent and a BarChart of several series', () => {
  it('lists each bar of a band, and picks the series a person walks to', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      render(entry(barChart, 'grouped', onSelect))
      const chart = await listed(bridge, 'BarChart')
      const items = chart.state['items'] as Item[]
      expect(items.slice(0, 2)).toEqual([
        { id: '0:0', label: 'Opened: 32 — Mon' },
        { id: '0:1', label: 'Resolved: 28 — Mon' },
      ])
      const { results } = await bridge.act([{ id: chart.id, action: 'choose', value: '0:1' }])
      expect(results).toMatchObject([{ ok: true }])
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ index: 0, key: 'resolved' }),
      )
    } finally {
      bridge.dispose()
    }
  })

  it('refuses an id that names no bar, and calls nothing', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      render(entry(barChart, 'grouped', onSelect))
      const chart = await listed(bridge, 'BarChart')
      const { results } = await bridge.act([{ id: chart.id, action: 'choose', value: 'Mon' }])
      expect(results).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])
      expect(onSelect).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('reads the position a person’s pointer is on', async () => {
    const bridge = createAgentBridge()
    try {
      const shown = render(entry(barChart, 'grouped', vi.fn()))
      await listed(bridge, 'BarChart')
      const { surface, figure } = parts(shown.container)
      await userEvent.hover(surface)
      await vi.waitFor(() => expect(stateOf(bridge, 'BarChart')['position']).toBeTypeOf('number'))
      expect(figure.getAttribute('data-position')).toBe(
        String(stateOf(bridge, 'BarChart')['position']),
      )
      await userEvent.unhover(surface)
      await vi.waitFor(() => expect(stateOf(bridge, 'BarChart')['position']).toBeNull())
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * What a chart draws once it stops changing. A chart measures its plot again
 * when its axes or its legend change size, so a drawing read in the frame that
 * changed them can be one measurement behind.
 */
async function settled(read: () => string | undefined): Promise<string | undefined> {
  let last = read()
  await vi.waitFor(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
    const now = read()
    const still = now === last
    last = now
    expect(still).toBe(true)
  })
  return last
}

/** The legend's keys of a rendered chart, as a person reads and presses them. */
const keysOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('figure > ul button'))

describe.each(Object.entries(LEGENDS))('an agent and the legend of a %s', (member, legend) => {
  const fixture = FIXTURES.find((candidate) => candidate.component === member) as ComponentStates

  it('is listed without onSelect, with the series of its keys, no marks and choose refused', async () => {
    const bridge = createAgentBridge()
    try {
      const shown = render(entry(fixture, legend))
      const chart = await withLegend(bridge, member)
      const keys = keysOf(shown.container)
      expect(chart.state['series']).toEqual(
        keys.map((key) => ({ id: expect.any(String), label: key.textContent?.trim() })),
      )
      expect(chart.state['hidden']).toEqual([])
      expect(chart.state['items']).toEqual([])
      expect(chart.state['count']).toBeGreaterThan(0)
      const { results } = await bridge.act([{ id: chart.id, action: 'choose', value: '0' }])
      expect(results).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])
      // The reading still moves for an agent, as Left and Right move it for a person.
      const read = await bridge.act([{ id: chart.id, action: 'read', value: 0 }])
      expect(read.results).toMatchObject([
        { ok: true, changed: { position: { from: null, to: 0 } } },
      ])
    } finally {
      bridge.dispose()
    }
  })

  it('hides a series with its key as a person’s press does, and shows it again', async () => {
    const bridge = createAgentBridge()
    try {
      const shown = render(entry(fixture, legend))
      const chart = await withLegend(bridge, member)
      const second = (chart.state['series'] as Item[])[1] as Item
      const key = keysOf(shown.container)[1] as HTMLButtonElement
      const plot = () => shown.container.querySelector('figure svg')?.outerHTML
      const shownAll = await settled(plot)

      // An agent hides the second series: its key reads hidden, and the plot redraws without it.
      const hid = await bridge.act([{ id: chart.id, action: 'toggle', value: second.id }])
      expect(hid.results).toMatchObject([
        { ok: true, changed: { hidden: { from: [], to: [second.id] } } },
      ])
      await vi.waitFor(() => expect(key.getAttribute('aria-pressed')).toBe('false'))
      const agentDrew = await settled(plot)
      expect(agentDrew).not.toBe(shownAll)

      // Toggled again, the series shows, and the plot is drawn as it was.
      const showed = await bridge.act([{ id: chart.id, action: 'toggle', value: second.id }])
      expect(showed.results).toMatchObject([
        { ok: true, changed: { hidden: { from: [second.id], to: [] } } },
      ])
      await vi.waitFor(() => expect(key.getAttribute('aria-pressed')).toBe('true'))
      expect(await settled(plot)).toBe(shownAll)

      // A person's press on the same key draws what the agent's toggle drew.
      await userEvent.click(key)
      await vi.waitFor(() => expect(key.getAttribute('aria-pressed')).toBe('false'))
      expect(stateOf(bridge, member)['hidden']).toEqual([second.id])
      expect(await settled(plot)).toBe(agentDrew)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses an id that names no series, and a mark’s id, and presses nothing', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      const shown = render(entry(fixture, legend, onSelect))
      const chart = await withLegend(bridge, member)
      await listed(bridge, member)
      const mark = (stateOf(bridge, member)['items'] as Item[])[0] as Item
      const clicks = vi.fn()
      shown.container.addEventListener('click', clicks)
      for (const value of ['no-such-series', mark.id]) {
        const { results } = await bridge.act([{ id: chart.id, action: 'toggle', value }])
        expect(results, value).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])
      }
      expect(clicks).not.toHaveBeenCalled()
      expect(stateOf(bridge, member)['hidden']).toEqual([])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a series’ id to choose, and calls nothing', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      render(entry(fixture, legend, onSelect))
      await withLegend(bridge, member)
      const chart = await listed(bridge, member)
      const series = (chart.state['series'] as Item[])[0] as Item
      const { results } = await bridge.act([{ id: chart.id, action: 'choose', value: series.id }])
      expect(results).toMatchObject([
        {
          ok: false,
          error: {
            code: 'invalid-value',
            message: 'choose takes the id of one of the enabled choices of "items".',
          },
        },
      ])
      expect(onSelect).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})

/** The chart's handle, once it is listed: a chart with a brush lists no mark without `onSelect`. */
async function registered(bridge: AgentBridge, member: string): Promise<AgentSnapshotMember> {
  let found: AgentSnapshotMember | undefined
  await vi.waitFor(() => {
    found = bridge.snapshot().members.find((candidate) => candidate.member === member)
    expect(found?.state['count']).toBeGreaterThan(0)
  })
  return found as AgentSnapshotMember
}

/** The entry `brushable`, as its fixture renders it, with `onBrushEnd` replaced. */
function brushable(fixture: ComponentStates, onBrushEnd: (range: unknown) => void) {
  const element = fixture.entries.find((candidate) => candidate.name === 'brushable')?.render()
  if (!isValidElement(element)) throw new Error(`${fixture.component} has no entry "brushable"`)
  return cloneElement(element as ReactElement<{ onBrushEnd?: unknown }>, { onBrushEnd })
}

describe.each(BRUSHES)('an agent and the brush of a %s', (member) => {
  const fixture = FIXTURES.find((candidate) => candidate.component === member) as ComponentStates

  it('reads no range at rest, and brushes from the reading position as a person’s keys do', async () => {
    const bridge = createAgentBridge()
    try {
      // A person reads the fourth row, brushes four rows right with Shift, and commits with Enter.
      const person = vi.fn()
      const shown = render(brushable(fixture, person))
      const before = await registered(bridge, member)
      expect(before.state['range-start']).toBeNull()
      expect(before.state['range-end']).toBeNull()
      const { surface } = parts(shown.container)
      surface.focus()
      await userEvent.keyboard(
        '{Home}{ArrowRight}{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}{Enter}',
      )
      expect(person).toHaveBeenCalledTimes(1)
      await vi.waitFor(() =>
        expect([
          stateOf(bridge, member)['range-start'],
          stateOf(bridge, member)['range-end'],
        ]).toEqual([3, 7]),
      )
      shown.unmount()

      // An agent reads the same row and brushes to the same end: onBrushEnd receives the same.
      const agent = vi.fn()
      render(brushable(fixture, agent))
      const chart = await registered(bridge, member)
      const { results } = await bridge.act([
        { id: chart.id, action: 'read', value: 3 },
        { id: chart.id, action: 'brush', value: 7 },
      ])
      expect(results).toMatchObject([
        { ok: true },
        {
          ok: true,
          changed: { 'range-start': { from: null, to: 3 }, 'range-end': { from: null, to: 7 } },
        },
      ])
      expect(agent).toHaveBeenCalledExactlyOnceWith(person.mock.calls[0]?.[0])
    } finally {
      bridge.dispose()
    }
  })

  it('starts at an end with nothing read, as a person’s first Shift and arrow does', async () => {
    const bridge = createAgentBridge()
    try {
      const person = vi.fn()
      const shown = render(brushable(fixture, person))
      await registered(bridge, member)
      parts(shown.container).surface.focus()
      await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}{Enter}')
      expect(person).toHaveBeenCalledTimes(1)
      shown.unmount()

      const agent = vi.fn()
      render(brushable(fixture, agent))
      const chart = await registered(bridge, member)
      const { results } = await bridge.act([{ id: chart.id, action: 'brush', value: 2 }])
      expect(results).toMatchObject([{ ok: true }])
      expect(agent).toHaveBeenCalledExactlyOnceWith(person.mock.calls[0]?.[0])
      expect(stateOf(bridge, member)['range-start']).toBe(0)
      expect(stateOf(bridge, member)['range-end']).toBe(2)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a number that is not a row and a range of one row, and commits nothing', async () => {
    const bridge = createAgentBridge()
    try {
      const onBrushEnd = vi.fn()
      render(brushable(fixture, onBrushEnd))
      const chart = await registered(bridge, member)
      const count = chart.state['count'] as number
      for (const value of [count, -1, 1.5]) {
        const { results } = await bridge.act([{ id: chart.id, action: 'brush', value }])
        expect(results, String(value)).toMatchObject([{ ok: false, error: { code: 'failed' } }])
      }
      const { results } = await bridge.act([
        { id: chart.id, action: 'read', value: 4 },
        { id: chart.id, action: 'brush', value: 4 },
      ])
      expect(results).toMatchObject([
        { ok: true },
        {
          ok: false,
          error: {
            message:
              'brush failed: A range runs between two rows, and this one would start and end on row 4.',
          },
        },
      ])
      expect(onBrushEnd).not.toHaveBeenCalled()
      expect(stateOf(bridge, member)['range-end']).toBeNull()
    } finally {
      bridge.dispose()
    }
  })

  it('has no brush without onBrushEnd: no range, and brush refused, saying why', async () => {
    const bridge = createAgentBridge()
    try {
      const shown = render(entry(fixture, LEGENDS[member] as string))
      const chart = await withLegend(bridge, member)
      expect(chart.state['range-start']).toBeNull()
      expect(chart.state['range-end']).toBeNull()
      const { results } = await bridge.act([{ id: chart.id, action: 'brush', value: 2 }])
      expect(results).toMatchObject([
        {
          ok: false,
          error: {
            code: 'failed',
            message: 'brush failed: The chart has no brush, because it takes no onBrushEnd.',
          },
        },
      ])
      expect(shown.container.querySelector('figure svg g[class*="brush"]')).toBeNull()
    } finally {
      bridge.dispose()
    }
  })

  it('has no brush on a band x, even with onBrushEnd', async () => {
    const bridge = createAgentBridge()
    try {
      const onBrushEnd = vi.fn()
      // The legend's entry, its x read as a band: named rows, with no continuum to brush across.
      const shown = entry(fixture, LEGENDS[member] as string) as ReactElement<{
        x: ChartXAxis
        onBrushEnd?: unknown
      }>
      render(cloneElement(shown, { x: { ...shown.props.x, scale: 'band' }, onBrushEnd }))
      const chart = await withLegend(bridge, member)
      const { results } = await bridge.act([{ id: chart.id, action: 'brush', value: 2 }])
      expect(results).toMatchObject([
        {
          ok: false,
          error: {
            message:
              'brush failed: The chart has no brush, because its x is not one this chart brushes.',
          },
        },
      ])
      expect(onBrushEnd).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})

describe('an agent and a chart with one series', () => {
  it('lists no series and no hidden one, because it draws no legend', async () => {
    const bridge = createAgentBridge()
    try {
      render(entry(barChart, 'selectable', vi.fn()))
      const chart = await listed(bridge, 'BarChart')
      expect(chart.state['series']).toEqual([])
      expect(chart.state['hidden']).toEqual([])
      const { results } = await bridge.act([{ id: chart.id, action: 'toggle', value: 'tickets' }])
      expect(results).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])
    } finally {
      bridge.dispose()
    }
  })

  it('registers nothing with neither onSelect nor a legend', () => {
    const bridge = createAgentBridge()
    try {
      render(entry(barChart, 'single series'))
      expect(bridge.snapshot().members.filter((found) => found.member === 'BarChart')).toEqual([])
    } finally {
      bridge.dispose()
    }
  })

  it('registers with a brush alone, and lists no mark and no series', async () => {
    const bridge = createAgentBridge()
    try {
      render(brushable(lineChart, vi.fn()))
      const chart = await registered(bridge, 'LineChart')
      expect(chart.state['items']).toEqual([])
      expect(chart.state['series']).toEqual([])
    } finally {
      bridge.dispose()
    }
  })
})

describe('an agent and a ScatterChart with a point it does not draw', () => {
  /** Escalations has no value at the second row, so the plot draws no point there. */
  const GAPPED: ChartDatum[] = [
    { minutes: 2, triage: 4.8, escalations: 4.2 },
    { minutes: 6, triage: 4.4, escalations: null },
    { minutes: 9, triage: 4, escalations: 3.6 },
  ]
  const chart = (onSelect: (selection: unknown) => void) => (
    <ScatterChart
      data={GAPPED}
      series={[
        { key: 'triage', label: 'Triage' },
        { key: 'escalations', label: 'Escalations' },
      ]}
      x={{ key: 'minutes', label: 'Handle minutes' }}
      label="Handle time against satisfaction, by team"
      onSelect={onSelect}
    />
  )

  it('is reached by the keys and named as having no data, and neither a press nor an agent picks it', async () => {
    const bridge = createAgentBridge()
    try {
      const onSelect = vi.fn()
      const shown = render(chart(onSelect))
      const found = await listed(bridge, 'ScatterChart')
      expect((found.state['items'] as Item[]).map((item) => item.id)).toEqual([
        '0:0',
        '0:1',
        '1:0',
        '2:0',
        '2:1',
      ])

      // A person walks to the point: the live region says it has no data, and Enter reports nothing.
      const { surface, live } = parts(shown.container)
      surface.focus()
      await userEvent.keyboard(keysTo('ScatterChart', '1:1', GAPPED.length))
      await vi.waitFor(() => expect(live.textContent).toBe('6, No data: Escalations'))
      await userEvent.keyboard('{Enter}')
      expect(onSelect).not.toHaveBeenCalled()

      // An agent's choose of it is refused, and calls nothing.
      const { results } = await bridge.act([{ id: found.id, action: 'choose', value: '1:1' }])
      expect(results).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])
      expect(onSelect).not.toHaveBeenCalled()

      // The drawn point of the other series at the same row is reported.
      await userEvent.keyboard('{ArrowUp}{Enter}')
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({
        index: 1,
        key: 'triage',
        datum: GAPPED[1],
      })
    } finally {
      bridge.dispose()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Charts with more marks than the cap                                         */
/* -------------------------------------------------------------------------- */

/** Five hundred observations in two series, each with a value: a thousand points. */
const OBSERVATIONS: ChartDatum[] = Array.from({ length: 500 }, (_, index) => {
  const minutes = 1 + ((index * 17) % 130) / 10
  return {
    minutes: Math.round(minutes * 10) / 10,
    triage: Math.round((5.2 - minutes * 0.12 + (((index * 31) % 23) - 11) / 14) * 100) / 100,
    escalations: Math.round((4.8 - minutes * 0.1 + (((index * 13) % 17) - 8) / 12) * 100) / 100,
  }
})

/** A week of hours: 24 columns of seven cells. */
const HOURS: ChartDatum[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].flatMap((day, row) =>
  Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, day, tickets: hour + row })),
)

/** A hundred weeks of two series: two hundred bars. */
const WEEKS: ChartDatum[] = Array.from({ length: 100 }, (_, index) => ({
  week: `W${index + 1}`,
  opened: 180 + ((index * 7) % 40),
  resolved: 170 + ((index * 5) % 50),
}))

interface Large {
  member: string
  /** The chart, with the given `onSelect`. */
  render: (onSelect: (selection: unknown) => void) => ReactNode
  /** How many marks a position holds. */
  per: number
  /** The position an agent reads to, and the mark it then picks there, near the end. */
  read: number
  pick: string
}

const LARGE: readonly Large[] = [
  {
    member: 'ScatterChart',
    render: (onSelect) => (
      <ScatterChart
        data={OBSERVATIONS}
        series={[
          { key: 'triage', label: 'Triage' },
          { key: 'escalations', label: 'Escalations' },
        ]}
        x={{ key: 'minutes', label: 'Handle minutes' }}
        label="Handle time against satisfaction, by team"
        onSelect={onSelect}
      />
    ),
    per: 2,
    read: 497,
    pick: '498:1',
  },
  {
    member: 'Heatmap',
    render: (onSelect) => (
      <Heatmap
        data={HOURS}
        x={{ key: 'hour', label: 'Hour' }}
        y={{ key: 'day', label: 'Day' }}
        value={{ key: 'tickets' }}
        label="Tickets by weekday and hour"
        onSelect={onSelect}
      />
    ),
    per: 7,
    read: 22,
    pick: '23:6',
  },
  {
    member: 'BarChart',
    render: (onSelect) => (
      <BarChart
        data={WEEKS}
        series={[
          { key: 'opened', label: 'Opened' },
          { key: 'resolved', label: 'Resolved' },
        ]}
        x={{ key: 'week', label: 'Week' }}
        label="Opened and resolved by week"
        onSelect={onSelect}
      />
    ),
    per: 2,
    read: 96,
    pick: '99:0',
  },
]

describe.each(LARGE.map((large) => [large.member, large] as const))(
  'an agent and a %s with more marks than the cap',
  (member, large) => {
    it('lists whole positions under the cap, reads near the end, and picks a mark there as Enter does', async () => {
      const bridge = createAgentBridge()
      try {
        // A person walks to the mark with the keys and presses Enter.
        const person = vi.fn()
        const shown = render(large.render(person))
        const before = await listed(bridge, member)
        const count = before.state['count'] as number
        const { surface, live } = parts(shown.container)
        surface.focus()
        await userEvent.keyboard(keysTo(member, large.pick, count))
        await userEvent.keyboard('{Enter}')
        expect(person).toHaveBeenCalledTimes(1)
        const heard = live.textContent
        shown.unmount()

        // On a fresh chart, the window starts at the first position, and the mark is not in it.
        const agent = vi.fn()
        const fresh = render(large.render(agent))
        const chart = await listed(bridge, member)
        const first = chart.state['items'] as Item[]
        expect(first).toHaveLength(large.per * Math.floor(CHART_MARK_CAP / large.per))
        expect(positions(first)[0]).toBe(0)
        expect(first.map((item) => item.id)).not.toContain(large.pick)
        const refused = await bridge.act([{ id: chart.id, action: 'choose', value: large.pick }])
        expect(refused.results).toMatchObject([{ ok: false, error: { code: 'invalid-value' } }])

        // An agent reads near the end: the window follows, in whole positions, under the cap.
        const read = await bridge.act([{ id: chart.id, action: 'read', value: large.read }])
        expect(read.results).toMatchObject([{ ok: true }])
        expect(agent).not.toHaveBeenCalled()
        const moved = stateOf(bridge, member)
        expect(moved['position']).toBe(large.read)
        const items = moved['items'] as Item[]
        expect(items.length).toBeLessThanOrEqual(CHART_MARK_CAP)
        expect(items.length % large.per).toBe(0)
        expect(positions(items)).toContain(count - 1)
        expect(fresh.container.querySelector('figure')?.getAttribute('data-position')).toBe(
          String(large.read),
        )

        // The mark there is listed under the label the person heard, and choose gives the same.
        expect(items.find((item) => item.id === large.pick)?.label).toBe(heard)
        const chosen = await bridge.act([{ id: chart.id, action: 'choose', value: large.pick }])
        expect(chosen.results).toMatchObject([{ ok: true }])
        expect(agent).toHaveBeenCalledExactlyOnceWith(person.mock.calls[0]?.[0])
      } finally {
        bridge.dispose()
      }
    })
  },
)
