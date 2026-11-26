import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { scatterChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { scatterChartMeasureLaw } from '@polymorph/conformance/chart-measure'
import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import { vueAdapter } from '../conformance/vue'
import ScatterChart from './ScatterChart.vue'
import { states } from './scatter-chart.states'

/**
 * ScatterChart in the Vue shell (`design/components/scatter-chart.md`): the
 * marks land where the engine's model says once the plot is measured, the
 * pointer reads the nearest mark on the plane, and the palette's cap is read
 * from the theme, as the React member's tests hold them
 * (`packages/react-ui/src/charts/scatter-chart.test.tsx`). The per-mark
 * reading and its keys are `@polymorph/conformance/chart-reading`'s, which this
 * file calls. The drawing is the engine's `scatterChartModel`, which every
 * member renders.
 */

let chartCap = 0

beforeAll(() => {
  chartCap = installTestTheme().chartCap
})

const ROWS = [
  { minutes: 2, csat: 4.8 },
  { minutes: 6, csat: 4.1 },
  { minutes: 11, csat: 3.4 },
  { minutes: 14, csat: 3.1 },
]

const ONE = [{ key: 'csat', label: 'CSAT' }]

const TEAMS = [
  { minutes: 2, triage: 4.8, escalations: 4.2 },
  { minutes: 6, triage: 4.1, escalations: 3.8 },
]

const PAIR = [
  { key: 'triage', label: 'Triage' },
  { key: 'escalations', label: 'Escalations' },
]

const dots = (root: Element) => [...root.querySelectorAll('circle[class*="dot"]')]

async function chart(props: Record<string, unknown>) {
  const { host } = await mount(() =>
    h(ScatterChart, { data: ROWS, series: ONE, x: { key: 'minutes' }, label: 'Chart', ...props }),
  )
  await nextTick()
  const plot = host.querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement
  const live = host.querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
  return { host, plot, live }
}

/** A pointer move over the plot, at a point on its plane. */
function pointAt(plot: HTMLElement, x: number, y: number) {
  const rect = plot.getBoundingClientRect()
  plot.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: rect.left + x,
      clientY: rect.top + y,
    }),
  )
}

