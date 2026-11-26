import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { areaChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { areaChartMeasureLaw } from '@polymorph/conformance/chart-measure'
import { assertGoverned, type ChartDatum } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { AreaChart, type AreaChartProps } from './AreaChart'
import { states } from './area-chart.states'

/**
 * Browser checks: the axis reaches the **total**, not the tallest band; a gap
 * breaks the band instead of bridging it; the percent variant never shows a
 * share without the value beside it; and a linear x has no brush and no sync
 * group. The reading position, its keys and the brush's keys are the law's
 * (`@polymorph/conformance/chart-reading`), which this file calls for React.
 */

beforeAll(installTestTheme)

const WEEKS: ChartDatum[] = [
  { week: 'W30', urgent: 12, high: 34, normal: 68 },
  { week: 'W31', urgent: 16, high: 36, normal: 60 },
  { week: 'W32', urgent: 14, high: 38, normal: 64 },
]

const PRIORITY = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

const bands = (root: Element) => [...root.querySelectorAll('path[class*="band"]')]
const edges = (root: Element) => [...root.querySelectorAll('path[class*="edge"]')]
const yTicks = (root: Element) =>
  [...root.querySelectorAll('[class*="yAxis"] span')].map((span) => span.textContent ?? '')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AreaChartProps>(true)
  })
})

