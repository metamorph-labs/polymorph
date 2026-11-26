import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { heatmapReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { solidAdapter } from '../conformance/solid'
import Heatmap, { type HeatmapProps } from './Heatmap'
import { states } from './heatmap.states'

/**
 * Heatmap in the Solid shell (`design/components/heatmap.md`): the cells land
 * where the engine's model says once the plot is measured, each colour is one
 * of the emitted steps, an absent measurement shows the surface, and the scale
 * legend replaces the series legend, as the React member's tests hold them
 * (`packages/react-ui/src/charts/heatmap.test.tsx`). The walk over the grid on
 * both axes and its keys are `@polymorph/conformance/chart-reading`'s, which
 * this file calls. The drawing is the engine's `heatmapModel`, which every
 * member renders.
 */

beforeAll(installTestTheme)

const GRID = ['Mon', 'Tue', 'Wed'].flatMap((day, row) =>
  ['08–12', '12–16', '16–20'].map((band, column) => ({
    band,
    day,
    tickets: 10 * (row + 1) + column,
  })),
)

/** Signed deltas with one exact zero, which takes the mid colour. */
const SIGNED = [
  { shift: 'Morning', day: 'Mon', delta: -6 },
  { shift: 'Midday', day: 'Mon', delta: 8 },
  { shift: 'Evening', day: 'Mon', delta: 0 },
  { shift: 'Morning', day: 'Tue', delta: -1 },
  { shift: 'Midday', day: 'Tue', delta: 1 },
  { shift: 'Evening', day: 'Tue', delta: 3 },
]

const cells = (root: Element) => [...root.querySelectorAll('rect[class*="cell"]')]

const paintOf = (cell: Element) => (cell as SVGElement).style.getPropertyValue('--pm-chart-cell')

async function chart(props: Partial<HeatmapProps> & { label: string }) {
  const { host } = await mount(() => (
    <Heatmap
      data={GRID}
      x={{ key: 'band' }}
      y={{ key: 'day', label: 'Day' }}
      value={{ key: 'tickets' }}
      {...props}
    />
  ))
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('Heatmap', () => {
  it('draws one cell per measurement once the plot is measured, and is named', async () => {
    const { host } = await chart({ label: 'Volume' })
    await vi.waitFor(() => expect(cells(host)).toHaveLength(9))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Volume')
    expect(host.querySelector('figure')?.getAttribute('data-member')).toBe('heatmap')
    expect(getByRole(host, 'img', { name: 'Volume' })).toBeTruthy()
  })

  it('quantises to the emitted steps, and shows an absent measurement as surface', async () => {
    const { host } = await chart({ label: 'Steps' })
    await vi.waitFor(() => expect(cells(host)).toHaveLength(9))
    const paints = cells(host).map(paintOf)
    for (const paint of paints) expect(paint).toMatch(/^var\(--pm-chart-seq-[1-7]\)$/)
    expect(paints[0]).toBe('var(--pm-chart-seq-1)')
    expect(paints.at(-1)).toBe('var(--pm-chart-seq-7)')

    const sparse = await chart({
      data: GRID.map((row, index) => (index === 4 ? { ...row, tickets: null } : row)),
      label: 'Sparse',
    })
    // Eight cells for nine positions, and a pointer target at every position.
    await vi.waitFor(() => expect(cells(sparse.host)).toHaveLength(8))
    expect(sparse.host.querySelectorAll('rect[class*="hit"]')).toHaveLength(9)
  })

  it('reads the cell under the pointer', async () => {
    const { host, live } = await chart({ label: 'Pointer' })
    await vi.waitFor(() => expect(cells(host)).toHaveLength(9))
    const hits = [...host.querySelectorAll('rect[class*="hit"]')]
    await userEvent.hover(hits[8] as Element)
    await vi.waitFor(() => expect(live.textContent).toBe('16–20, Wed: 32'))
  })

  it('shows the tooltip at the read cell, and keeps the reading without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    await vi.waitFor(() => expect(cells(shown.host)).toHaveLength(9))
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('08–12')
    expect(tooltip?.textContent).toContain('10')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart({ label: 'Print', tooltip: false })
    await vi.waitFor(() => expect(cells(off.host)).toHaveLength(9))
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent).toBe('08–12, Mon: 10')
  })

  it('replaces the series legend with the ramp and its bounds, over a measured extent only', async () => {
    const { host } = await chart({ label: 'Legend' })
    await vi.waitFor(() => expect(host.querySelectorAll('[class*="step"]')).toHaveLength(7))
    expect(host.querySelector('ul[data-key-shape]')).toBeNull()
    const bounds = [...host.querySelectorAll('[class*="bound"]')].map((node) => node.textContent)
    expect(bounds.map((bound) => bound?.trim())).toEqual(['10', '32'])

    // A grid whose every value is `null` has cells but no extent: no legend reading 0 to 1.
    const unmeasured = await chart({
      data: GRID.map((row) => ({ ...row, tickets: null })),
      label: 'Unmeasured',
    })
    await vi.waitFor(() =>
      expect(unmeasured.host.querySelectorAll('rect[class*="hit"]')).toHaveLength(9),
    )
    expect(cells(unmeasured.host)).toHaveLength(0)
    expect(unmeasured.host.querySelectorAll('[class*="step"]')).toHaveLength(0)
  })

  it('switches to the diverging arms and the diverging scale legend on signed data', async () => {
    const { host } = await chart({
      data: SIGNED,
      x: { key: 'shift' },
      value: { key: 'delta' },
      label: 'Staffing delta',
    })
    await vi.waitFor(() => expect(cells(host)).toHaveLength(6))
    const paints = cells(host).map(paintOf)
    expect(paints).toContain('var(--pm-chart-neg-3)')
    expect(paints).toContain('var(--pm-chart-pos-3)')
    expect(paints).toContain('var(--pm-chart-neg-1)')
    expect(paints).toContain('var(--pm-chart-pos-1)')
    expect(paints.filter((paint) => paint === 'var(--pm-chart-mid)')).toHaveLength(1)
    expect(paints.some((paint) => paint.includes('seq'))).toBe(false)

    const legend = host.querySelector('[data-variant="diverging"]') as HTMLElement
    expect(legend).not.toBeNull()
    const bounds = [...legend.querySelectorAll('[class*="bounds"] > span')].map((bound) =>
      bound.textContent?.trim(),
    )
    expect(bounds).toEqual(['-8', '0', '8'])
    expect(legend.querySelectorAll('[class*="step"]')).toHaveLength(7)
  })

  it('lays out the twin as the same grid, with a row per y and a column per x', async () => {
    const { host } = await chart({ label: 'Twin' })
    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Twin — data/ })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.querySelectorAll('thead th')).toHaveLength(4)
    expect(table.querySelector('thead th')?.textContent?.trim()).toBe('Day')
    expect(table.textContent).toContain('32')
    expect(getByRole(host, 'button', { name: /hide the data table/i })).toBeTruthy()
  })

  it('reports the cell a click reads through select', async () => {
    const onSelect = vi.fn()
    const { host, plot } = await chart({ onSelect, label: 'Clickable' })
    await vi.waitFor(() => expect(cells(host)).toHaveLength(9))
    // The click lands on the grid's centre.
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledWith({ x: '12–16', y: 'Tue', value: 21 })
  })

  it('shows the empty state with no axes, legend or cells', async () => {
    const { host } = await chart({ data: [], label: 'Empty' })
    expect(host.querySelector('figure')?.getAttribute('data-state')).toBe('empty')
    expect(host.textContent).toContain('No activity in this range')
    expect(host.querySelector('[data-orientation]')).toBeNull()
    expect(host.querySelectorAll('[class*="step"]')).toHaveLength(0)
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Solid', member: 'Heatmap', entries: states.entries, adapter: solidAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
heatmapReadingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <Heatmap {...props} />),
})