describe('ScatterChart', () => {
  it('draws one mark per placeable observation once the plot is measured, and is named', async () => {
    const { host } = await chart({ label: 'Correlation' })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(4))
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('Correlation')
    expect(getByRole(host, 'img', { name: 'Correlation' })).toBeTruthy()
    // Gridlines on both axes, because both are value axes.
    expect(host.querySelectorAll('[class*="yAxis"] span').length).toBeGreaterThan(1)
    expect(host.querySelectorAll('[class*="xAxis"] span').length).toBeGreaterThan(1)
  })

  it('renders no mark for a row with a null x, y or bubble value', async () => {
    const { host } = await chart({
      data: [
        { minutes: 2, csat: 4.8, tickets: 40 },
        { minutes: null, csat: 4.1, tickets: 40 },
        { minutes: 9, csat: null, tickets: 40 },
        { minutes: 12, csat: 3.3, tickets: null },
      ],
      bubble: { key: 'tickets' },
      label: 'Gaps',
    })
    await vi.waitFor(() => expect(host.querySelector('svg[class*="marks"]')).toBeTruthy())
    expect(dots(host)).toHaveLength(1)
  })

  it('sizes bubbles by area between the 8px and 24px diameters', async () => {
    const { host } = await chart({
      data: [
        { minutes: 2, csat: 4.8, tickets: 10 },
        { minutes: 6, csat: 4.1, tickets: 100 },
        { minutes: 11, csat: 3.4, tickets: 47 },
      ],
      bubble: { key: 'tickets', label: 'Tickets handled' },
      label: 'Bubbles',
    })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(3))
    const radii = dots(host).map((dot) => Number(dot.getAttribute('r')))
    expect(Math.min(...radii)).toBe(4)
    expect(Math.max(...radii)).toBe(12)
  })

  it('draws a zero rule per axis only when zero is inside that domain', async () => {
    const { host } = await chart({
      data: [
        { delta: -4, csat: 3.2 },
        { delta: 5, csat: 4.6 },
      ],
      x: { key: 'delta' },
      label: 'Signed x',
    })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(2))
    expect(host.querySelectorAll('path[class*="zero"]')).toHaveLength(1)
  })

  it('reads the mark nearest the pointer on the plane, and clears past the hit size', async () => {
    const { host, plot, live } = await chart({ data: TEAMS, series: PAIR, label: 'Pointer' })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(4))
    const escalation = dots(host)[3] as Element
    pointAt(
      plot,
      Number(escalation.getAttribute('cx')) - 3,
      Number(escalation.getAttribute('cy')) + 2,
    )
    await vi.waitFor(() => expect(live.textContent).toBe('6, 3.8: Escalations'))
    expect(escalation.hasAttribute('data-active')).toBe(true)

    pointAt(plot, -100, -100)
    await vi.waitFor(() => expect(live.textContent).toBe(''))
  })

  it('shows the tooltip at the read mark, and keeps the reading without it', async () => {
    const shown = await chart({ label: 'Tooltip' })
    await vi.waitFor(() => expect(dots(shown.host)).toHaveLength(4))
    shown.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tooltip = shown.host.querySelector('[class*="tooltip"]')
    expect(tooltip?.textContent).toContain('4.8')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')

    const off = await chart({ label: 'Print', tooltip: false })
    off.plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(off.host.querySelector('[class*="tooltip"]')).toBeNull()
    expect(off.live.textContent).toBe('2, 4.8: CSAT')
  })

  it('hides a toggled series and refits the domain, but keeps it in the twin', async () => {
    const { host } = await chart({
      data: [
        { minutes: 2, triage: 40, escalations: 8 },
        { minutes: 6, triage: 44, escalations: 10 },
      ],
      series: PAIR,
      label: 'Refit',
    })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(4))
    const axisMax = () =>
      Math.max(
        ...[...host.querySelectorAll('[class*="yAxis"] span')].map((span) =>
          Number(span.textContent ?? '0'),
        ),
      )
    const before = axisMax()

    const key = getByRole(host, 'button', { name: 'Triage' })
    expect(key.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(dots(host)).toHaveLength(2)
    expect(axisMax()).toBeLessThan(before)

    await userEvent.click(getByRole(host, 'button', { name: /show the data table/i }))
    const table = getByRole(host, 'table', { name: /Refit — data/ })
    expect(table.textContent).toContain('Triage')
    expect(table.textContent).toContain('40')
  })

  it('keeps the twin with x, y and bubble columns when the tooltip is off', async () => {
    const { host } = await chart({
      data: [{ minutes: 2, csat: 4.8, tickets: 40 }],
      x: { key: 'minutes', label: 'Minutes' },
      bubble: { key: 'tickets', label: 'Tickets handled' },
      tooltip: false,
      label: 'Print',
    })
    await userEvent.click(getByRole(host, 'button', { name: 'Show the data table for Print' }))
    const table = getByRole(host, 'table', { name: 'Print — data' })
    expect(table.textContent).toContain('Tickets handled')
    expect(table.textContent).toContain('40')
  })

  it('reports the mark a click reads through select', async () => {
    const onSelect = vi.fn()
    const { host } = await chart({ label: 'Selectable', onSelect })
    await vi.waitFor(() => expect(dots(host)).toHaveLength(4))
    await userEvent.click(dots(host)[2] as Element)
    expect(onSelect).toHaveBeenCalledWith({ index: 2, key: 'csat', datum: ROWS[2] })
  })

  it('dev-warns above the palette’s cap, names the token, and still draws every series', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const over = chartCap + 1
      const series = Array.from({ length: over }, (_, index) => ({
        key: `team${index}`,
        label: `Team ${index + 1}`,
      }))
      const row = { minutes: 4, ...Object.fromEntries(series.map((entry, at) => [entry.key, at])) }
      const { host } = await chart({ data: [row], series, label: 'Capped' })
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('--pm-chart-cap')),
      )
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${over} series`))
      expect(dots(host)).toHaveLength(over)

      warn.mockClear()
      await chart({ data: TEAMS, series: PAIR, label: 'Within the cap' })
      await nextTick()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('reads the cap when its marks appear, so an empty chart warns about none', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const capped = () =>
      warn.mock.calls.filter(([message]) => String(message).includes('--pm-chart-cap'))
    try {
      const series = Array.from({ length: chartCap + 1 }, (_, index) => ({
        key: `team${index}`,
        label: `Team ${index + 1}`,
      }))
      const row = { minutes: 4, ...Object.fromEntries(series.map((entry, at) => [entry.key, at])) }
      const data = ref<Record<string, number>[]>([])
      await mount(() =>
        h(ScatterChart, { data: data.value, series, x: { key: 'minutes' }, label: 'Empty' }),
      )
      await nextTick()
      expect(capped()).toHaveLength(0)

      // The marks appear: the cap is read, and its warning is logged once.
      data.value = [row]
      await vi.waitFor(() => expect(capped()).toHaveLength(1))
      await nextTick()
      expect(capped()).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'Vue', member: 'ScatterChart', entries: states.entries, adapter: vueAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
scatterChartReadingLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(ScatterChart, { ...props }))
    await nextTick()
    return mounted
  },
})

/* The measure it names, said once in its summary (`@polymorph/conformance/chart-measure`). */
scatterChartMeasureLaw({
  shell: 'Vue',
  async mount(props) {
    const mounted = await mount(() => h(ScatterChart, { ...props }))
    await nextTick()
    return mounted
  },
})
