import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { donutChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { solidAdapter } from '../conformance/solid'
import DonutChart, { type DonutChartProps } from './DonutChart'
import { states } from './donut-chart.states'

/**
 * DonutChart in the Solid shell (`design/components/donut-chart.md`): the ring
 * draws where the engine's model says once the plot is measured, a zero or
 * negative segment stays off the ring and in the twin, and the tooltip shows
 * the share, as the React member's tests hold them
 * (`packages/react-ui/src/charts/donut-chart.test.tsx`). The walk over the
 * segments, the value and share each one says, and its keys are
 * `@polymorph/conformance/chart-reading`'s, which this file calls. The drawing
 * is the engine's `donutChartModel`, which every member renders.
 */

beforeAll(installTestTheme)

/** A frame for the browser to paint, so the member's effects have run. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

const CHANNELS = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const arcs = (root: Element) => [...root.querySelectorAll('path[class*="segment"]')]
const hits = (root: Element) => [...root.querySelectorAll('path[class*="hit"]')]

async function chart(props: Partial<DonutChartProps>) {
  const { host } = await mount(() => <DonutChart segments={CHANNELS} label="Chart" {...props} />)
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

  it('reads the segment whose target the pointer enters', async () => {
    const { host, live } = await chart({ label: 'Pointer' })
    await vi.waitFor(() => expect(hits(host)).toHaveLength(4))
    hits(host)[2]?.dispatchEvent(new PointerEvent('pointerenter'))
    await frame()
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

  it('reports the segment the pointer reads on a click, with its share', async () => {
    const onSelect = vi.fn()
    const { host, plot, live } = await chart({ label: 'Selectable', onSelect })
    await vi.waitFor(() => expect(hits(host)).toHaveLength(4))
    hits(host)[1]?.dispatchEvent(new PointerEvent('pointerenter'))
    await vi.waitFor(() => expect(live.textContent).toBe('Chat: 96, 26%'))
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledWith({
      key: 'chat',
      label: 'Chat',
      value: 96,
      share: 96 / (214 + 96 + 41 + 18),
    })
  })

  it('renders the empty sentence for no segments', async () => {
    const { host } = await chart({ segments: [], label: 'Nothing' })
    expect(host.querySelector('figure')?.getAttribute('data-state')).toBe('empty')
    expect(host.textContent).toContain('No data yet')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Solid',
  member: 'DonutChart',
  entries: states.entries,
  adapter: solidAdapter,
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
donutChartReadingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <DonutChart {...props} />),
})
