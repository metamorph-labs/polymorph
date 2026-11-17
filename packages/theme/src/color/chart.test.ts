import { converter } from 'culori'
import { describe, expect, it } from 'vitest'

import { exampleInkTheme, exampleQuietTheme } from '../examples'
import { CHART_ROLES } from '../roles'
import type { Seeds } from '../seeds'
import { MODES } from '../theme'
import { auditChartPalette, resolveModeChart } from './chart'
import {
  CHART_ANCHORS,
  CHART_CHROMA_FLOOR,
  CHART_CVD_FLOOR,
  CHART_DIVERGING_ARM_LADDER,
  CHART_NORMAL_TARGET,
  CHART_ROTATION_ANCHOR,
  CHART_SEQ_LADDER,
  CHART_WHEEL_STEPS,
  chartCvdDeltaE,
  chartDeltaE,
  chartRotation,
  deriveChartDivergingArms,
  deriveChartSequential,
  deriveChartSlots,
} from './chart-wheel'
import { resolveModeColors } from './resolve'

/**
 * The wheel's mechanics. `chart-laws.test.ts` checks the shipped catalogue;
 * this checks the derivation: rotation is rigid, the two repairs run only when
 * needed, and neither undoes the other.
 */

const toOklch = converter('oklch')
const read = (hex: string) => {
  const parsed = toOklch(hex)
  if (!parsed) throw new Error(`cannot parse ${hex}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0 }
}

const hueOf = (slot: number, rotation: number) =>
  (((CHART_ANCHORS[slot - 1]!.hue + rotation) % 360) + 360) % 360

describe('the wheel rotates rigidly', () => {
  it('puts slot 1 on the brand and moves every other anchor by the same angle', () => {
    const seeds = { accentHue: 200, chromaBudget: 'high' } as Seeds
    const rotation = chartRotation(seeds)
    expect(rotation).toBeCloseTo(200 - CHART_ROTATION_ANCHOR, 6)

    for (const mode of MODES) {
      const slots = deriveChartSlots(mode, rotation)
      // Repairs change lightness only, so a slot's hue is always its anchor
      // plus the rotation, and the family spacing the gates expect is kept.
      for (const [index, derived] of slots.entries()) {
        expect(derived.color.h, `${mode} slot ${derived.slot}`).toBeCloseTo(
          hueOf(index + 1, rotation),
          3,
        )
      }
    }
  })

  it('gives an achromatic budget the canonical wheel, because there is no anchor to rotate to', () => {
    // `none` and `ink` apply to the accent, not the series, so both use the
    // authored wheel.
    for (const budget of ['none', 'ink'] as const) {
      expect(chartRotation({ accentHue: 137, chromaBudget: budget } as Seeds)).toBe(0)
    }
    expect(chartRotation({ accentHue: 137, chromaBudget: 'low' } as Seeds)).not.toBe(0)
  })

  it('leaves the canonical wheel exactly on its authored steps, with no repairs', () => {
    for (const mode of MODES) {
      for (const [index, derived] of deriveChartSlots(mode, 0).entries()) {
        const [ruledL] = CHART_WHEEL_STEPS[mode][index]!
        expect(derived.chromaRepair, `${mode} slot ${derived.slot}`).toBeUndefined()
        expect(derived.pairRepair, `${mode} slot ${derived.slot}`).toBeUndefined()
        expect(derived.color.l, `${mode} slot ${derived.slot}`).toBeCloseTo(ruledL, 6)
      }
    }
  })
})

describe('the repair loop', () => {
  /**
   * Light slot 3 asks for C .105 at L .418. Rotated into the yellow-greens, the
   * gamut has nothing close at that lightness, so the floor search must move
   * the slot instead of leaving it grey.
   */
  it('moves a slot that cannot hold the chroma floor at its authored lightness', () => {
    const rotation = 250 - CHART_ROTATION_ANCHOR
    const slots = deriveChartSlots('light', rotation)
    const repaired = slots.filter((slot) => slot.chromaRepair)
    expect(repaired.length).toBeGreaterThan(0)
    for (const slot of slots) {
      expect(slot.color.c, `slot ${slot.slot} at ${slot.hex}`).toBeGreaterThanOrEqual(
        CHART_CHROMA_FLOOR - 1e-9,
      )
    }
  })

  it('separates a pair the rotation merged, and steps once more past the gate', () => {
    // Some rotation must merge a pair, or the gates constrain nothing.
    const repairs = []
    for (let hue = 0; hue < 360; hue += 10) {
      for (const mode of MODES) {
        for (const slot of deriveChartSlots(mode, hue - CHART_ROTATION_ANCHOR)) {
          if (slot.pairRepair) repairs.push({ hue, mode, ...slot })
        }
      }
    }
    expect(repairs.length).toBeGreaterThan(0)
    // The loop records only repairs that worked, so each record is a real move.
    // Not asserted as a full step: the nudge is clamped to the admissible
    // range, so a successful move near its end can be shorter than
    // `CHART_L_STEP`. The engine does not promise full steps.
    for (const repair of repairs) {
      expect(Math.abs(repair.pairRepair!.to - repair.pairRepair!.from)).toBeGreaterThan(0)
    }
  })

  it('does not oscillate, because the guard step is checked against non-monotone CVD distance', () => {
    // Prevents an unchecked guard step moving a passing pair back into the
    // protanopia minimum until the loop runs out of rounds. The case is 15°,
    // light, slots 1-2 (a red next to a green).
    const rotation = 15 - CHART_ROTATION_ANCHOR
    const slots = deriveChartSlots('light', rotation)
    const cvd = chartCvdDeltaE(slots[0]!.hex, slots[1]!.hex)
    expect(cvd).toBeGreaterThanOrEqual(CHART_CVD_FLOOR)
    // Settled: deriving again gives the same result.
    expect(deriveChartSlots('light', rotation).map((slot) => slot.hex)).toEqual(
      slots.map((slot) => slot.hex),
    )
  })

  it('never lets one repair undo the other, at any angle', () => {
    // Both repairs change lightness (one for chroma, one for separation).
    // Limiting the nudge to lightnesses that reach the floor stops them
    // conflicting.
    for (let hue = 0; hue < 360; hue += 5) {
      const rotation = hue - CHART_ROTATION_ANCHOR
      for (const mode of MODES) {
        for (const slot of deriveChartSlots(mode, rotation)) {
          expect(slot.color.c, `${mode} ${hue}° slot ${slot.slot}`).toBeGreaterThanOrEqual(
            CHART_CHROMA_FLOOR - 1e-9,
          )
        }
      }
    }
  })

  it('holds the hard adjacency floors at every rotation angle', () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const rotation = hue - CHART_ROTATION_ANCHOR
      for (const mode of MODES) {
        const hexes = deriveChartSlots(mode, rotation).map((slot) => slot.hex)
        for (let index = 0; index < hexes.length - 1; index += 1) {
          const label = `${mode} ${hue}° slots ${index + 1}-${index + 2}`
          expect(chartDeltaE(hexes[index]!, hexes[index + 1]!), label).toBeGreaterThanOrEqual(
            CHART_NORMAL_TARGET,
          )
          expect(chartCvdDeltaE(hexes[index]!, hexes[index + 1]!), label).toBeGreaterThanOrEqual(
            CHART_CVD_FLOOR,
          )
        }
      }
    }
  })
})

describe('sequential and diverging', () => {
  it('rotates the sequential ramp with the brand and steps it evenly', () => {
    const rotation = 120 - CHART_ROTATION_ANCHOR
    for (const mode of MODES) {
      const ramp = deriveChartSequential(mode, rotation)
      expect(ramp).toHaveLength(CHART_SEQ_LADDER[mode].length)
      for (const [index, color] of ramp.entries()) {
        expect(color.h, `${mode} step ${index + 1}`).toBeCloseTo(120, 3)
        expect(color.l, `${mode} step ${index + 1}`).toBeCloseTo(CHART_SEQ_LADDER[mode][index]!, 6)
      }
    }
  })

  it('never rotates the diverging arms, because polarity is a convention, not brand colour', () => {
    for (const mode of MODES) {
      const canonical = deriveChartDivergingArms(mode)
      // The arms take no rotation argument. The law that no palette moves them
      // is in `chart-laws.test.ts`.
      expect(deriveChartDivergingArms(mode)).toEqual(canonical)
      expect(canonical.neg).toHaveLength(CHART_DIVERGING_ARM_LADDER[mode].length)
      expect(canonical.pos).toHaveLength(CHART_DIVERGING_ARM_LADDER[mode].length)
      for (const [index, step] of CHART_DIVERGING_ARM_LADDER[mode].entries()) {
        // Each side is one anchor hue at three ladder lightnesses.
        expect(canonical.pos[index]!.h, `${mode} pos arm ${index + 1}`).toBeCloseTo(
          CHART_ANCHORS[0]!.hue,
          3,
        )
        expect(canonical.neg[index]!.h, `${mode} neg arm ${index + 1}`).toBeCloseTo(
          CHART_ANCHORS[2]!.hue,
          3,
        )
        expect(canonical.neg[index]!.l, `${mode} neg arm ${index + 1}`).toBeCloseTo(step.l, 6)
        expect(canonical.pos[index]!.l, `${mode} pos arm ${index + 1}`).toBeCloseTo(step.l, 6)
      }
    }
  })
})

describe('the resolved roles', () => {
  const resolve = (theme: typeof exampleQuietTheme, mode: (typeof MODES)[number]) => {
    const colors = resolveModeColors(theme, mode)
    return { colors, chart: resolveModeChart(theme, mode, colors) }
  }

  it('fills every role, in both modes, with a real colour', () => {
    for (const mode of MODES) {
      const { chart } = resolve(exampleQuietTheme, mode)
      for (const role of CHART_ROLES) {
        expect(chart[role], `${mode} ${role}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('draws the grid at the weight the theme draws its borders at', () => {
    // "One and two steps from bg.surface" is ΔL 0.015 on white, under half the
    // delineation floor. Deriving the step from the theme's border keeps the
    // gridline visible and as strong as the borders.
    for (const mode of MODES) {
      const { colors, chart } = resolve(exampleQuietTheme, mode)
      const surface = read(colors['bg.surface'])
      const grid = read(chart['chart.grid'])
      const axis = read(chart['chart.axis'])
      expect(Math.abs(grid.l - surface.l), `${mode} grid`).toBeGreaterThanOrEqual(0.04)
      // The axis is stronger, because it is the zero baseline.
      expect(Math.abs(axis.l - surface.l), `${mode} axis`).toBeGreaterThan(
        Math.abs(grid.l - surface.l),
      )
    }
  })

  it('keeps the diverging midpoint grey, whatever the palette', () => {
    for (const theme of [exampleQuietTheme, exampleInkTheme]) {
      for (const mode of MODES) {
        const { chart } = resolve(theme, mode)
        expect(read(chart['chart.mid']).c, `${theme.name} ${mode}`).toBeLessThanOrEqual(0.03)
      }
    }
  })

  it('keeps eight coloured slots under a budget with no hue', () => {
    // As with `STATUS_CHROMA_FLOOR`, `none` applies to the accent only, so the
    // canonical wheel ships in full colour.
    for (const mode of MODES) {
      const { colors, chart } = resolve(exampleInkTheme, mode)
      const audit = auditChartPalette(mode, chart, colors)
      expect(audit.failures).toEqual([])
      for (const slot of audit.slots) {
        expect(slot.chroma, `${mode} slot ${slot.slot}`).toBeGreaterThanOrEqual(
          CHART_CHROMA_FLOOR - 1e-9,
        )
      }
    }
  })
})
