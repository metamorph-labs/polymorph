import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { assertGoverned, type ChartDatum } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { Heatmap, type HeatmapProps } from './Heatmap'
import { states } from './heatmap.states'

/**
 * Browser checks: a cell's colour is one of the seven emitted steps, never a
 * value between two of them; an absent measurement shows the surface, not the
 * lightest step; and the grid can be walked on both axes.
 */

beforeAll(installTestTheme)

const GRID: ChartDatum[] = ['Mon', 'Tue', 'Wed'].flatMap((day, row) =>
  ['08–12', '12–16', '16–20'].map((band, column) => ({
    band,
    day,
    tickets: 10 * (row + 1) + column,
  })),
)

const cells = (root: Element) => [...root.querySelectorAll('rect[class*="cell"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<HeatmapProps>(true)
  })
})

describe('Heatmap', () => {
  it('draws one cell per measurement', () => {
    const { container } = render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Volume"
      />,
    )
    expect(cells(container)).toHaveLength(9)
  })

  it('quantizes to the emitted steps instead of interpolating between them', () => {
    const { container } = render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Steps"
      />,
    )
    const paints = cells(container).map((cell) => cell.getAttribute('style') ?? '')
    // Every fill is a token *reference* to one of the seven, never a colour and
    // never a mix of two that the palette laws have not checked.
    for (const paint of paints) {
      expect(paint).toMatch(/--pm-chart-cell:\s*var\(--pm-chart-seq-[1-7]\)/)
    }
    // The extremes land on the ends of the ramp.
    expect(paints[0]).toContain('--pm-chart-seq-1')
    expect(paints.at(-1)).toContain('--pm-chart-seq-7')
  })

  it('shows an absent measurement as surface, never as the lightest step', () => {
    const { container } = render(
      <Heatmap
        data={GRID.map((row, index) => (index === 4 ? { ...row, tickets: null } : row))}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Sparse"
      />,
    )
    // Eight cells for nine positions: the ninth draws nothing.
    expect(cells(container)).toHaveLength(8)
  })

  it('walks x with Left/Right and y with Up/Down', async () => {
    const { container } = render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Keyboard"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()

    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    // A cursor left over a cell would set the reading position, and the first
    // arrow would step from there. `test-setup.ts` moves the cursor away; this
    // assertion names the failure if that stops working.
    expect(live.textContent, 'a resting pointer had already set the position').toBe('')

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe('08–12, Mon: 10')

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toBe('12–16, Mon: 11')

    await userEvent.keyboard('{ArrowDown}')
    expect(live.textContent).toBe('12–16, Tue: 21')
  })

  it('replaces the series legend with the ramp and its bounds', () => {
    const { container } = render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Legend"
      />,
    )
    // Seven swatches, because the ramp has seven steps. A gradient strip would
    // suggest a precision the quantised cells do not have.
    expect(container.querySelectorAll('[class*="step"]')).toHaveLength(7)
    const bounds = [...container.querySelectorAll('[class*="bound"]')].map(
      (node) => node.textContent,
    )
    expect(bounds).toEqual(['10', '32'])
  })

  it('shows no ramp when nothing was measured', () => {
    // A grid whose every value is `null` has cells but no extent, and a legend
    // reading 0 to 1 over it would show a range that was never measured.
    const { container } = render(
      <Heatmap
        data={GRID.map((row) => ({ ...row, tickets: null }))}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Unmeasured"
      />,
    )
    expect(cells(container)).toHaveLength(0)
    expect(container.querySelectorAll('[class*="step"]')).toHaveLength(0)
  })

  it('lays out the twin as the same grid, with a row per y and a column per x', async () => {
    render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day', label: 'Day' }}
        value={{ key: 'tickets' }}
        label="Twin"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Twin — data/ })
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.querySelectorAll('thead th')).toHaveLength(4)
    expect(table.textContent).toContain('32')
  })

  it('reports the read cell through onSelect, and nothing for an absent cell', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <Heatmap
        data={[
          { band: '08–12', day: 'Mon', tickets: 10 },
          { band: '12–16', day: 'Mon', tickets: null },
        ]}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        onSelect={onSelect}
        label="Selectable"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ x: '08–12', y: 'Mon', value: 10 })
    // The absent cell has no number to report.
    await userEvent.keyboard('{ArrowRight} ')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Enter or Space selects')
  })
})

describe('Heatmap diverging colours on signed data', () => {
  /** Signed deltas with one exact zero, which takes the mid colour. */
  const SIGNED: ChartDatum[] = [
    { shift: 'Morning', day: 'Mon', delta: -6 },
    { shift: 'Midday', day: 'Mon', delta: 8 },
    { shift: 'Evening', day: 'Mon', delta: 0 },
    { shift: 'Morning', day: 'Tue', delta: -1 },
    { shift: 'Midday', day: 'Tue', delta: 1 },
    { shift: 'Evening', day: 'Tue', delta: 3 },
  ]

  const paintOf = (cell: Element) => (cell as SVGElement).style.getPropertyValue('--pm-chart-cell')

  it('bins the arms symmetrically and uses the mid colour only at exactly zero', () => {
    const { container } = render(
      <Heatmap
        data={SIGNED}
        x={{ key: 'shift' }}
        y={{ key: 'day' }}
        value={{ key: 'delta' }}
        label="Staffing delta"
      />,
    )
    const paints = cells(container).map(paintOf)
    // The range is [-8, +8], A = max(|lo|, |hi|). -6 reaches arm 3 by magnitude
    // bin (6/8 of the way out), +8 is the extreme, and only zero takes the mid.
    expect(paints).toContain('var(--pm-chart-neg-3)')
    expect(paints).toContain('var(--pm-chart-pos-3)')
    expect(paints.filter((paint) => paint === 'var(--pm-chart-mid)')).toHaveLength(1)
    // A near-zero value takes arm 1 on its own side, never the mid.
    expect(paints).toContain('var(--pm-chart-neg-1)')
    expect(paints).toContain('var(--pm-chart-pos-1)')
    // Nothing sequential on a signed grid.
    expect(paints.some((paint) => paint.includes('seq'))).toBe(false)
  })

  it('switches the scale legend to its diverging variant with min, zero and max', () => {
    const { container } = render(
      <Heatmap
        data={SIGNED}
        x={{ key: 'shift' }}
        y={{ key: 'day' }}
        value={{ key: 'delta' }}
        label="Legend"
      />,
    )
    const legend = container.querySelector('[data-variant="diverging"]') as HTMLElement
    expect(legend).not.toBeNull()
    // The bounds come from the symmetric range, not the data's raw extent: three
    // labels in the row under the band. The wrapper's class also contains
    // "bound", so the query selects its children.
    const bounds = [...legend.querySelectorAll('[class*="bounds"] > span')].map(
      (bound) => bound.textContent,
    )
    expect(bounds).toEqual(['-8', '0', '8'])
    // Two arm strips plus the mid: seven swatches in the band.
    expect(legend.querySelectorAll('[class*="step"]')).toHaveLength(7)
  })

  it('keeps the sequential strip for unsigned data', () => {
    const { container } = render(
      <Heatmap
        data={GRID}
        x={{ key: 'band' }}
        y={{ key: 'day' }}
        value={{ key: 'tickets' }}
        label="Unsigned"
      />,
    )
    expect(container.querySelector('[data-variant="diverging"]')).toBeNull()
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'Heatmap', entries: states.entries, adapter: reactAdapter })
