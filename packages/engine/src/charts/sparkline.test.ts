import { describe, expect, it } from 'vitest'

import { sparklineGeometry } from './sparkline'

/**
 * Sparkline's drawing, as data. The members' tests check what each framework
 * renders from it.
 */

describe('sparklineGeometry', () => {
  it('draws one stroke through every point, and a dot on the last', () => {
    const drawing = sparklineGeometry([1, 5, 3])
    expect(drawing?.d.match(/M/g)).toHaveLength(1)
    expect(drawing?.end).not.toBeNull()
  })

  it('puts the end dot on the last point, below the middle for a fall', () => {
    expect(sparklineGeometry([10, 2])?.end?.y).toBeGreaterThan(12.5)
  })

  it('has no drawing for fewer than two finite points', () => {
    expect(sparklineGeometry([])).toBeNull()
    expect(sparklineGeometry([7])).toBeNull()
    expect(sparklineGeometry([Number.NaN, Number.POSITIVE_INFINITY, 7])).toBeNull()
  })

  it('draws a flat series as a level line rather than dividing by zero', () => {
    const drawing = sparklineGeometry([5, 5, 5])
    expect(drawing?.d).not.toContain('NaN')
    expect(drawing?.d).toMatch(/^M4,21/)
    expect(drawing?.end?.y).toBe(21)
  })

  it('opens a gap at a point that is not a number, and scales by the rest', () => {
    const drawing = sparklineGeometry([4, Number.NaN, 6, 5])
    expect(drawing?.d.match(/M/g)).toHaveLength(2)
    expect(drawing?.d).not.toContain('NaN')
  })

  it('has no end dot when the last value is a gap', () => {
    expect(sparklineGeometry([4, 6, Number.NaN])?.end).toBeNull()
  })
})
