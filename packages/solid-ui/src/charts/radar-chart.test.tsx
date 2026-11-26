import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { radarChartReadingLaw } from '@polymorph/conformance/chart-reading'
import type { ResolvedTheme } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import RadarChart, { type RadarChartProps } from './RadarChart'

/**
 * RadarChart in the Solid shell (`design/components/radar-chart.md`): the rings,
 * polygons and vertices land where the engine's model says once the plot is
 * measured, the pointer reads the nearest vertex, and the palette's cap is
 * read from the plot, as the React member's tests hold them
 * (`packages/react-ui/src/charts/radar-chart.test.tsx`). The vertex walk
 * around the polygon and its keys are `@polymorph/conformance/chart-reading`'s,
 * which this file calls. The drawing is the engine's `radarChartModel`, which
 * every member renders.
 */

let theme: ResolvedTheme

beforeAll(() => {
  theme = installTestTheme()
})

const AXES = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'coverage', label: 'Coverage' },
]

const ROWS = [
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

const vertices = (root: Element) => [...root.querySelectorAll('circle[class*="vertex"]')]
const profiles = (root: Element) => [...root.querySelectorAll('g[class*="profiles"] > g')]

async function chart(props: Partial<RadarChartProps> & { label: string }) {
  const { host } = await mount(() => (
    <RadarChart axes={AXES} data={ROWS} series={PAIR} {...props} />
  ))
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('RadarChart', () => {
  it('draws rings as polygons and a vertex per measured value once measured, and is named', async () => {
    const { host } = await chart({ label: 'Rings' })
    await vi.waitFor(() => expect(vertices(host)).toHaveLength(10))
    expect(profiles(host)).toHaveLength(2)
    const grid = host.querySelector('g[class*="grid"]') as SVGElement
    expect(grid.querySelectorAll('circle')).toHaveLength(0)
    const rings = [...grid.querySelectorAll('path')].filter((path) =>
      (path.getAttribute('d') ?? '').endsWith('Z'),
    )
    expect(rings.length).toBeGreaterThanOrEqual(3)
    for (const ring of rings) expect(ring.getAttribute('d')).not.toContain('A')
    const labels = [...host.querySelectorAll('g[class*="labels"] text')]
    expect(labels.map((label) => label.textContent?.trim())).toEqual(AXES.map((axis) => axis.label))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Rings')
    expect(host.querySelector('figure')?.getAttribute('data-member')).toBe('radar-chart')
    expect(getByRole(host, 'img', { name: 'Rings' })).toBeTruthy()
    expect(host.textContent).toContain('one shared scale from zero to 5')
  })

  it('breaks the polygon at a null vertex instead of dropping to zero', async () => {
    const gapped = ROWS.map((row, index) => (index === 2 ? { agent: null, team: 3 } : row))
    const { host } = await chart({ data: gapped, label: 'Gap' })
    await vi.waitFor(() => expect(vertices(host)).toHaveLength(9))
    const stroke = host.querySelector('g[class*="profiles"] > g path[class*="stroke"]')
    expect(((stroke?.getAttribute('d') ?? '').match(/M/g) ?? []).length).toBeGreaterThan(1)
  })

  it('reads the vertex nearest the pointer, and nothing once it leaves', async () => {
    const { host, live } = await chart({ label: 'Pointer' })
    await vi.waitFor(() => expect(vertices(host)).toHaveLength(10))
    await userEvent.hover(vertices(host)[0] as Element)
    await vi.waitFor(() => expect(live.textContent?.trim()).toBe('First response: Agent, 4.5'))
    await userEvent.unhover(host.querySelector('[tabindex="0"]') as Element)
    await vi.waitFor(() => expect(live.textContent?.trim()).toBe(''))
  })

  it('shows the tooltip at the reading position, and keeps the reading without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    await vi.waitFor(() => expect(vertices(shown.host)).toHaveLength(10))
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('First response')
    expect(tooltip?.textContent).toContain('4.5')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart({ label: 'Print', tooltip: false })
    await vi.waitFor(() => expect(vertices(off.host)).toHaveLength(10))
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent?.trim()).toBe('First response: Agent, 4.5')
  })

  it('hides a toggled series and refits the shared scale, but keeps it in the twin', async () => {
    const data = AXES.map((_, index) => ({ agent: index === 0 ? 40 : 10, team: 2 }))
    const { host } = await chart({ data, label: 'Refit' })
    await vi.waitFor(() => expect(profiles(host)).toHaveLength(2))
    expect(host.textContent).toContain('from zero to 40')

    const key = getByRole(host, 'button', { name: 'Agent' })
    expect(key.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(profiles(host)).toHaveLength(1)
    expect(host.textContent).toContain('from zero to 2')

    await userEvent.click(getByRole(host, 'button', { name: 'Show the data table for Refit' }))
    const table = getByRole(host, 'table', { name: 'Refit — data' })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5)
    expect(table.textContent).toContain('Agent')
    expect(table.textContent).toContain('40')
    expect(getByRole(host, 'button', { name: 'Hide the data table for Refit' })).toBeTruthy()
  })

  it('draws no legend for one series', async () => {
    const { host } = await chart({ series: PAIR.slice(1, 2), label: 'One' })
    await vi.waitFor(() => expect(profiles(host)).toHaveLength(1))
    expect(host.querySelector('[data-key-shape]')).toBeNull()
  })

  it('reports the vertex a click reads through select, and nothing far from every vertex', async () => {
    const onSelect = vi.fn()
    const { host, plot } = await chart({ label: 'Selectable', onSelect })
    await vi.waitFor(() => expect(vertices(host)).toHaveLength(10))
    // At the centre, far from every vertex, a click reads none.
    await userEvent.click(plot)
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.click(vertices(host)[0] as Element)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({ axis: 'firstResponse', key: 'agent', value: 4.5 })
  })

  it('dev-warns above the palette’s cap and names the token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const over = theme.chartCap + 1
      const series = Array.from({ length: over }, (_, index) => ({
        key: `t${index}`,
        label: `Team ${index + 1}`,
      }))
      const data = AXES.map(() => Object.fromEntries(series.map((entry) => [entry.key, 3])))
      await chart({ data, series, label: 'Capped' })
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('--pm-chart-cap')),
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('warns on fewer than three axes and still draws them', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { host } = await chart({
        axes: AXES.slice(0, 2),
        data: ROWS.slice(0, 2),
        label: 'Dumbbell',
      })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('dumbbell'))
      await vi.waitFor(() => expect(vertices(host)).toHaveLength(4))
    } finally {
      warn.mockRestore()
    }
  })
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
radarChartReadingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <RadarChart {...props} />),
})
