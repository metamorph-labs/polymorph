import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { lineChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'
import { syncGroupSize } from '@polymorph/solid'

import { mount } from '../mount'
import { solidAdapter } from '../conformance/solid'
import LineChart, { type LineChartProps } from './LineChart'
import { states } from './line-chart.states'

/**
 * LineChart in the Solid shell (`design/components/line-chart.md`): the strokes
 * land where the engine's model says once the plot is measured, a gap breaks
 * them, and a click, the tooltip, a brush on a linear x and the sync group
 * work, as the React member's tests hold them
 * (`packages/react-ui/src/charts/line-chart.test.tsx`), and the markers at the
 * reading position carry its flag. The reading position, its keys and the
 * brush's keys are `@polymorph/conformance/chart-reading`'s, which this file
 * calls. The drawing is the engine's `lineChartModel`, which every member
 * renders.
 */

beforeAll(installTestTheme)

const DAYS = [
  { day: '2026-07-01', opened: 28, resolved: 25 },
  { day: '2026-07-02', opened: 34, resolved: 30 },
  { day: '2026-07-03', opened: 31, resolved: 33 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const TIME = { key: 'day', scale: 'time' } as const

const lines = (root: Element) => [...root.querySelectorAll('path[class*="line"]')]
const crosshairs = (root: Element) => root.querySelectorAll('[class*="crosshair"]')

async function chart(label: string, props: Partial<LineChartProps> = {}) {
  const { host } = await mount(() => (
    <LineChart data={DAYS} series={PAIR} x={TIME} label={label} {...props} />
  ))
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('LineChart', () => {
  it('draws one stroke per series once the plot is measured, and is named', async () => {
    const { host } = await chart('Tickets')
    await vi.waitFor(() => expect(lines(host)).toHaveLength(2))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Tickets')
    expect(getByRole(host, 'img', { name: 'Tickets' })).toBeTruthy()
  })

  it('breaks the stroke at a gap and at a row whose date cannot parse', async () => {
    const { host } = await chart('Garbled', {
      data: [
        { day: '2026-07-01', opened: 28 },
        { day: 'not-a-date', opened: 30 },
        { day: '2026-07-03', opened: 31 },
        { day: '2026-07-04', opened: null },
        { day: '2026-07-05', opened: 33 },
      ],
      series: [{ key: 'opened', label: 'Opened' }],
      markers: true,
    })
    await vi.waitFor(() => expect(lines(host)).toHaveLength(1))
    // Three runs: the stroke stops at the unplaced row and at the gap.
    expect(lines(host)[0]?.getAttribute('d')?.match(/M/g)).toHaveLength(3)
    // Three markers for five rows: neither the unplaced row nor the gap draws one.
    expect(host.querySelectorAll('circle')).toHaveLength(3)
  })

  it('adds the wash only in the area variant, and markers only when asked', async () => {
    const plain = await chart('Line')
    await vi.waitFor(() => expect(lines(plain.host)).toHaveLength(2))
    expect(plain.host.querySelector('[class*="wash"]')).toBeNull()
    expect(plain.host.querySelectorAll('circle')).toHaveLength(0)

    const washed = await chart('Area', { variant: 'area', markers: true })
    await vi.waitFor(() => expect(washed.host.querySelector('svg[data-variant]')).toBeTruthy())
    expect(washed.host.querySelector('svg[data-variant]')?.getAttribute('data-variant')).toBe(
      'area',
    )
    expect(washed.host.querySelectorAll('path[class*="wash"]')).toHaveLength(2)
    expect(washed.host.querySelectorAll('circle')).toHaveLength(6)
  })

  it('draws a step-after curve when asked and a monotone curve by default', async () => {
    const stepped = await chart('Stepped', {
      series: [{ key: 'opened', label: 'Opened' }],
      curve: 'step',
    })
    await vi.waitFor(() => expect(lines(stepped.host)).toHaveLength(1))
    expect(lines(stepped.host)[0]?.getAttribute('d')).not.toContain('C')

    const smooth = await chart('Monotone', { series: [{ key: 'opened', label: 'Opened' }] })
    await vi.waitFor(() => expect(lines(smooth.host)).toHaveLength(1))
    expect(lines(smooth.host)[0]?.getAttribute('d')).toContain('C')
  })

  it('flags the markers at the reading position, one per series', async () => {
    const { host, plot } = await chart('Keyboard', { markers: true })
    await vi.waitFor(() => expect(lines(host)).toHaveLength(2))
    plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(host.querySelectorAll('circle[data-active]')).toHaveLength(2))
  })

  it('shows the tooltip at the reading position, and keeps the reading without it', async () => {
    const shown = await chart('Tooltip')
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('Jul')
    expect(tooltip?.textContent).toContain('28')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart('Print', { tooltip: false })
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(crosshairs(off.host)).toHaveLength(1)
    expect(off.live.textContent).toContain('Opened 28')
  })

  it('hides a toggled series from the plot but not from the twin', async () => {
    const { host } = await chart('Isolated')
    await vi.waitFor(() => expect(lines(host)).toHaveLength(2))
    const key = getByRole(host, 'button', { name: 'Opened' })
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(lines(host)).toHaveLength(1)

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Isolated — data/ })
    expect(table.textContent).toContain('Opened')
    expect(table.textContent).toContain('28')
  })

  it('reports the row a click reads through select', async () => {
    const onSelect = vi.fn()
    const { plot } = await chart('Selectable', { onSelect })
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]).toHaveProperty('datum')
  })

  it('commits numbers on a linear x', async () => {
    const onBrushEnd = vi.fn()
    const { plot } = await chart('Minutes', {
      data: [
        { minute: 20, opened: 4 },
        { minute: 0, opened: 6 },
        { minute: 10, opened: 5 },
      ],
      series: [{ key: 'opened', label: 'Opened' }],
      x: { key: 'minute', scale: 'linear' },
      onBrushEnd,
    })
    plot.focus()
    await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}{Enter}')
    // Sorted by the x values, not by the rows' order.
    expect(onBrushEnd).toHaveBeenCalledWith([0, 20])
  })

  it('warns and draws no brush on a band x', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { host, plot } = await chart('Banded', {
        data: [
          { week: 'W29', minutes: 38 },
          { week: 'W30', minutes: 35 },
          { week: 'W31', minutes: 33 },
        ],
        series: [{ key: 'minutes', label: 'Minutes' }],
        x: { key: 'week' },
        onBrushEnd: () => {},
      })
      expect(warn.mock.calls.some(([message]) => String(message).includes('continuum'))).toBe(true)
      plot.focus()
      await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}')
      expect(host.querySelector('[class*="range"]')).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })

  it('shares one reading across a sync group, and Escape clears it everywhere', async () => {
    const { host } = await mount(() => (
      <div>
        <LineChart data={DAYS} series={PAIR} x={TIME} syncId="pair" label="Sender" />
        <LineChart data={DAYS.slice(1)} series={PAIR} x={TIME} syncId="pair" label="Receiver" />
      </div>
    ))
    await vi.waitFor(() => expect(lines(host)).toHaveLength(4))
    const [sender, receiver] = [...host.querySelectorAll<HTMLElement>('[tabindex="0"]')]
    sender?.focus()
    await userEvent.keyboard('{End}')
    expect(crosshairs(host)).toHaveLength(2)
    // The broadcast is the x-domain value: the receiver, a row shorter, reads the same date.
    const lives = [...host.querySelectorAll('[aria-live="polite"]')].map((live) => live.textContent)
    expect(lives[0]).toContain('Opened 31')
    expect(lives[1]).toContain('Opened 31')

    await userEvent.keyboard('{Escape}')
    expect(crosshairs(host)).toHaveLength(0)
    expect(receiver?.closest('figure')?.textContent).not.toContain('Opened 31')
  })

  it('leaves its sync group when it unmounts', async () => {
    const { host, unmount } = await mount(() => (
      <LineChart data={DAYS} series={PAIR} x={TIME} syncId="leaving" label="Leaving" />
    ))
    await vi.waitFor(() => expect(lines(host)).toHaveLength(2))
    expect(syncGroupSize('leaving')).toBe(1)
    unmount()
    expect(syncGroupSize('leaving')).toBe(0)
  })

  it('draws every annotation kind through the shared layer', async () => {
    const { host } = await chart('Annotated', {
      baseline: { value: 30, label: 'SLA' },
      annotations: [
        { kind: 'band', from: 26, to: 32, label: 'Healthy' },
        { kind: 'point', x: '2026-07-02', y: 34, label: 'Launch' },
      ],
    })
    await vi.waitFor(() => expect(host.querySelector('[class*="span"]')).toBeTruthy())
    expect(host.querySelectorAll('[class*="edge"]').length).toBeGreaterThanOrEqual(2)
    expect(host.querySelector('[class*="rule"]')).toBeTruthy()
    expect(host.querySelector('circle[class*="mark"]')).toBeTruthy()
    // The labels and the endpoint values are text nodes with nothing around them.
    const texts = [...host.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toContain('SLA')
    expect(texts).toContain('Launch')
    expect(texts).toContain('33')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Solid', member: 'LineChart', entries: states.entries, adapter: solidAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
lineChartReadingLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <LineChart {...props} />),
})