describe('AreaChart', () => {
  it('draws a wash and an edge per series', () => {
    const { container } = render(
      <AreaChart data={WEEKS} series={PRIORITY} x={{ key: 'week' }} label="Backlog" />,
    )
    expect(bands(container)).toHaveLength(3)
    expect(edges(container)).toHaveLength(3)
  })

  it('reaches the stack total on the value axis, not the tallest band', () => {
    // An axis derived from the series' own values would top out at 68, and the
    // stack, 114 at its tallest, would run off the plot.
    const { container } = render(
      <AreaChart data={WEEKS} series={PRIORITY} x={{ key: 'week' }} label="Total" />,
    )
    const highest = Math.max(...yTicks(container).map((text) => Number(text.replace(/\D/g, ''))))
    expect(highest).toBeGreaterThanOrEqual(114)
  })

  it('normalizes to 100% in the percent variant and formats the axis as percent', () => {
    const { container } = render(
      <AreaChart
        data={WEEKS}
        series={PRIORITY}
        x={{ key: 'week' }}
        variant="percent"
        label="Shares"
      />,
    )
    expect(container.querySelector('svg[data-variant]')?.getAttribute('data-variant')).toBe(
      'percent',
    )
    expect(yTicks(container)).toContain('100%')
  })

  it('breaks the band at a gap instead of bridging it', () => {
    const { container } = render(
      <AreaChart
        data={[
          { week: 'W30', urgent: 12, high: 34 },
          { week: 'W31', urgent: null, high: 36 },
          { week: 'W32', urgent: 14, high: 38 },
        ]}
        series={PRIORITY.slice(0, 2)}
        x={{ key: 'week' }}
        label="With a hole"
      />,
    )
    // Two subpaths: the band stops at the gap and starts again after it. A wash
    // across the gap would show an unmeasured quantity.
    const d = bands(container)[0]?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)
  })

  it('keeps a negative value off the stack and in the twin', async () => {
    const { container } = render(
      <AreaChart
        data={[
          { week: 'W30', urgent: 12, high: 34 },
          { week: 'W31', urgent: -8, high: 36 },
          { week: 'W32', urgent: 14, high: 38 },
        ]}
        series={PRIORITY.slice(0, 2)}
        x={{ key: 'week' }}
        label="Signed"
      />,
    )
    // A band runs upward from the total beneath it, so a negative band would run
    // *down* through the band below and paint a quantity that is not there.
    const d = bands(container)[0]?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    expect(screen.getByRole('table', { name: /Signed — data/ }).textContent).toContain('-8')
  })

  it('carries value and share into the twin in the percent variant', async () => {
    render(
      <AreaChart
        data={WEEKS}
        series={PRIORITY}
        x={{ key: 'week' }}
        variant="percent"
        label="Shares"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Shares — data/ })
    // The normalized number is never shown alone.
    expect(table.textContent).toContain('12')
    expect(table.textContent).toMatch(/%/)
  })

  it('restacks the remaining series when one is toggled off', async () => {
    const { container } = render(
      <AreaChart data={WEEKS} series={PRIORITY} x={{ key: 'week' }} label="Reseat" />,
    )
    expect(bands(container)).toHaveLength(3)
    const before = Math.max(...yTicks(container).map((tick) => Number(tick) || 0))
    expect(before).toBeGreaterThanOrEqual(116)

    const key = screen.getByRole('button', { name: 'High' })
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    // The bands above restack on the remaining total, and the axis refits to it.
    expect(bands(container)).toHaveLength(2)
    const after = Math.max(...yTicks(container).map((tick) => Number(tick) || 0))
    expect(after).toBeLessThan(before)

    // The twin still shows the hidden series, because it receives unfiltered rows.
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Reseat — data/ })
    expect(table.textContent).toContain('High')
    expect(table.textContent).toContain('34')
  })

  it('warns once that a linear x belongs to LineChart and still draws the chart', () => {
    // The spec allows a band or time x: "this member takes no linear x". The
    // warning is a console message naming LineChart, and the chart still
    // draws, as RadarChart does.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(
        <AreaChart
          data={[
            { minute: 0, urgent: 4, high: 9 },
            { minute: 10, urgent: 6, high: 7 },
            { minute: 20, urgent: 5, high: 8 },
          ]}
          series={PRIORITY.slice(0, 2)}
          x={{ key: 'minute', scale: 'linear' }}
          label="Linear"
        />,
      )
      const named = warn.mock.calls.filter(([message]) => String(message).includes('line-chart.md'))
      expect(named).toHaveLength(1)
      expect(String(named[0]?.[0])).toContain('LineChart')
      expect(bands(container)).toHaveLength(2)
      expect(edges(container)).toHaveLength(2)
    } finally {
      warn.mockRestore()
    }
  })

  it('disables the brush on a linear x, as the warning says', async () => {
    // The time test above covers the brush when present; this covers it when
    // absent. `onBrushEnd` on a linear x never enables the handlers: no range is
    // painted and nothing commits.
    const onBrushEnd = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(
        <AreaChart
          data={[
            { minute: 0, urgent: 4, high: 9 },
            { minute: 10, urgent: 6, high: 7 },
            { minute: 20, urgent: 5, high: 8 },
          ]}
          series={PRIORITY.slice(0, 2)}
          x={{ key: 'minute', scale: 'linear' }}
          onBrushEnd={onBrushEnd}
          label="Not brushable"
        />,
      )
      const plot = container.querySelector('[tabindex="0"]') as HTMLElement
      plot.focus()
      await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
      expect(container.querySelector('[class*="range"]')).toBeNull()
      await userEvent.keyboard('{Enter}')
      expect(onBrushEnd).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('leaves a linear x out of the sync group, sending and receiving', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const days: ChartDatum[] = [
        { day: '2026-07-01', urgent: 4, high: 9 },
        { day: '2026-07-02', urgent: 6, high: 7 },
        { day: '2026-07-03', urgent: 5, high: 8 },
      ]
      const { container } = render(
        <div>
          <AreaChart
            data={[
              { minute: 0, urgent: 4, high: 9 },
              { minute: 10, urgent: 6, high: 7 },
              { minute: 20, urgent: 5, high: 8 },
            ]}
            series={PRIORITY.slice(0, 2)}
            x={{ key: 'minute', scale: 'linear' }}
            syncId="pair"
            label="Linear loner"
          />
          <AreaChart
            data={days}
            series={PRIORITY.slice(0, 2)}
            x={{ key: 'day', scale: 'time' }}
            syncId="pair"
            label="Timed sibling"
          />
        </div>,
      )
      const plots = [...container.querySelectorAll('[tabindex="0"]')] as HTMLElement[]
      expect(plots).toHaveLength(2)

      plots[0]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      // The linear chart reads locally and broadcasts nothing, so there is one
      // crosshair.
      expect(container.querySelectorAll('[class*="crosshair"]')).toHaveLength(1)

      plots[1]!.focus()
      await userEvent.keyboard('{ArrowRight}')
      // It receives nothing either: the time sibling's broadcast has no
      // listener on this member, so there is again one crosshair, the sender's.
      expect(container.querySelectorAll('[class*="crosshair"]')).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('draws annotations in the percent variant’s ratio domain', () => {
    const { container } = render(
      <AreaChart
        data={WEEKS}
        series={PRIORITY}
        x={{ key: 'week' }}
        variant="percent"
        annotations={[{ kind: 'band', from: 0.25, to: 0.5, label: 'Band' }]}
        label="Ratio band"
      />,
    )
    const span = container.querySelector('[class*="span"]')
    expect(span).toBeTruthy()
    // A quarter of a percent plot is a quarter of its height.
    const height = Number(span?.getAttribute('height') ?? 0)
    expect(height).toBeGreaterThan(0)
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'AreaChart', entries: states.entries, adapter: reactAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
areaChartReadingLaw({
  shell: 'React',
  mount: async (props) => render(<AreaChart {...props} />),
})

/* The measure it names, said once in its summary (`@polymorph/conformance/chart-measure`). */
areaChartMeasureLaw({
  shell: 'React',
  mount: async (props) => render(<AreaChart {...props} />),
})
