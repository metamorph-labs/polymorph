import { inGamut } from 'culori'
import { describe, expect, it } from 'vitest'

import { MODES } from '../theme'
import {
  CHROMA_CURVE,
  generateNeutralRamp,
  generateRamp,
  LIGHTNESS_LADDER,
  NEUTRAL_CHROMA_CURVE,
  RAMP_LENGTH,
  RAMP_SEMANTICS,
  RAMP_STEPS,
  shiftStep,
  toCssColor,
  toHex,
} from './ramp'

const inSrgb = inGamut('rgb')

describe('lightness ladders', () => {
  it('is monotonic in both modes: the exact values are tuned, the order is required', () => {
    const light = LIGHTNESS_LADDER.light
    const dark = LIGHTNESS_LADDER.dark
    for (let i = 1; i < RAMP_LENGTH; i += 1) {
      expect(light[i], `light step ${i + 1}`).toBeLessThan(light[i - 1] ?? 0)
      expect(dark[i], `dark step ${i + 1}`).toBeGreaterThan(dark[i - 1] ?? 0)
    }
  })

  it('has one lightness per step in both modes', () => {
    for (const mode of MODES) {
      expect(LIGHTNESS_LADDER[mode]).toHaveLength(RAMP_LENGTH)
    }
  })

  it('starts light in light mode and dark in dark mode', () => {
    expect(LIGHTNESS_LADDER.light[0]).toBeGreaterThan(0.9)
    expect(LIGHTNESS_LADDER.dark[0]).toBeLessThan(0.2)
  })
})

describe('chroma curve', () => {
  it('peaks at the solid-fill steps and tapers to both ends', () => {
    const peak = Math.max(...CHROMA_CURVE)
    expect(CHROMA_CURVE[8]).toBe(peak)
    expect(CHROMA_CURVE[9]).toBe(peak)
    expect(CHROMA_CURVE[0]).toBeLessThan(peak / 2)
    expect(CHROMA_CURVE[11]).toBeLessThan(peak)
  })

  it('keeps the neutral curve near-flat, so neutrals stay one family', () => {
    const mid = NEUTRAL_CHROMA_CURVE.slice(3, 10)
    expect(Math.min(...mid)).toBeGreaterThanOrEqual(0.9)
    expect(NEUTRAL_CHROMA_CURVE).toHaveLength(RAMP_LENGTH)
  })
})

describe('generateRamp', () => {
  it('names all twelve steps', () => {
    expect(RAMP_STEPS).toHaveLength(RAMP_LENGTH)
    expect(Object.keys(RAMP_SEMANTICS)).toHaveLength(RAMP_LENGTH)
  })

  it('keeps every step inside the sRGB gamut, at every hue and budget', () => {
    for (const mode of MODES) {
      for (let hue = 0; hue < 360; hue += 15) {
        for (const peak of [0.09, 0.15, 0.21]) {
          const ramp = generateRamp(hue, peak, mode)
          for (const step of RAMP_STEPS) {
            expect(inSrgb({ mode: 'oklch', ...ramp[step] }), `hue ${hue} step ${step}`).toBe(true)
          }
        }
      }
    }
  })

  it('follows the ladder monotonically after gamut mapping', () => {
    for (const mode of MODES) {
      const ramp = generateRamp(210, 0.15, mode)
      for (let i = 1; i < RAMP_LENGTH; i += 1) {
        const previous = ramp[RAMP_STEPS[i - 1] ?? 1].l
        const current = ramp[RAMP_STEPS[i] ?? 12].l
        if (mode === 'light') expect(current).toBeLessThan(previous)
        else expect(current).toBeGreaterThan(previous)
      }
    }
  })

  it('is deterministic: the same input gives the same hex', () => {
    expect(toHex(generateRamp(255, 0.15, 'light')[9])).toBe(
      toHex(generateRamp(255, 0.15, 'light')[9]),
    )
  })

  it('normalises hue so a tenant can hand us 720 or -30', () => {
    expect(toHex(generateRamp(390, 0.15, 'light')[9])).toBe(
      toHex(generateRamp(30, 0.15, 'light')[9]),
    )
    expect(toHex(generateRamp(-30, 0.15, 'light')[9])).toBe(
      toHex(generateRamp(330, 0.15, 'light')[9]),
    )
  })

  it('scales chroma with the budget', () => {
    const low = generateRamp(255, 0.09, 'light')[9]
    const high = generateRamp(255, 0.21, 'light')[9]
    expect(high.c).toBeGreaterThan(low.c)
  })

  it('makes a neutral ramp that is nearly grey', () => {
    const ramp = generateNeutralRamp(255, 0.008, 'light')
    for (const step of RAMP_STEPS) {
      expect(ramp[step].c).toBeLessThanOrEqual(0.008)
    }
  })
})

describe('css emission', () => {
  it('emits opaque colours as hex, so the audited value is the drawn value', () => {
    expect(toCssColor({ l: 0.5, c: 0, h: 0 })).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('emits alpha as modern rgb()', () => {
    expect(toCssColor({ l: 0.2, c: 0, h: 0 }, 0.4)).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.4\)$/)
  })
})

describe('shiftStep', () => {
  it('saturates at both ends instead of wrapping', () => {
    expect(shiftStep(1, -3)).toBe(1)
    expect(shiftStep(12, 3)).toBe(12)
    expect(shiftStep(7, 1)).toBe(8)
    expect(shiftStep(7, -1)).toBe(6)
    expect(shiftStep(7, 0)).toBe(7)
  })
})
