import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  assertGoverned,
  type ChartDatum,
  type ChartSeries,
  type ResolvedTheme,
} from '@polymorph/react'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { ScatterChart, type ScatterChartProps } from './ScatterChart'
import { states } from './scatter-chart.states'

/**
 * Browser checks: observations land where their two measures put them, bubble
 * radii stay within the sqrt scale's mark-spec bounds, and the per-mark reading
 * works without a pointer. The scan and scale arithmetic is tested in
 * the engine's `charts/charts.test.ts`.
 */

let theme: ResolvedTheme

beforeAll(() => {
  theme = installTestTheme()
})

const ROWS: ChartDatum[] = [
  { minutes: 2, csat: 4.8 },
  { minutes: 6, csat: 4.1 },
  { minutes: 11, csat: 3.4 },
  { minutes: 14, csat: 3.1 },
]

const ONE: ChartSeries[] = [{ key: 'csat', label: 'CSAT' }]

const dots = (root: Element) => [...root.querySelectorAll('circle[class*="dot"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ScatterChartProps>(true)
  })
})

describe('ScatterChart', () => {
  it('draws one mark per placeable observation and has an accessible name', () => {
    const { container } = render(
      <ScatterChart data={ROWS} series={ONE} x={{ key: 'minutes' }} label="Correlation" />,
    )
    expect(dots(container)).toHaveLength(4)
    expect(screen.getAllByRole('img', { name: 'Correlation' }).length).toBeGreaterThan(0)
  })

  it('renders no mark for a row with a null x, y or bubble value', () => {
    const { container } = render(
      <ScatterChart
        data={[
          { minutes: 2, csat: 4.8, tickets: 40 },
          { minutes: null, csat: 4.1, tickets: 40 },
          { minutes: 9, csat: null, tickets: 40 },
          { minutes: 12, csat: 3.3, tickets: null },
        ]}
        series={ONE}
        x={{ key: 'minutes' }}
        bubble={{ key: 'tickets' }}
        label="Gaps"
      />,
    )
    // The same gap rule applies to all three columns, so only the complete row
    // draws.
    expect(dots(container)).toHaveLength(1)
  })

  it('sizes bubbles by area between the 8px and 24px diameters', () => {
    const { container } = render(
      <ScatterChart
        data={[
          { minutes: 2, csat: 4.8, tickets: 10 },
          { minutes: 6, csat: 4.1, tickets: 100 },
          { minutes: 11, csat: 3.4, tickets: 47 },
        ]}
        series={ONE}
        x={{ key: 'minutes' }}
        bubble={{ key: 'tickets', label: 'Tickets handled' }}
        label="Bubbles"
      />,
    )
    const radii = dots(container).map((dot) => Number(dot.getAttribute('r')))
    // The extremes land on the bounds and the rest fall between them.
    expect(Math.min(...radii)).toBe(4)
    expect(Math.max(...radii)).toBe(12)
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(4)
      expect(r).toBeLessThanOrEqual(12)
    }
  })

  it('keeps the label of a band at the top of the domain inside the plot', () => {
    // The band's top edge is the plot's top edge. The plot's svg cuts what is drawn above it,
    // so a label above the band would lose its text.
    const { container } = render(
      <ScatterChart
        data={ROWS}
        series={ONE}
        x={{ key: 'minutes' }}
        annotations={[{ kind: 'band', from: 4.5, to: 5, label: 'CSAT target' }]}
        label="Correlation"
      />,
    )
    const label = [...container.querySelectorAll('text')].find(
      (text) => text.textContent === 'CSAT target',
    ) as SVGTextElement
    const plot = (label.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const band = (container.querySelector('rect') as SVGRectElement).getBoundingClientRect()

    // The band starts at the plot's top edge, which is the case under test.
    expect(band.top - plot.top).toBeLessThan(1)
    expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(plot.top - 1)
    // Inside the band, under its top edge.
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(band.bottom)
  })

  it('draws a zero rule per axis only when zero is inside that domain', () => {
    const { container } = render(
      <ScatterChart
        data={[
          { delta: -4, csat: 3.2 },
          { delta: 5, csat: 4.6 },
        ]}
        series={ONE}
        x={{ key: 'delta' }}
        label="Signed x"
      />,
    )
    // x spans zero and y (3.2–4.6, auto) does not, so there is one zero rule.
    expect(container.querySelectorAll('path[class*="zero"]')).toHaveLength(1)
  })

  it('walks rows with Left/Right and series with Up/Down, announcing x, y: series', async () => {
    const { container } = render(
      <ScatterChart
        data={[
          { minutes: 2, triage: 4.8, escalations: 4.2 },
          { minutes: 6, triage: 4.1, escalations: 3.8 },
        ]}
        series={[
          { key: 'triage', label: 'Triage' },
          { key: 'escalations', label: 'Escalations' },
        ]}
        x={{ key: 'minutes' }}
        label="Walk"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()

    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe('2, 4.8: Triage')

    // Up/Down switch series at the same row.
    await userEvent.keyboard('{ArrowDown}')
    expect(live.textContent).toBe('2, 4.2: Escalations')
  })

  it('reports row index, series key and row on Enter', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <ScatterChart
        data={ROWS}
        series={ONE}
        x={{ key: 'minutes' }}
        onSelect={onSelect}
        label="Select"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ index: 1, key: 'csat', datum: ROWS[1] })
  })

  it('dev-warns above the palette’s cap and names the token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const over = theme.chartCap + 1
    const series: ChartSeries[] = Array.from({ length: over }, (_, index) => ({
      key: `team${index}`,
      label: `Team ${index + 1}`,
    }))
    const row: ChartDatum = {
      minutes: 4,
      ...Object.fromEntries(series.map((entry) => [entry.key, 4])),
    }
    render(<ScatterChart data={[row]} series={series} x={{ key: 'minutes' }} label="Capped" />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--pm-chart-cap'))
    // The plot still draws every series; the warning does not hide data.
    warn.mockRestore()
  })

  it('keeps the twin with x, y and bubble columns when the tooltip is off', async () => {
    render(
      <ScatterChart
        data={[{ minutes: 2, csat: 4.8, tickets: 40 }]}
        series={ONE}
        x={{ key: 'minutes', label: 'Minutes' }}
        bubble={{ key: 'tickets', label: 'Tickets handled' }}
        tooltip={false}
        label="Print"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show the data table for Print' }))
    const table = screen.getByRole('table', { name: 'Print — data' })
    expect(table.textContent).toContain('Tickets handled')
    expect(table.textContent).toContain('40')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'React',
  member: 'ScatterChart',
  entries: states.entries,
  adapter: reactAdapter,
})
