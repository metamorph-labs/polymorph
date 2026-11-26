import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { histogramReadingLaw } from '@polymorph/conformance/chart-reading'
import { assertGoverned, binSample } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { Histogram, type HistogramProps } from './Histogram'
import { states } from './histogram.states'

/**
 * Browser checks: the engine's bins draw as contiguous marks. The binning
 * arithmetic is tested in the engine's `charts/charts.test.ts`. The walk over
 * the bins and its keys are the law's (`@polymorph/conformance/chart-reading`),
 * which this file calls for React.
 */

beforeAll(installTestTheme)

/** A sample whose Sturges count is stable: n = 32 → ⌈log₂ 32⌉ + 1 = 6 target. */
const SAMPLE = Array.from({ length: 32 }, (_, index) => (index * 13) % 40)

const bars = (root: Element) => [...root.querySelectorAll('path[class*="bar"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<HistogramProps>(true)
  })
})

describe('Histogram', () => {
  it('draws one bar per occupied bin', () => {
    const { container } = render(<Histogram data={SAMPLE} label="Spread" />)
    const expected = binSample(SAMPLE).filter((bin) => bin.count > 0)
    expect(bars(container)).toHaveLength(expected.length)
    expect(screen.getAllByRole('img', { name: 'Spread' }).length).toBeGreaterThan(0)
  })

  it('lays bins contiguously, separated only by the 2px surface gap', () => {
    const { container } = render(<Histogram data={SAMPLE} label="Contiguous" />)
    const drawn = bars(container)
    expect(drawn.length).toBeGreaterThan(1)
    /*
     * Each bar starts where the previous one ends plus the 2px gap (a 1px inset
     * on each side of a shared edge). Read from the path geometry; the `d`
     * string starts at the bar's inline start.
     */
    const spans = drawn
      .map((bar) => {
        const box = (bar as SVGGraphicsElement).getBBox()
        return { from: box.x, to: box.x + box.width }
      })
      .sort((a, b) => a.from - b.from)
    for (let at = 1; at < spans.length; at += 1) {
      const gap = spans[at]!.from - spans[at - 1]!.to
      // Occupied neighbours sit 2px apart. An empty bin between them widens the
      // gap by whole bins, never by band padding.
      expect(gap).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('anchors the count axis at zero and warns off auto', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Histogram data={SAMPLE} y={{ domain: 'auto' }} label="Anchored" />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('counts'))
    warn.mockRestore()
  })

  it('keeps the range and count twin when the tooltip is off', async () => {
    render(<Histogram data={SAMPLE} tooltip={false} label="Print" />)
    await userEvent.click(screen.getByRole('button', { name: 'Show the data table for Print' }))
    const table = screen.getByRole('table', { name: 'Print — data' })
    const first = binSample(SAMPLE)[0]!
    expect(table.textContent).toContain(`${first.from}–${first.to}`)
  })

  it('renders the empty state for an empty sample', () => {
    const { container } = render(<Histogram data={[]} label="Empty" />)
    expect(container.querySelector("[data-state='empty']")).not.toBeNull()
    expect(container.textContent).toContain('No data yet')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'Histogram', entries: states.entries, adapter: reactAdapter })

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
histogramReadingLaw({
  shell: 'React',
  mount: async (props) => render(<Histogram {...props} />),
})
