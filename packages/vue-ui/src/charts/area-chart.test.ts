import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { areaChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { vueAdapter } from '../conformance/vue'
import AreaChart from './AreaChart.vue'
import { states } from './area-chart.states'

/**
 * AreaChart in the Vue shell (`design/components/area-chart.md`): the bands
 * stack where the engine's model says once the plot is measured, the axis
 * reaches the total, a gap breaks a band, the percent variant never shows a
 * share without its value, and a linear x has no brush and no sync group, as
 * the React member's tests hold them
 * (`packages/react-ui/src/charts/area-chart.test.tsx`). The reading position,
 * its keys and the brush's keys are `@polymorph/conformance/chart-reading`'s,
 * which this file calls. The drawing is the engine's `areaChartModel`, which
 * every member renders.
 */

beforeAll(installTestTheme)

const WEEKS = [
  { week: 'W30', urgent: 12, high: 34, normal: 68 },
  { week: 'W31', urgent: 16, high: 36, normal: 60 },
  { week: 'W32', urgent: 14, high: 38, normal: 64 },
]

const PRIORITY = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

const DAYS = [
  { day: '2026-07-01', urgent: 4, high: 9 },
  { day: '2026-07-02', urgent: 6, high: 7 },
  { day: '2026-07-03', urgent: 5, high: 8 },
]

const MINUTES = [
  { minute: 0, urgent: 4, high: 9 },
  { minute: 10, urgent: 6, high: 7 },
  { minute: 20, urgent: 5, high: 8 },
]

const bands = (root: Element) => [...root.querySelectorAll('path[class*="band"]')]
const edges = (root: Element) => [...root.querySelectorAll('path[class*="edge"]')]
const crosshairs = (root: Element) => root.querySelectorAll('[class*="crosshair"]')
const yTicks = (root: Element) =>
  [...root.querySelectorAll('[class*="yAxis"] span')].map((span) => span.textContent?.trim() ?? '')

async function chart(label: string, props: Record<string, unknown> = {}) {
  const { host } = await mount(() =>
    h(AreaChart, { data: WEEKS, series: PRIORITY, x: { key: 'week' }, label, ...props }),
  )
  await nextTick()
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('AreaChart', () => {
  it('draws a wash and an edge per series once measured, and the axis reaches the total', async () => {
    const { host } = await chart('Backlog')
    await vi.waitFor(() => expect(bands(host)).toHaveLength(3))
    expect(edges(host)).toHaveLength(3)
    expect(getByRole(host, 'img', { name: 'Backlog' })).toBeTruthy()
    // The stack is 114 at its tallest; an axis over the series' own values would stop at 68.
    const highest = Math.max(...yTicks(host).map((tick) => Number(tick.replace(/\D/g, ''))))
    expect(highest).toBeGreaterThanOrEqual(114)
  })

  it('normalizes to 100% in the percent variant, with value and share in the twin', async () => {
    const { host } = await chart('Shares', { variant: 'percent' })
    await vi.waitFor(() => expect(host.querySelector('svg[data-variant]')).toBeTruthy())
    expect(host.querySelector('svg[data-variant]')?.getAttribute('data-variant')).toBe('percent')
    expect(yTicks(host)).toContain('100%')

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Shares — data/ })
    expect(table.textContent).toContain('12 · ')
    expect(table.textContent).toMatch(/%/)
  })

  it('breaks the band at a gap, and keeps a negative value off the stack and in the twin', async () => {
    const { host } = await chart('Signed', {
      data: [
        { week: 'W30', urgent: 12, high: 34 },
        { week: 'W31', urgent: -8, high: 36 },
        { week: 'W32', urgent: 14, high: 38 },
        { week: 'W33', urgent: null, high: 30 },
        { week: 'W34', urgent: 10, high: 31 },
      ],
      series: PRIORITY.slice(0, 2),
    })
    await vi.waitFor(() => expect(bands(host)).toHaveLength(2))
    // Three runs: the band stops at the negative value and at the gap.
    expect(bands(host)[0]?.getAttribute('d')?.match(/M/g)).toHaveLength(3)

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    expect(getByRole(host, 'table', { name: /Signed — data/ }).textContent).toContain('-8')
  })

  it('marks the reading with the crosshair alone, and heads the tooltip with the row', async () => {
    const { host, plot } = await chart('Keyboard')
    await vi.waitFor(() => expect(bands(host)).toHaveLength(3))
    plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(crosshairs(host)).toHaveLength(1))
    expect([...host.querySelectorAll('[data-active]')]).toEqual([...crosshairs(host)])
    expect(host.querySelector('[class*="tooltip"]')?.textContent).toContain('W30')
  })

  it('reads value and share at the position in the percent variant', async () => {
    const { plot, live } = await chart('Share readout', { variant: 'percent' })
    plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toMatch(/Urgent 12 · \d+%/)
  })

  it('keeps the reading without the tooltip', async () => {
    const { host, plot, live } = await chart('Print', { tooltip: false })
    plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(crosshairs(host)).toHaveLength(1)
    expect(live.textContent).toContain('Urgent 12')
  })

  it('restacks the remaining series when one is toggled off, and keeps it in the twin', async () => {
    const { host } = await chart('Reseat')
    await vi.waitFor(() => expect(bands(host)).toHaveLength(3))
    const top = () => Math.max(...yTicks(host).map((tick) => Number(tick) || 0))
    const before = top()

    const key = getByRole(host, 'button', { name: 'High' })
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(bands(host)).toHaveLength(2)
    expect(top()).toBeLessThan(before)

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Reseat — data/ })
    expect(table.textContent).toContain('High')
    expect(table.textContent).toContain('34')
  })

  it('reports the row a click reads through select', async () => {
    const onSelect = vi.fn()
    const { plot } = await chart('Selectable', { onSelect })
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('warns once that a linear x belongs to LineChart, draws it, and gives it no brush', async () => {
    const onBrushEnd = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { host, plot } = await chart('Linear', {
        data: MINUTES,
        series: PRIORITY.slice(0, 2),
        x: { key: 'minute', scale: 'linear' },
        onBrushEnd,
      })
      await vi.waitFor(() => expect(bands(host)).toHaveLength(2))
      const named = warn.mock.calls.filter(([message]) => String(message).includes('line-chart.md'))
      expect(named).toHaveLength(1)
      expect(String(named[0]?.[0])).toContain('LineChart')

      plot.focus()
      await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
      expect(host.querySelector('[class*="range"]')).toBeNull()
      await userEvent.keyboard('{Enter}')
      expect(onBrushEnd).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('shares one reading across a time sync group, and leaves a linear x out of it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const pair = { series: PRIORITY.slice(0, 2), syncId: 'pair' }
      const { host } = await mount(() =>
        h('div', [
          h(AreaChart, {
            ...pair,
            data: MINUTES,
            x: { key: 'minute', scale: 'linear' },
            label: 'Loner',
          }),
          h(AreaChart, { ...pair, data: DAYS, x: { key: 'day', scale: 'time' }, label: 'Sender' }),
          h(AreaChart, {
            ...pair,
            data: DAYS,
            x: { key: 'day', scale: 'time' },
            label: 'Receiver',
          }),
        ]),
      )
      await vi.waitFor(() => expect(bands(host)).toHaveLength(6))
      const [loner, sender] = [...host.querySelectorAll<HTMLElement>('[tabindex="0"]')]

      // The linear chart reads locally and sends nothing.
      loner?.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(crosshairs(host)).toHaveLength(1)

      // The time charts share the reading; the linear chart receives nothing.
      sender?.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(crosshairs(host)).toHaveLength(2)

      await userEvent.keyboard('{Escape}')
      expect(crosshairs(host)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  it('draws a capacity baseline when stacked, and annotations in the percent ratio domain', async () => {
    const stacked = await chart('Capacity', { baseline: { value: 120, label: 'Capacity' } })
    await vi.waitFor(() => expect(stacked.host.querySelector('[class*="rule"]')).toBeTruthy())
    const texts = [...stacked.host.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toContain('Capacity')

    const ratio = await chart('Ratio band', {
      variant: 'percent',
      annotations: [{ kind: 'band', from: 0.25, to: 0.5, label: 'Band' }],
    })
    await vi.waitFor(() => expect(ratio.host.querySelector('[class*="span"]')).toBeTruthy())
    expect(
      Number(ratio.host.querySelector('[class*="span"]')?.getAttribute('height')),
    ).toBeGreaterThan(0)
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Vue', member: 'AreaChart', entries: states.entries, adapter: vueAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
areaChartReadingLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(AreaChart, { ...props }))
    await nextTick()
    return mounted
  },
})
