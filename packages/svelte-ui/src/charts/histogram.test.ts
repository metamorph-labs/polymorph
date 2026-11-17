import { getByRole } from '@testing-library/dom'
import { tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { installTestTheme } from '@polymorph/engine/testing'
import { binSample } from '@polymorph/svelte'

import { render } from '../mount'
import { svelteAdapter } from '../conformance/svelte'
import Histogram from './Histogram.svelte'
import { states } from './histogram.states.svelte'

/**
 * Histogram in the Svelte shell (`design/components/histogram.md`): the engine's
 * bins draw as contiguous bars once the plot is measured, the count axis is
 * anchored at zero, and a keyboard user can walk the distribution, as the
 * React member's tests hold them (`packages/react-ui/src/charts/histogram.test.tsx`).
 * Histogram has no contract fence, so these are the checks on its behaviour;
 * the drawing is the engine's `histogramModel`, which both members render.
 */

beforeAll(installTestTheme)

/** A sample whose Sturges count is stable: n = 32 → ⌈log₂ 32⌉ + 1 = 6 target. */
const SAMPLE = Array.from({ length: 32 }, (_, index) => (index * 13) % 40)

const BINS = binSample(SAMPLE)
const FIRST = BINS[0]!

const bars = (root: Element) => [...root.querySelectorAll('path[class*="bar"]')]

async function chart(props: Record<string, unknown>) {
  const { host } = await render(Histogram, { data: SAMPLE, label: 'Chart', ...props })
  await tick()
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('Histogram', () => {
  it('draws one bar per occupied bin once the plot is measured, and is named', async () => {
    const { host } = await chart({ label: 'Spread' })
    const occupied = BINS.filter((bin) => bin.count > 0)
    await vi.waitFor(() => expect(bars(host)).toHaveLength(occupied.length))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Spread')
    expect(host.querySelector('figure')?.getAttribute('data-member')).toBe('histogram')
    expect(getByRole(host, 'img', { name: 'Spread' })).toBeTruthy()
    // One measure and no series, so no legend.
    expect(host.querySelector('ul[data-key-shape]')).toBeNull()
  })

  it('lays bins contiguously, separated only by the 2px surface gap', async () => {
    const { host } = await chart({ label: 'Contiguous' })
    await vi.waitFor(() => expect(bars(host).length).toBeGreaterThan(1))
    const spans = bars(host)
      .map((bar) => {
        const box = (bar as SVGGraphicsElement).getBBox()
        return { from: box.x, to: box.x + box.width }
      })
      .sort((a, b) => a.from - b.from)
    for (let at = 1; at < spans.length; at += 1) {
      expect(spans[at]!.from - spans[at - 1]!.to).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('anchors the count axis at zero and warns off auto', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { host } = await chart({ y: { domain: 'auto' }, label: 'Anchored' })
      await vi.waitFor(() => expect(bars(host).length).toBeGreaterThan(0))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('counts'))
      const ticks = [...host.querySelectorAll('[class*="yAxis"] span')].map((span) =>
        span.textContent?.trim(),
      )
      expect(ticks).toContain('0')
      // The measure's ticks sit at bin edges, keeping the first.
      const edges = [...host.querySelectorAll('[class*="xAxis"] span')].map((span) =>
        span.textContent?.trim(),
      )
      expect(edges[0]).toBe(String(FIRST.from))
    } finally {
      warn.mockRestore()
    }
  })

  it('walks bins with arrow keys, announcing the en-dash range and its count', async () => {
    const { host, plot, live } = await chart({ label: 'Walk' })
    await vi.waitFor(() => expect(bars(host).length).toBeGreaterThan(0))
    plot.focus()
    expect(live.textContent, 'a resting pointer had already set the position').toBe('')

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe(`${FIRST.from}–${FIRST.to}: ${FIRST.count}`)
    const active = host.querySelectorAll('g[data-active]')
    expect(active).toHaveLength(1)
    expect(active[0]?.parentElement?.firstElementChild).toBe(active[0])

    await userEvent.keyboard('{End}')
    const last = BINS.at(-1)!
    expect(live.textContent).toBe(`${last.from}–${last.to}: ${last.count}`)

    await userEvent.keyboard('{Escape}')
    expect(live.textContent).toBe('')
    expect(host.querySelectorAll('g[data-active]')).toHaveLength(0)
  })

  it('reads the bin nearest the pointer', async () => {
    const { host, plot, live } = await chart({ label: 'Pointer' })
    await vi.waitFor(() => expect(bars(host).length).toBeGreaterThan(0))
    const rect = plot.getBoundingClientRect()
    // Svelte handles `pointermove` with one listener at the mount's root, so a dispatched event
    // reaches the plot's handler only if it bubbles. A pointer's own move bubbles.
    plot.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + 1,
        clientY: rect.top + 10,
      }),
    )
    await tick()
    expect(live.textContent).toBe(`${FIRST.from}–${FIRST.to}: ${FIRST.count}`)
  })

  it('heads the tooltip with the range, and keeps the reading and the twin without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    await vi.waitFor(() => expect(bars(shown.host).length).toBeGreaterThan(0))
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.querySelector('p')?.textContent?.trim()).toBe(`${FIRST.from}–${FIRST.to}`)
    expect(tooltip?.textContent).toContain('Count')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart({ label: 'Print', tooltip: false })
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent).toBe(`${FIRST.from}–${FIRST.to}: ${FIRST.count}`)

    await userEvent.click(getByRole(off.host, 'button', { name: 'Show the data table for Print' }))
    const table = getByRole(off.host, 'table', { name: 'Print — data' })
    expect(table.textContent).toContain(`${FIRST.from}–${FIRST.to}`)
    expect(table.textContent).toContain('Range')
  })

  it('reports the read bin’s edges and count through select, on Enter, Space and click', async () => {
    const onSelect = vi.fn()
    const { host, plot } = await chart({ label: 'Select', onSelect })
    expect(host.textContent).toContain('Enter or Space selects')
    plot.focus()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({
      bin: { from: FIRST.from, to: FIRST.to, count: FIRST.count },
    })
    await userEvent.keyboard('{ArrowRight} ')
    const second = BINS[1]!
    expect(onSelect).toHaveBeenLastCalledWith({
      bin: { from: second.from, to: second.to, count: second.count },
    })

    onSelect.mockClear()
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state and no axes for an empty sample', async () => {
    const { host } = await chart({ data: [], label: 'Empty' })
    expect(host.querySelector("[data-state='empty']")).not.toBeNull()
    expect(host.textContent).toContain('No data yet')
    expect(host.querySelector('[data-orientation]')).toBeNull()
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'Svelte',
  member: 'Histogram',
  entries: states.entries,
  adapter: svelteAdapter,
})
