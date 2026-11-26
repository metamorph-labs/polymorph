import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  assertGoverned,
  type ChartDatum,
  type ChartSeries,
  type ResolvedTheme,
} from '@polymorph/react'
import { radarChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'
import { RadarChart, type RadarChartProps } from './RadarChart'

/**
 * Browser checks: the rings draw as polygons, and a gap breaks the profile
 * instead of dropping it to zero. The polar arithmetic is tested in the
 * engine's `charts/charts.test.ts`. The vertex walk around the polygon and its
 * keys are the law's (`@polymorph/conformance/chart-reading`), which this file
 * calls for React.
 */

let theme: ResolvedTheme

beforeAll(() => {
  theme = installTestTheme()
})

const AXES = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'coverage', label: 'Coverage' },
]

const ROWS: ChartDatum[] = [
  { agent: 4.5, team: 3.8 },
  { agent: 3.2, team: 3.6 },
  { agent: 4.8, team: 4.1 },
  { agent: 2.9, team: 3.4 },
  { agent: 3.9, team: 3.7 },
]

const PAIR: ChartSeries[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'team', label: 'Team' },
]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RadarChartProps>(true)
  })
})

describe('RadarChart', () => {
  it('draws rings as polygons through the spokes, never circles', () => {
    const { container } = render(<RadarChart axes={AXES} data={ROWS} series={PAIR} label="Rings" />)
    const grid = container.querySelector('g[class*="grid"]') as SVGElement
    // No circle in the grid: a circle implies values between axes, and there
    // are none.
    expect(grid.querySelectorAll('circle')).toHaveLength(0)
    const rings = [...grid.querySelectorAll('path')].filter((path) =>
      (path.getAttribute('d') ?? '').endsWith('Z'),
    )
    // About 4 concentric rings from the tick logic, each a closed polygon of
    // straight segments. Five axes give five `L` or `M` joints per ring.
    expect(rings.length).toBeGreaterThanOrEqual(3)
    for (const ring of rings) {
      expect(ring.getAttribute('d')).toContain('L')
      expect(ring.getAttribute('d')).not.toContain('A')
    }
  })

  it('draws one profile per series, with a vertex marker at every measured axis', () => {
    const { container } = render(
      <RadarChart axes={AXES} data={ROWS} series={PAIR} label="Profiles" />,
    )
    const profiles = container.querySelectorAll('g[class*="profiles"] > g')
    expect(profiles).toHaveLength(2)
    expect(container.querySelectorAll('circle[class*="vertex"]')).toHaveLength(10)
  })

  it('breaks the polygon at a null vertex instead of dropping to zero', () => {
    const gapped = ROWS.map((row, index) => (index === 2 ? { agent: null, team: 3 } : row))
    const { container } = render(<RadarChart axes={AXES} data={gapped} series={PAIR} label="Gap" />)
    // One vertex fewer than the full grid, because the unmeasured axis draws
    // nothing.
    expect(container.querySelectorAll('circle[class*="vertex"]')).toHaveLength(9)
    const agent = container.querySelector('g[class*="profiles"] > g path[class*="stroke"]')
    // The gapped profile is drawn as separate runs (more than one `M`), not as
    // one closed ring through an invented zero.
    const d = agent?.getAttribute('d') ?? ''
    expect((d.match(/M/g) ?? []).length).toBeGreaterThan(1)
  })

  it('dev-warns above the palette’s cap and names the token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const over = theme.chartCap + 1
    const series: ChartSeries[] = Array.from({ length: over }, (_, index) => ({
      key: `t${index}`,
      label: `Team ${index + 1}`,
    }))
    const rows: ChartDatum[] = AXES.map(() =>
      Object.fromEntries(series.map((entry) => [entry.key, 3])),
    )
    render(<RadarChart axes={AXES} data={rows} series={series} label="Capped" />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--pm-chart-cap'))
    warn.mockRestore()
  })

  it('warns on fewer than three axes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <RadarChart axes={AXES.slice(0, 2)} data={ROWS.slice(0, 2)} series={PAIR} label="Dumbbell" />,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dumbbell'))
    warn.mockRestore()
  })

  it('renders an axes × series table as the twin', async () => {
    render(<RadarChart axes={AXES} data={ROWS} series={PAIR} label="Twin" />)
    await userEvent.click(screen.getByRole('button', { name: 'Show the data table for Twin' }))
    const table = screen.getByRole('table', { name: 'Twin — data' })
    // One row per axis, one column per series.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5)
    expect(table.textContent).toContain('Escalation')
    expect(table.textContent).toContain('4.5')
  })
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
radarChartReadingLaw({
  shell: 'React',
  mount: async (props) => render(<RadarChart {...props} />),
})
