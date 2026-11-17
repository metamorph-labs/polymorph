import { describe, expect, it } from 'vitest'

import { contrast, deltaL } from './color/contrast'
import {
  DELINEATION_MIN_DELTA_L,
  FOCUS_MIN_DELTA_L,
  isDelineation,
  isExemptFromContrast,
  LAWFUL_PAIRINGS,
  LC_FLOORS,
  PAIRING_EXEMPTIONS,
  pairingId,
  pairingsInvolving,
} from './pairings'
import { isColorRole, SELECTION_SURFACES, STATUS_TONES, TEXT_BEARING_BACKGROUNDS } from './roles'

describe('lawful pairings', () => {
  it('names only real roles on both sides', () => {
    for (const p of LAWFUL_PAIRINGS) {
      expect(isColorRole(p.foreground), `unknown fg ${p.foreground}`).toBe(true)
      expect(isColorRole(p.background), `unknown bg ${p.background}`).toBe(true)
    }
  })

  it('has no duplicate pairs', () => {
    const ids = LAWFUL_PAIRINGS.map(pairingId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('states a positive floor and a reason for every pair, in its own measure', () => {
    // Text pairs state an APCA floor. Delineation pairs state a ΔL floor and no
    // APCA floor, because APCA reports 0 for a hairline.
    for (const p of LAWFUL_PAIRINGS) {
      if (isDelineation(p)) {
        expect(p.minDeltaL, pairingId(p)).toBeGreaterThan(0)
        expect(p.minLc, pairingId(p)).toBe(0)
      } else {
        expect(p.minLc, pairingId(p)).toBeGreaterThan(0)
        expect(p.minDeltaL, pairingId(p)).toBeUndefined()
      }
      expect(p.reason.length, pairingId(p)).toBeGreaterThan(0)
    }
  })

  it('holds primary text to the body floor on every text-bearing background', () => {
    for (const bg of TEXT_BEARING_BACKGROUNDS) {
      const pair = LAWFUL_PAIRINGS.find(
        (p) => p.foreground === 'text.primary' && p.background === bg,
      )
      expect(pair?.minLc, `text.primary on ${bg}`).toBe(LC_FLOORS.bodyText)
    }
  })

  it('orders the text floors primary > secondary > muted', () => {
    expect(LC_FLOORS.bodyText).toBeGreaterThan(LC_FLOORS.secondaryText)
    expect(LC_FLOORS.secondaryText).toBeGreaterThan(LC_FLOORS.mutedText)
    // The text floors stay in APCA; ΔL is only for delineation.
    expect(LC_FLOORS.mutedText).toBe(45)
    expect(LC_FLOORS.bodyText).toBe(75)
    expect(LC_FLOORS.secondaryText).toBe(60)
    expect(LC_FLOORS.onSolid).toBe(60)
  })

  it('checks every status tone against its own subtle surface', () => {
    for (const tone of STATUS_TONES) {
      const pair = LAWFUL_PAIRINGS.find(
        (p) => p.foreground === `${tone}.text` && p.background === `${tone}.subtle`,
      )
      expect(pair, `${tone}.text on ${tone}.subtle`).toBeDefined()
    }
  })

  it('keeps the inverse-tone pair lawful, since inverse scopes depend on it', () => {
    const pair = LAWFUL_PAIRINGS.find(
      (p) => p.foreground === 'text.inverse' && p.background === 'bg.inverse',
    )
    expect(pair?.minLc).toBe(LC_FLOORS.bodyText)
  })

  it('holds both focus colours on every text-bearing background, at twice the hairline floor', () => {
    // A focus indicator is measured like a hairline and must stand out from one.
    expect(FOCUS_MIN_DELTA_L).toBe(DELINEATION_MIN_DELTA_L * 2)
    for (const role of ['border.focus', 'border.focusSolid'] as const) {
      const pairs = LAWFUL_PAIRINGS.filter((p) => p.foreground === role)
      expect(
        pairs.map((p) => p.background),
        role,
      ).toEqual([...TEXT_BEARING_BACKGROUNDS])
      for (const p of pairs) {
        expect(p.kind, pairingId(p)).toBe('delineation')
        expect(p.minDeltaL, pairingId(p)).toBe(FOCUS_MIN_DELTA_L)
      }
    }
  })

  it('marks borders as delineation, held to a ΔL floor rather than an Lc one', () => {
    const borders = LAWFUL_PAIRINGS.filter((p) => p.foreground === 'border.default')
    expect(borders.length).toBe(TEXT_BEARING_BACKGROUNDS.length)
    for (const p of borders) {
      expect(p.kind).toBe('delineation')
      expect(isDelineation(p)).toBe(true)
      expect(p.minDeltaL).toBe(DELINEATION_MIN_DELTA_L)
    }
  })
})

/**
 * Why delineation is measured in ΔL, with the evidence as tests: APCA scores
 * the reference's own borders at or near zero in both modes, so it is the
 * wrong measure for hairlines.
 */
describe('why delineation is not judged in APCA', () => {
  const grey = (l: number) => ({ l, c: 0, h: 0 })
  /** The reference's light `--border`, on its own background and on its own wash. */
  const refBorder = grey(0.922)
  const refPaper = grey(1)
  const refMuted = grey(0.97)
  /** The reference's dark `--border`: white at 10%, over its own page and card. */
  const refDarkBorder = { ...grey(1), alpha: 0.1 }
  const refDarkPage = grey(0.145)
  const refDarkCard = grey(0.205)

  it('scores the reference’s light border below an Lc 15 floor', () => {
    expect(contrast(refBorder, refPaper)).toBeLessThan(15)
    expect(contrast(refBorder, refPaper)).toBeGreaterThan(12)
  })

  it('scores the reference’s own border-on-wash at exactly zero', () => {
    // APCA clips below |Lc| ≈ 8. Zero means no score, not very low contrast.
    expect(contrast(refBorder, refMuted)).toBe(0)
  })

  it('scores the reference’s dark border at exactly zero, on every dark surface', () => {
    expect(contrast(refDarkBorder, refDarkPage)).toBe(0)
    expect(contrast(refDarkBorder, refDarkCard)).toBe(0)
  })

  it('sets the ΔL floor just under the reference’s own smallest delineation', () => {
    const tightest = deltaL(refBorder, refMuted)
    expect(tightest).toBeCloseTo(0.048, 3)
    expect(DELINEATION_MIN_DELTA_L).toBeLessThan(tightest)
    // But not so far below that it stops being a floor.
    expect(DELINEATION_MIN_DELTA_L).toBeGreaterThan(tightest * 0.75)
  })

  it('passes every one of the reference’s borders in ΔL', () => {
    for (const [fg, bg] of [
      [refBorder, refPaper],
      [refBorder, refMuted],
      [refDarkBorder, refDarkPage],
      [refDarkBorder, refDarkCard],
    ] as const) {
      expect(deltaL(fg, bg)).toBeGreaterThanOrEqual(DELINEATION_MIN_DELTA_L)
    }
  })
})

describe('exemptions', () => {
  it('lists text.disabled explicitly rather than omitting it', () => {
    expect(isExemptFromContrast('text.disabled')).toBe(true)
    expect(PAIRING_EXEMPTIONS.every((e) => e.reason.length > 20)).toBe(true)
  })

  it('never lets an exempt role appear as a checked foreground', () => {
    for (const p of LAWFUL_PAIRINGS) {
      expect(isExemptFromContrast(p.foreground), pairingId(p)).toBe(false)
    }
  })

  it('exempts nothing else', () => {
    expect(PAIRING_EXEMPTIONS.map((e) => e.role)).toEqual(['text.disabled'])
  })
})

describe('pairingsInvolving', () => {
  it('finds a role on either side of the pair', () => {
    // Primary text is held on every background that bears text and on every
    // selected surface.
    expect(pairingsInvolving('text.primary').length).toBe(
      TEXT_BEARING_BACKGROUNDS.length + SELECTION_SURFACES.length,
    )
    expect(pairingsInvolving('bg.surface').length).toBeGreaterThan(1)
    expect(pairingsInvolving('bg.scrim')).toHaveLength(0)
  })
})
