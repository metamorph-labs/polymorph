import { describe, expect, it } from 'vitest'

import { areaPath, linePath, ringArcs } from './paths'

/**
 * The mark paths, over `d3-shape`. Pure functions over points, so the
 * assertions read the `d` strings. The chart members' tests check what is
 * drawn with them.
 */

describe('the step curve holds each value until the next point', () => {
  it('uses curveStepAfter, moving horizontally before vertically', () => {
    const d = linePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      'step',
    )
    // `curveStepAfter` holds y=0 out to x=10, then drops to y=10. The
    // horizontal segment comes first, as `line-chart.md` specifies.
    expect(d).toContain('L10,0')
    expect(d).toContain('L10,10')
    expect(d).not.toContain('L0,10')
    expect(d).not.toContain('C')
  })

  it('uses monotone as the default curve', () => {
    const d = linePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ])
    expect(d).toContain('C')
  })
})

describe('a missing point is a gap, not a zero', () => {
  it('breaks the line at a gap and starts a new segment after it', () => {
    const d = linePath(
      [{ x: 0, y: 0 }, { x: 10, y: 5 }, null, { x: 30, y: 5 }, { x: 40, y: 0 }],
      'linear',
    )
    expect(d.match(/M/g)).toHaveLength(2)
  })

  it('breaks the wash under it at the same gap', () => {
    const d = areaPath(
      [{ x: 0, y: 0 }, { x: 10, y: 5 }, null, { x: 30, y: 5 }, { x: 40, y: 0 }],
      20,
      'linear',
    )
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.match(/Z/g)).toHaveLength(2)
  })
})

describe('the ring keeps every segment in place', () => {
  it('returns one arc per segment, and draws nothing for a zero share', () => {
    const arcs = ringArcs(
      [
        { key: 'a', share: 0.75 },
        { key: 'b', share: 0 },
        { key: 'c', share: 0.25 },
      ],
      { outerRadius: 50, thickness: 10, gapPx: 2, cornerRadius: 2, minHitPx: 24 },
    )
    expect(arcs.map((arc) => arc.key)).toEqual(['a', 'b', 'c'])
    expect(arcs[1]).toMatchObject({ d: '', hit: '' })
    expect(arcs[0]?.d).not.toBe('')
    // Clockwise from 12 o'clock: the last segment's middle is seven eighths of the way round.
    expect(arcs[2]?.midAngle).toBeCloseTo(Math.PI * 2 * 0.875)
  })
})
