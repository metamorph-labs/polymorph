import { describe, expect, it } from 'vitest'

import { AXIS_NAMES, AXIS_VALUES, axesSchema, axisDivergence } from './axes'
import { exampleQuietTheme, exampleStarkTheme } from './examples'

describe('axes', () => {
  it('enumerates exactly the eight axes of the parameter space', () => {
    expect(AXIS_NAMES).toHaveLength(8)
    expect(Object.keys(axesSchema.shape).sort()).toEqual([...AXIS_NAMES].sort())
  })

  it('exposes every legal value per axis', () => {
    for (const axis of AXIS_NAMES) {
      expect(AXIS_VALUES[axis].length).toBeGreaterThan(1)
      for (const value of AXIS_VALUES[axis]) {
        expect(axesSchema.shape[axis].safeParse(value).success).toBe(true)
      }
    }
  })

  it('rejects an unknown axis value', () => {
    const result = axesSchema.safeParse({ ...exampleQuietTheme.axes, geometry: 'bevelled' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown axis, because a theme assigns exactly the eight axes', () => {
    const result = axesSchema.safeParse({ ...exampleQuietTheme.axes, vibe: 'cosy' })
    expect(result.success).toBe(false)
  })

  it('rejects a partial assignment', () => {
    const { geometry: _dropped, ...partial } = exampleQuietTheme.axes
    expect(axesSchema.safeParse(partial).success).toBe(false)
  })

  it('measures divergence between two assignments', () => {
    expect(axisDivergence(exampleQuietTheme.axes, exampleQuietTheme.axes)).toBe(0)
    // The two fixtures differ on every axis on purpose.
    expect(axisDivergence(exampleQuietTheme.axes, exampleStarkTheme.axes)).toBe(8)
  })
})
