import { describe, expect, it } from 'vitest'

import { apcaLc, composite, contrast, contrastDirection, deltaL } from './contrast'
import type { Oklch } from './ramp'

const white: Oklch = { l: 1, c: 0, h: 0 }
const black: Oklch = { l: 0, c: 0, h: 0 }
const mid: Oklch = { l: 0.55, c: 0, h: 0 }

describe('apcaLc', () => {
  it('is signed: positive dark-on-light, negative light-on-dark', () => {
    expect(apcaLc(black, white)).toBeGreaterThan(0)
    expect(apcaLc(white, black)).toBeLessThan(0)
  })

  it('is polarity-asymmetric, which is the main advantage of APCA over WCAG 2', () => {
    expect(Math.abs(apcaLc(black, white))).not.toBe(Math.abs(apcaLc(white, black)))
  })

  it('reports the extremes near the top of the scale', () => {
    expect(contrast(black, white)).toBeGreaterThan(100)
    expect(contrast(white, black)).toBeGreaterThan(100)
  })

  it('reports no contrast for a colour on itself', () => {
    expect(contrast(mid, mid)).toBeLessThan(1)
  })
})

/**
 * Alpha is included in the measurement.
 *
 * Dark borders are white at 6-15%. Measured as opaque, these barely visible
 * hairlines would pass every floor. So foregrounds are composited first, and
 * the parser that re-reads emitted values keeps alpha.
 */
describe('translucent foregrounds are measured composited, never opaque', () => {
  const nearBlack: Oklch = { l: 0.145, c: 0, h: 0 }
  const border = { ...white, alpha: 0.1 }

  it('composites a translucent foreground over its background', () => {
    const painted = composite(border, nearBlack)
    // White at 10% over L 0.145 is a faint grey, not white.
    expect(painted.l).toBeGreaterThan(nearBlack.l)
    expect(painted.l).toBeLessThan(0.35)
  })

  it('leaves an opaque foreground unchanged apart from 8-bit rounding', () => {
    // Quantised, not identical: opaque colours also go through 8-bit rounding.
    expect(composite(mid, nearBlack).l).toBeCloseTo(mid.l, 2)
    expect(composite(mid, nearBlack).l).not.toBe(0)
  })

  it('does not measure a 10% white border as if it were white', () => {
    // The opaque reading gives near-maximal Lc; the correct one is a hairline
    // APCA does not score.
    const asOpaque = contrast(white, nearBlack)
    const asPainted = contrast(border, nearBlack)
    expect(asOpaque).toBeGreaterThan(100)
    expect(asPainted).toBeLessThan(asOpaque / 4)
  })

  it('measures ΔL on the composite too, the measure delineation uses', () => {
    expect(deltaL(white, nearBlack)).toBeCloseTo(0.855, 3)
    // ≈0.11, the difference the reference's own dark hairline produces.
    expect(deltaL(border, nearBlack)).toBeGreaterThan(0.09)
    expect(deltaL(border, nearBlack)).toBeLessThan(0.13)
  })

  it('reports zero separation for a fully transparent foreground', () => {
    // Not exactly zero: the 8-bit round trip costs ~0.0002 of L.
    expect(deltaL({ ...white, alpha: 0 }, nearBlack)).toBeCloseTo(0, 3)
    expect(contrast({ ...white, alpha: 0 }, nearBlack)).toBe(0)
  })
})

describe('contrastDirection', () => {
  it('pushes a dark foreground darker and a light one lighter', () => {
    expect(contrastDirection(black, white)).toBe(-1)
    expect(contrastDirection(white, black)).toBe(1)
  })

  it('breaks ties away from the background, so a nudge always has room', () => {
    const light: Oklch = { l: 0.9, c: 0, h: 0 }
    const dark: Oklch = { l: 0.1, c: 0, h: 0 }
    expect(contrastDirection({ ...light }, light)).toBe(-1)
    expect(contrastDirection({ ...dark }, dark)).toBe(1)
  })
})
