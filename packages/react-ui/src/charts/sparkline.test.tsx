import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { Sparkline, type SparklineProps } from './Sparkline'
import { states } from './sparkline.states'

/**
 * Runs in a real browser for the geometry, and for the spec's claim that the
 * box stays 4:1. That ratio keeps the end dot round, because a non-uniform
 * `viewBox` scale would turn it into an ellipse.
 */

beforeAll(installTestTheme)

const TREND = [42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SparklineProps>(true)
  })
})

describe('Sparkline', () => {
  it('is a named image with the svg hidden from assistive technology', () => {
    render(<Sparkline data={TREND} label="First response, trending down" />)
    const glyph = screen.getByRole('img', { name: 'First response, trending down' })
    // The svg has no separate name, so a screen reader meets one image with one
    // label.
    expect(glyph.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws one stroke through every point, and a dot on the last', () => {
    const { container } = render(<Sparkline data={[1, 5, 3]} label="Three points" />)
    const path = container.querySelector('path') as SVGPathElement
    // One `M`: the series has no gaps, so it is one continuous stroke.
    expect(path.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('puts the end dot on the last point', () => {
    const { container } = render(<Sparkline data={[10, 2]} label="Down" />)
    const dot = container.querySelector('circle') as SVGCircleElement
    // The series falls, so the last point is the low one and the dot sits below
    // the midpoint of the drawing space.
    expect(Number(dot.getAttribute('cy'))).toBeGreaterThan(12.5)
  })

  it('renders nothing for fewer than two points', () => {
    const { container: empty } = render(<Sparkline data={[]} label="None" />)
    expect(empty.firstElementChild).toBeNull()
    const { container: one } = render(<Sparkline data={[7]} label="One" />)
    expect(one.firstElementChild).toBeNull()
  })

  it('draws a flat series as a level line at the bottom rather than dividing by zero', () => {
    const { container } = render(<Sparkline data={[5, 5, 5]} label="Flat" />)
    const path = container.querySelector('path') as SVGPathElement
    expect(path.getAttribute('d')).not.toContain('NaN')
  })

  it('opens a gap at a point that is not a number, and scales by the rest', () => {
    // A NaN passed to min/max would make every y in the path NaN. It is drawn
    // as a gap instead, and the scale reads only the finite values.
    const { container } = render(<Sparkline data={[4, Number.NaN, 6, 5]} label="Gappy" />)
    const d = (container.querySelector('path') as SVGPathElement).getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d).not.toContain('NaN')
  })

  it('renders nothing when fewer than two points are real numbers', () => {
    // This is the too-few-points case in a longer array. A trend needs two
    // finite points.
    const { container } = render(
      <Sparkline data={[Number.NaN, Number.POSITIVE_INFINITY, 7]} label="Noise" />,
    )
    expect(container.firstElementChild).toBeNull()
  })

  it('keeps the box 4:1 at both sizes so the dot stays round', () => {
    // The drawing is `viewBox`-scaled, which this member may do because it has
    // no text to distort. The scale is uniform only while the box's ratio
    // matches the viewBox's: a 4:1 box on a 100×25 grid.
    for (const size of ['sm', 'md'] as const) {
      const { container } = render(<Sparkline data={TREND} label="Trend" size={size} />)
      const box = (container.firstElementChild as HTMLElement).getBoundingClientRect()
      expect(box.width / box.height, size).toBeCloseTo(4, 1)
    }
  })

  it('sizes itself from the icon and control scales', () => {
    const { container: small } = render(<Sparkline data={TREND} label="sm" />)
    const { container: medium } = render(<Sparkline data={TREND} label="md" size="md" />)
    const heightOf = (root: Element) =>
      (root.firstElementChild as HTMLElement).getBoundingClientRect().height
    expect(heightOf(medium)).toBeGreaterThan(heightOf(small))
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'Sparkline', entries: states.entries, adapter: reactAdapter })
