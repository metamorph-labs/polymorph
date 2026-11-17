import { describe, expect, it } from 'vitest'

import { exampleQuietTheme } from './examples'
import {
  CHROMA_BUDGET_PEAK,
  CHROMA_BUDGETS,
  hasGradient,
  MAX_NEUTRAL_TINT,
  seedsSchema,
  STATUS_CHROMA_FLOOR,
  statusPeakOf,
} from './seeds'

const seeds = exampleQuietTheme.seeds

describe('seeds', () => {
  it('accepts the full hue circle', () => {
    for (const accentHue of [0, 90, 180, 270, 360]) {
      expect(seedsSchema.safeParse({ ...seeds, accentHue }).success).toBe(true)
    }
  })

  it('rejects hues off the circle', () => {
    expect(seedsSchema.safeParse({ ...seeds, accentHue: -1 }).success).toBe(false)
    expect(seedsSchema.safeParse({ ...seeds, accentHue: 361 }).success).toBe(false)
  })

  it('caps the neutral tint so neutrals stay neutral', () => {
    expect(seedsSchema.safeParse({ ...seeds, neutralTint: MAX_NEUTRAL_TINT }).success).toBe(true)
    expect(seedsSchema.safeParse({ ...seeds, neutralTint: MAX_NEUTRAL_TINT + 0.001 }).success).toBe(
      false,
    )
    expect(seedsSchema.safeParse({ ...seeds, neutralTint: -0.001 }).success).toBe(false)
  })

  it('requires all three font roles', () => {
    expect(
      seedsSchema.safeParse({ ...seeds, fonts: { body: 'Inter', display: 'Inter' } }).success,
    ).toBe(false)
  })

  it('orders chroma budgets monotonically', () => {
    // The enum's order is the chroma scale: none < ink < low < medium < high.
    const peaks = CHROMA_BUDGETS.map((b) => CHROMA_BUDGET_PEAK[b])
    expect(peaks).toEqual([...peaks].sort((a, b) => a - b))
    expect(new Set(peaks).size).toBe(peaks.length)
    expect(CHROMA_BUDGET_PEAK.none).toBe(0)
  })

  it('floors status chroma at `low` even when the accent has none at all', () => {
    // The status floor at its limit: `none` applies to the accent only, and a
    // grey warning would be broken.
    for (const chromaBudget of CHROMA_BUDGETS) {
      expect(statusPeakOf({ ...seeds, chromaBudget }), chromaBudget).toBeGreaterThanOrEqual(
        STATUS_CHROMA_FLOOR,
      )
    }
    expect(statusPeakOf({ ...seeds, chromaBudget: 'none' })).toBe(STATUS_CHROMA_FLOOR)
  })

  it('refuses a gradient partner under the ink budget, seeded or not', () => {
    // Two stops at peak 0 are the same grey: bytes for a solid. `hasGradient`
    // is the one definition, used by the derivation and the laws.
    expect(hasGradient({ ...seeds, chromaBudget: 'none', gradientHue: 200 })).toBe(false)
    expect(hasGradient({ ...seeds, chromaBudget: 'medium', gradientHue: 200 })).toBe(true)
    expect(hasGradient({ ...seeds, chromaBudget: 'medium', gradientHue: undefined })).toBe(false)
  })
})
