import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { lineChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { assertGoverned, type ChartDatum } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { LineChart, type LineChartProps } from './LineChart'
import { states } from './line-chart.states'

/**
 * Browser checks: a gap breaks the stroke, a calendar date lands on its own day,
 * a click activates, a band x has no brush, and a sync group shares one
 * reading. The reading position, its keys and the brush's keys are the law's
 * (`@polymorph/conformance/chart-reading`), which this file calls for React.
 */

beforeAll(installTestTheme)

const DAYS: ChartDatum[] = [
  { day: '2026-07-01', opened: 28, resolved: 25 },
  { day: '2026-07-02', opened: 34, resolved: 30 },
  { day: '2026-07-03', opened: 31, resolved: 33 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

/** A band x (weeks are names here, not instants) for the cases with no continuum. */
const TEAMISH: ChartDatum[] = [
  { week: 'W29', minutes: 38 },
  { week: 'W30', minutes: 35 },
  { week: 'W31', minutes: 33 },
]

const lines = (root: Element) => [...root.querySelectorAll('path[class*="line"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<LineChartProps>(true)
  })
})

describe('LineChart', () => {
  it('draws one stroke per series', () => {
    const { container } = render(
      <LineChart data={DAYS} series={PAIR} x={{ key: 'day', scale: 'time' }} label="Tickets" />,
    )
    expect(lines(container)).toHaveLength(2)
  })

  it('breaks the stroke at a gap rather than dipping it to zero', () => {
    // The member's most important rule: drawing a `null` as a dip would show a
    // drop that is not in the data.
    const { container } = render(
      <LineChart
        data={[
          { day: '2026-07-01', opened: 28 },
          { day: '2026-07-02', opened: null },
          { day: '2026-07-03', opened: 31 },
        ]}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day', scale: 'time' }}
        label="With a gap"
      />,
    )
    const d = lines(container)[0]?.getAttribute('d') ?? ''
    // Two `M` commands: the stroke stops and starts again.
    expect(d.match(/M/g)).toHaveLength(2)
  })

  it('leaves a row whose date cannot parse as a gap, not a point at the left edge', () => {
    // An invalid ISO string placed at x=0 would draw a mark at the domain's
    // left edge for a value that was never parsed. A row with no x position
    // breaks the stroke, as a row with no value does.
    const { container } = render(
      <LineChart
        data={[
          { day: '2026-07-01', opened: 28 },
          { day: 'not-a-date', opened: 30 },
          { day: '2026-07-03', opened: 31 },
        ]}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day', scale: 'time' }}
        markers
        label="Garbled"
      />,
    )
    const d = lines(container)[0]?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)
    // Two markers for three rows: the row with no x position draws nothing.
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })

  it('starts the stroke stagger at zero regardless of the elements before it', () => {
    // The stagger counts only series. A stagger on `.marks g` would count the
    // grid and the target rule first, so the first series would enter late,
    // and by a different number of steps with a baseline than without.
    const { container } = render(
      <LineChart
        data={DAYS}
        series={PAIR}
        x={{ key: 'day', scale: 'time' }}
        baseline={{ value: 30, label: 'Target' }}
        label="Staggered"
      />,
    )
    const strokes = [...container.querySelectorAll('[class*="strokes"] > g')]
    expect(strokes).toHaveLength(2)
    expect(getComputedStyle(strokes[0]!).animationDelay).toBe('0s')
    expect(getComputedStyle(strokes[1]!).animationDelay).not.toBe('0s')
    const grid = container.querySelector('[class*="grid"]') as SVGGElement
    expect(getComputedStyle(grid).animationName).toBe('none')
  })

  it('reads a date-only value as a calendar date, not as UTC midnight', () => {
    // An axis one day early goes unnoticed until a month boundary, which is
    // why the parse has its own branch instead of using `new Date`.
    const { container } = render(
      <LineChart
        data={[
          { month: '2026-08-01', tickets: 10 },
          { month: '2026-09-01', tickets: 14 },
        ]}
        series={[{ key: 'tickets', label: 'Tickets' }]}
        x={{ key: 'month', format: { style: 'date', granularity: 'month' } }}
        label="By month"
      />,
    )
    const ticks = [...container.querySelectorAll('[class*="xAxis"] span')].map(
      (span) => span.textContent,
    )
    // Monthly ticks for a monthly format, and never the same label twice.
    expect(ticks).toContain('Aug')
    expect(new Set(ticks).size).toBe(ticks.length)
  })

  it('adds the wash only in the area variant and sets data-variant', () => {
    const { container: plain } = render(
      <LineChart data={DAYS} series={PAIR} x={{ key: 'day', scale: 'time' }} label="Line" />,
    )
    expect(plain.querySelector('[class*="wash"]')).toBeNull()

    const { container: washed } = render(
      <LineChart
        data={DAYS}
        series={PAIR}
        x={{ key: 'day', scale: 'time' }}
        variant="area"
        label="Area"
      />,
    )
    expect(washed.querySelector('svg[data-variant]')?.getAttribute('data-variant')).toBe('area')
    expect(washed.querySelector('[class*="wash"]')).toBeTruthy()
  })

  it('draws markers only when asked', () => {
    const { container: bare } = render(
      <LineChart data={DAYS} series={PAIR} x={{ key: 'day', scale: 'time' }} label="Bare" />,
    )
    expect(bare.querySelectorAll('circle')).toHaveLength(0)

    const { container } = render(
      <LineChart
        data={DAYS}
        series={PAIR}
        x={{ key: 'day', scale: 'time' }}
        markers
        label="Marked"
      />,
    )
    expect(container.querySelectorAll('circle')).toHaveLength(6)
  })

  it('keeps the end label inside the plot when the endpoint is at its top edge', () => {
    // The last value is the top of the domain. The plot's svg cuts what is drawn above its top
    // edge, so a label above this endpoint would lose its digits.
    const { container } = render(
      <LineChart
        data={[
          { week: 'W29', minutes: 10 },
          { week: 'W30', minutes: 15 },
          { week: 'W31', minutes: 20 },
        ]}
        series={[{ key: 'minutes', label: 'Minutes' }]}
        x={{ key: 'week' }}
        label="First response"
      />,
    )
    const label = container.querySelector('text[class*="endLabel"]') as SVGTextElement
    const plot = (label.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const end = (lines(container)[0] as SVGPathElement).getBoundingClientRect()

    // The endpoint is at the plot's top edge, which is the case under test.
    expect(end.top - plot.top).toBeLessThan(4)
    expect(label.textContent).toBe('20')
    expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(plot.top - 1)
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(plot.bottom)
  })

  it('carries the same numbers into the table twin', async () => {
    render(<LineChart data={DAYS} series={PAIR} x={{ key: 'day', scale: 'time' }} label="Twin" />)
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    // Named, as BarChart's twin is: several charts on a page mean several
    // tables, and only the caption tells them apart.
    const table = screen.getByRole('table', { name: /Twin — data/ })
    expect(table.textContent).toContain('34')
    expect(table.textContent).toContain('30')
  })

  it('draws a step-after curve when asked and a monotone curve by default', () => {
    const { container: stepped } = render(
      <LineChart
        data={DAYS}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day', scale: 'time' }}
        curve="step"
        label="Stepped"
      />,
    )
    // `curveStepAfter` draws straight segments with no cubic curves, because a
    // measurement holds until the next one.
    const step = lines(stepped)[0]?.getAttribute('d') ?? ''
    expect(step).not.toContain('C')
    expect(step).toContain('L')

    const { container: plain } = render(
      <LineChart
        data={DAYS}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day', scale: 'time' }}
        label="Monotone"
      />,
    )
    expect(lines(plain)[0]?.getAttribute('d') ?? '').toContain('C')
  })

  it('draws every annotation kind through the shared layer', () => {
    const { container } = render(
      <LineChart
        data={DAYS}
        series={PAIR}
        x={{ key: 'day', scale: 'time' }}
        baseline={{ value: 30, label: 'SLA' }}
        annotations={[
          { kind: 'band', from: 26, to: 32, label: 'Healthy' },
          { kind: 'point', x: '2026-07-02', y: 34, label: 'Launch' },
        ]}
        label="Annotated"
      />,
    )
    // The wash under the marks and the ink in the baseline's slot: one band
    // rect, its two edges, the baseline's dashed rule, and the point's mark.
    expect(container.querySelector('[class*="span"]')).toBeTruthy()
    expect(container.querySelectorAll('[class*="edge"]').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('[class*="rule"]')).toBeTruthy()
    expect(container.querySelector('circle[class*="mark"]')).toBeTruthy()
    const texts = [...container.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toContain('SLA')
    expect(texts).toContain('Launch')
  })

  it('activates on click at the position the pointer is reading', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <LineChart
        data={DAYS}
        series={PAIR}
        x={{ key: 'day', scale: 'time' }}
        onSelect={onSelect}
        label="Clickable"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]).toHaveProperty('index')
    expect(onSelect.mock.calls[0]?.[0]).toHaveProperty('datum')
  })

  it('warns and draws no brush on a band x', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(
        <LineChart
          data={TEAMISH}
          series={[{ key: 'minutes', label: 'Minutes' }]}
          x={{ key: 'week' }}
          onBrushEnd={() => {}}
          label="Banded"
        />,
      )
      expect(warned.mock.calls.some(([message]) => String(message).includes('continuum'))).toBe(
        true,
      )
      const plot = container.querySelector('[tabindex="0"]') as HTMLElement
      plot.focus()
      await userEvent.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}')
      expect(container.querySelector('[class*="range"]')).toBeNull()
    } finally {
      warned.mockRestore()
    }
  })

  it('shares one reading across a sync group, and Escape clears it everywhere', async () => {
    const { container } = render(
      <div>
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time' }}
          syncId="pair"
          label="Sender"
        />
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time' }}
          syncId="pair"
          label="Receiver"
        />
      </div>,
    )
    const plots = [...container.querySelectorAll('[tabindex="0"]')] as HTMLElement[]
    expect(plots).toHaveLength(2)
    plots[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    // The broadcast is the x-domain value. The receiver maps it through its own
    // scale to its own crosshair.
    expect(container.querySelectorAll('[class*="crosshair"]')).toHaveLength(2)

    await userEvent.keyboard('{Escape}')
    // A group shares one reading, so a cleared reading clears everywhere.
    expect(container.querySelectorAll('[class*="crosshair"]')).toHaveLength(0)
  })

  it('hides a toggled-off series from the plot but not from the twin', async () => {
    const { container } = render(
      <LineChart data={DAYS} series={PAIR} x={{ key: 'day', scale: 'time' }} label="Isolated" />,
    )
    expect(lines(container)).toHaveLength(2)

    const key = screen.getByRole('button', { name: 'Opened' })
    await userEvent.click(key)
    // Hiding removes the series from the plot. The key becomes unpressed and
    // shows the hollow state.
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(lines(container)).toHaveLength(1)

    // The twin never hides data, because it always receives the unfiltered set.
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Isolated — data/ })
    expect(table.textContent).toContain('Opened')
    expect(table.textContent).toContain('28')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'LineChart', entries: states.entries, adapter: reactAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
lineChartReadingLaw({
  shell: 'React',
  mount: async (props) => render(<LineChart {...props} />),
})
