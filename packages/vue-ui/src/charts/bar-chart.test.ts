import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'

import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { barChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { vueAdapter } from '../conformance/vue'
import BarChart from './BarChart.vue'
import { states } from './bar-chart.states'

/**
 * BarChart in the Vue shell (`design/components/bar-chart.md`): the marks land
 * where the engine's model says once the plot is measured, with the tooltip,
 * the legend, a click and the annotation layer, as the React member's tests
 * hold them (`packages/react-ui/src/charts/bar-chart.test.tsx`). The reading
 * position and its keys are `@polymorph/conformance/chart-reading`'s, the
 * lines over the bars `@polymorph/conformance/bar-lines`'s and the chart's box
 * `@polymorph/conformance/chart-box`'s, which this file calls. The drawing is
 * the engine's `barChartModel`, which every member renders.
 */

beforeAll(installTestTheme)

/* The lines over the bars, as `@polymorph/conformance/bar-lines` states them for every web shell. */
barLinesLaw({
  shell: 'Vue',
  mount: async (props) => (await mount(() => h(BarChart, props))).host,
})

const ROWS = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const bars = (root: Element) => [...root.querySelectorAll('path[class*="bar"]')]

async function chart(props: { label: string } & Record<string, unknown>) {
  const { host } = await mount(() =>
    h(BarChart, { data: ROWS, series: PAIR, x: { key: 'day' }, ...props }),
  )
  await nextTick()
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

describe('BarChart', () => {
  it('draws one mark per series per row once the plot is measured, and is named', async () => {
    const { host } = await chart({ label: 'Opened and resolved' })
    await vi.waitFor(() => expect(bars(host)).toHaveLength(6))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Opened and resolved')
    expect(getByRole(host, 'img', { name: 'Opened and resolved' })).toBeTruthy()
  })

  it('draws nothing for a gap and anchors the value axis at zero', async () => {
    const { host } = await chart({
      data: [
        { day: 'Mon', opened: 40 },
        { day: 'Tue', opened: null },
      ],
      series: [{ key: 'opened', label: 'Opened' }],
      label: 'With a gap',
    })
    await vi.waitFor(() => expect(bars(host)).toHaveLength(1))
    const ticks = [...host.querySelectorAll('[class*="yAxis"] span')].map(
      (span) => span.textContent,
    )
    expect(ticks).toContain('0')
  })

  it('shows the tooltip at the reading position, and keeps the reading without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('Mon')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart({ label: 'Print', tooltip: false })
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent).toContain('Opened 32')
  })

  it('hides a toggled series and refits the domain, but keeps it in the twin', async () => {
    const { host } = await chart({
      data: [
        { day: 'Mon', opened: 40, resolved: 8 },
        { day: 'Tue', opened: 44, resolved: 10 },
      ],
      label: 'Refit',
    })
    await vi.waitFor(() => expect(bars(host)).toHaveLength(4))
    const axisMax = () =>
      Math.max(
        ...[...host.querySelectorAll('[class*="yAxis"] span')].map((span) =>
          Number(span.textContent ?? '0'),
        ),
      )
    const before = axisMax()

    const key = getByRole(host, 'button', { name: 'Opened' })
    expect(key.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(bars(host)).toHaveLength(2)
    expect(axisMax()).toBeLessThan(before)

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Refit — data/ })
    expect(table.textContent).toContain('Opened')
    expect(table.textContent).toContain('40')
    expect(getByRole(host, 'button', { name: /hide the data table/i })).toBeTruthy()
  })

  it('reports the band a click reads through select', async () => {
    const onSelect = vi.fn()
    const { plot } = await chart({ label: 'Selectable', onSelect })
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('stacks to the running total, and falls back to grouped for mixed signs with a warning', async () => {
    const stacked = await chart({
      data: [{ day: 'Mon', a: 40, b: 40, c: 40 }],
      series: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ],
      mode: 'stacked',
      label: 'Stack total',
    })
    await vi.waitFor(() => expect(bars(stacked.host)).toHaveLength(3))
    expect(stacked.host.querySelector('svg[data-mode]')?.getAttribute('data-mode')).toBe('stacked')
    const ticks = [...stacked.host.querySelectorAll('[class*="tick"]')].map(
      (tick) => tick.textContent ?? '',
    )
    expect(ticks.some((label) => Number(label.replace(/[^\d]/g, '')) >= 120)).toBe(true)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const mixed = await chart({
        data: [{ day: 'Mon', a: 10, b: -4 }],
        series: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ],
        mode: 'stacked',
        label: 'Mixed signs',
      })
      await vi.waitFor(() =>
        expect(mixed.host.querySelector('svg[data-mode]')?.getAttribute('data-mode')).toBe(
          'grouped',
        ),
      )
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('mode: "diverging"'))
    } finally {
      warn.mockRestore()
    }
  })

  it('draws a reference band and a target through the shared annotation layer', async () => {
    const { host } = await chart({
      baseline: { value: 40, label: 'Target' },
      annotations: [{ kind: 'band', from: 30, to: 38 }],
      label: 'Annotated',
    })
    await vi.waitFor(() => expect(host.querySelector('[class*="span"]')).toBeTruthy())
    expect(host.querySelector('[class*="rule"]')).toBeTruthy()
    const texts = [...host.querySelectorAll('text')].map((text) => text.textContent?.trim())
    expect(texts).toContain('Target')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Vue', member: 'BarChart', entries: states.entries, adapter: vueAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
barChartReadingLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(BarChart, { ...props }))
    await nextTick()
    return mounted
  },
})
