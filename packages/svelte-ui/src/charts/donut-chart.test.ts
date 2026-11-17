import { getByRole } from '@testing-library/dom'
import { tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import { svelteAdapter } from '../conformance/svelte'
import DonutChart from './DonutChart.svelte'
import { states } from './donut-chart.states.svelte'

/**
 * DonutChart in the Svelte shell (`design/components/donut-chart.md`): the ring
 * draws where the engine's model says once the plot is measured, a zero or
 * negative segment stays off the ring and in the twin, the share is shown
 * wherever the value is, and a keyboard user reaches every segment, as the
 * React member's tests hold them (`packages/react-ui/src/charts/donut-chart.test.tsx`).
 * DonutChart has no contract fence, so these are the checks on its behaviour;
 * the drawing is the engine's `donutChartModel`, which both members render.
 */

beforeAll(installTestTheme)

const CHANNELS = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const arcs = (root: Element) => [...root.querySelectorAll('path[class*="segment"]')]
const hits = (root: Element) => [...root.querySelectorAll('path[class*="hit"]')]

async function chart(props: Record<string, unknown>) {
  const { host } = await render(DonutChart, { segments: CHANNELS, label: 'Chart', ...props })
  await tick()
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

async function openTwin(host: HTMLElement, name: RegExp): Promise<HTMLElement> {
  await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
  return getByRole(host, 'table', { name })
}

describe('DonutChart', () => {
  it('draws one arc per segment once the plot is measured, in declaration order, and is named', async () => {
    const { host } = await chart({ label: 'Channels' })
    await vi.waitFor(() => expect(arcs(host)).toHaveLength(4))
    expect(hits(host)).toHaveLength(4)
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Channels')
    expect(host.querySelector('figure')?.getAttribute('data-member')).toBe('donut-chart')
    expect(getByRole(host, 'img', { name: 'Channels' })).toBeTruthy()
    // The legend only labels: a ring has no domain to refit, so its keys are not buttons.
    const legend = host.querySelector('ul[data-key-shape="rect"]')
    expect(legend?.querySelectorAll('li')).toHaveLength(4)
    expect(legend?.querySelector('button')).toBeNull()
  })

  it('keeps a zero segment off the ring, and in the legend and the twin', async () => {
    const { host } = await chart({
      segments: [...CHANNELS.slice(0, 3), { key: 'social', label: 'Social', value: 0 }],
      label: 'With an unused channel',
    })
    await vi.waitFor(() => expect(arcs(host)).toHaveLength(3))
    expect(host.querySelectorAll('ul[data-key-shape="rect"] li')).toHaveLength(4)
    const table = await openTwin(host, /With an unused channel — data/)
    expect(table.textContent).toContain('Social')
    expect(table.textContent).toContain('0%')
  })

  it('keeps a negative segment off the ring and in the twin, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { host } = await chart({
        segments: [
          { key: 'sales', label: 'Sales', value: 400 },
          { key: 'refunds', label: 'Refunds', value: -60 },
        ],
        label: 'Signed',
      })
      await vi.waitFor(() => expect(arcs(host)).toHaveLength(1))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('A share cannot be negative'))
      expect((await openTwin(host, /Signed — data/)).textContent).toContain('-60')
    } finally {
      warn.mockRestore()
    }
  })

  it('walks the segments with arrow keys and says the value and the share', async () => {
    const { host, plot, live } = await chart({ label: 'Shares' })
    await vi.waitFor(() => expect(arcs(host)).toHaveLength(4))
    plot.focus()
    expect(live.textContent, 'a resting pointer had already set the position').toBe('')
    const active = () => arcs(host).filter((arc) => arc.hasAttribute('data-active'))

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe('Email: 214, 58%')
    expect(active()).toEqual([arcs(host)[0]])
    expect(host.querySelector('svg')?.hasAttribute('data-reading')).toBe(true)

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe('Chat: 96, 26%')
    expect(active()).toEqual([arcs(host)[1]])

    await userEvent.keyboard('{Escape}')
    expect(live.textContent).toBe('')
    expect(active()).toHaveLength(0)
  })

  it('reads the segment whose target the pointer enters', async () => {
    const { host, live } = await chart({ label: 'Pointer' })
    await vi.waitFor(() => expect(hits(host)).toHaveLength(4))
    hits(host)[2]?.dispatchEvent(new PointerEvent('pointerenter'))
    await tick()
    expect(live.textContent).toBe('Phone: 41, 11.1%')
  })

  it('shows the share in the tooltip outside the ring, and keeps the reading without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    await vi.waitFor(() => expect(arcs(shown.host)).toHaveLength(4))
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('214 · 58%')
    expect(tooltip?.textContent).toContain('Email')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
    expect(tooltip?.querySelector('p')).toBeNull()

    const off = await chart({ label: 'Print', tooltip: false })
    await vi.waitFor(() => expect(arcs(off.host)).toHaveLength(4))
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent).toBe('Email: 214, 58%')
  })

  it('renders the centre figure as real text, pre-formatted by the app', async () => {
    const { host } = await chart({
      center: { value: '369', label: 'Open tickets' },
      label: 'With a total',
    })
    await vi.waitFor(() => expect(host.querySelectorAll('text')).toHaveLength(2))
    const text = [...host.querySelectorAll('text')].map((node) => node.textContent?.trim())
    expect(text).toEqual(['369', 'Open tickets'])
  })

  it('gives a sliver a pointer target larger than its arc', async () => {
    const { host } = await chart({
      segments: [
        { key: 'bulk', label: 'Bulk', value: 990 },
        { key: 'sliver', label: 'Sliver', value: 10 },
      ],
      label: 'Uneven',
    })
    await vi.waitFor(() => expect(hits(host)).toHaveLength(2))
    expect(hits(host)[1]?.getAttribute('d')).not.toBe(arcs(host)[1]?.getAttribute('d'))
  })

  it('shows no legend for a single segment', async () => {
    const { host } = await chart({
      segments: [{ key: 'all', label: 'All', value: 12 }],
      label: 'One',
    })
    await vi.waitFor(() => expect(arcs(host)).toHaveLength(1))
    expect(host.querySelector('[class*="legend"]')).toBeNull()
  })

  it('reports the read segment with its share through select, on Enter, Space and click', async () => {
    const onSelect = vi.fn()
    const { host, plot } = await chart({ label: 'Selectable', onSelect })
    expect(host.textContent).toContain('Enter or Space selects')
    plot.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({
      key: 'chat',
      label: 'Chat',
      value: 96,
      share: 96 / (214 + 96 + 41 + 18),
    })
    await userEvent.keyboard('{ArrowRight} ')
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'phone' }))

    onSelect.mockClear()
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('renders the empty sentence for no segments', async () => {
    const { host } = await chart({ segments: [], label: 'Nothing' })
    expect(host.querySelector('figure')?.getAttribute('data-state')).toBe('empty')
    expect(host.textContent).toContain('No data yet')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Svelte',
  member: 'DonutChart',
  entries: states.entries,
  adapter: svelteAdapter,
})
