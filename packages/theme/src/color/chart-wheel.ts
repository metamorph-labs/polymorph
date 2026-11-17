import {
  converter,
  differenceEuclidean,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
} from 'culori'

import type { ChromaBudget, Seeds } from '../seeds'
import type { Mode } from '../theme'
import { gamutMap, toHex, type Oklch } from './ramp'

/**
 * The chart wheel: `design/charts-wheel.json` in code (explained in
 * `docs/charts.md`).
 *
 * Series colour is a **role family**, derived per pairing and per mode like
 * `danger`, not component styling. This module holds the anchors, the authored
 * steps, and the repair loop that keeps a rotated wheel lawful. It makes no
 * taste decisions: the numbers come from the wheel's design, the loop is
 * mechanical, and `chart-laws.test.ts` measures its output.
 */

/**
 * Eight hue anchors in a fixed order. **The order makes the wheel CVD-safe:**
 * slots are assigned in order and never cycled, so the pairs a reader must
 * tell apart are adjacent, and the gates measure adjacent pairs.
 *
 * The families are the union of the reference's two palettes (light:
 * orange/teal/blue/yellow/amber; dark: indigo/green/amber/purple/red), with
 * indigo merged into blue. Slots 1-5 follow the reference's light numbering.
 * The rest are its dark families as `red > purple > green`, the order that,
 * enumerated against the alternatives, has the best minimum adjacent gate
 * margin across both modes.
 */
export const CHART_ANCHORS = [
  { slot: 1, family: 'orange', hue: 41.116 },
  { slot: 2, family: 'teal', hue: 184.704 },
  { slot: 3, family: 'blue', hue: 245 },
  { slot: 4, family: 'yellow', hue: 84.429 },
  { slot: 5, family: 'amber', hue: 70.08 },
  { slot: 6, family: 'red', hue: 16.439 },
  { slot: 7, family: 'purple', hue: 303.9 },
  { slot: 8, family: 'green', hue: 162.48 },
] as const

export const CHART_SLOT_COUNT = CHART_ANCHORS.length

/** Slot 1's hue. A rotation is stated as the distance from it. */
export const CHART_ROTATION_ANCHOR = CHART_ANCHORS[0].hue

/**
 * The authored step per slot per mode: lightness and requested chroma, in
 * OKLCH.
 *
 * Tuning constants like `LIGHTNESS_LADDER`: tuned until plain seeds match the
 * reference. Light slots 1 / 2 / 4 are the reference's values. 3 and 5 are
 * required repairs (the chroma floor and the yellow/amber adjacency). Dark 5-8
 * are the reference's dark steps. The rest are derived under the gates.
 *
 * Chroma is requested, not guaranteed. Some entries are outside sRGB (light
 * slot 1 asks for .222; the gamut tops out near .199). The emitted value keeps
 * L and h and reduces C. The authored value is kept for a wide-gamut emitter.
 *
 * The budget does not scale any of it: a series carries information, so
 * `chromaBudget: 'none'` (the flagship's palette) still ships eight coloured
 * slots. See `CHART_CHROMA_FLOOR`.
 */
export const CHART_WHEEL_STEPS: Record<Mode, readonly (readonly [number, number])[]> = {
  light: [
    [0.646, 0.222],
    [0.6, 0.118],
    [0.418, 0.105],
    [0.828, 0.189],
    [0.679, 0.188],
    [0.501, 0.2],
    [0.67, 0.217],
    [0.5, 0.109],
  ],
  dark: [
    [0.55, 0.169],
    [0.74, 0.131],
    [0.55, 0.138],
    [0.55, 0.113],
    [0.769, 0.188],
    [0.645, 0.246],
    [0.627, 0.265],
    [0.696, 0.17],
  ],
}

/**
 * The `STATUS_CHROMA_FLOOR` reasoning, for charts. Below C ≈ 0.10 a hue looks
 * grey and no longer identifies a series. `none` removes the accent's hue, not
 * the series'.
 */
export const CHART_CHROMA_FLOOR = 0.1

/**
 * The repair loop's lightness step; the guard band is one more. The manual
 * repair of light amber (L .769 to .679, for the yellow adjacency) uses the
 * same step.
 */
export const CHART_L_STEP = 0.03

/**
 * The admissible-lightness scan's step: below perception, still cheap.
 */
const CHART_L_PROBE = 0.005

/**
 * The floor applies to the **emitted** 8-bit colour. A value at exactly 0.10
 * can read back as 0.0999, and the loop and the law would disagree. One 8-bit
 * step is worth up to ~0.004 of chroma here, so the search clears the floor by
 * that much. The palette sweep tests this edge.
 */
const CHART_QUANTIZATION_GUARD = 0.004

/** No slot is placed outside this range. The ramp ends are for surfaces and text. */
const CHART_L_RANGE: readonly [number, number] = [0.2, 0.92]

/**
 * The preferred lightness range for marks. **Soft**: exact reference slots
 * (light 3 and 4) and rotated repairs may fall outside it, and the CVD and
 * chroma gates still apply, so it records a WARN, not a failure.
 */
export const CHART_LIGHTNESS_BAND: Record<Mode, readonly [number, number]> = {
  light: [0.43, 0.77],
  dark: [0.48, 0.67],
}

/**
 * Adjacent-pair separation, in OKLab ΔE × 100.
 *
 * The repair loop aims for `CHART_CVD_TARGET`. `CHART_CVD_FLOOR` is the hard
 * gate. The floor is lower because every chart has secondary encoding: a
 * legend at two or more series, selective direct labels, and the mandatory
 * table twin, which is why the twin is part of the chart's anatomy
 * (`docs/charts.md`).
 */
export const CHART_CVD_TARGET = 8
export const CHART_CVD_FLOOR = 6

/**
 * Separation without CVD simulation. Hard, because two series a normal-sighted
 * reader cannot tell apart are one series.
 */
export const CHART_NORMAL_TARGET = 15

/**
 * Non-text contrast is a ratio standard, so the mark gate is WCAG's 3:1. APCA
 * stays the text metric. Soft: a slot below 3:1 is recorded, and is lawful
 * only because the table twin is mandatory.
 */
export const CHART_MARK_MIN_RATIO = 3

/**
 * The **viz ladder**: seven stops for the sequential scale, not the UI ramp
 * read at seven indices.
 *
 * `LIGHTNESS_LADDER` is shaped for roles (a near-white cluster, a solids
 * cluster, a text pole), so its indices give indistinguishable bins and then a
 * jump. A perceptual ramp needs even steps: ΔL .10 throughout. The anchor flips
 * per mode so values near zero fade towards the surface.
 */
export const CHART_SEQ_LADDER: Record<Mode, readonly number[]> = {
  light: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
  dark: [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85],
}

export const CHART_SEQ_STEP_COUNT = CHART_SEQ_LADDER.light.length

/** Requested chroma at every sequential stop, gamut-clamped per step. */
export const CHART_SEQ_CHROMA = 0.16

/** Hard floor on adjacent sequential ΔL: half the ladder's step. */
export const CHART_SEQ_MIN_DELTA_L = 0.06

/**
 * The diverging arms' ladder: three (L, C) steps per side.
 *
 * Arm 1 is nearest the midpoint and arm 3 is the **pole**, the strongest step
 * (light L .55 C .17, dark L .68 C .17). Dedicated values of matched
 * strength, not slot values, because slot 3's navy is deliberately dim and a
 * pole must not be. Distance from the midpoint increases strictly outward (a
 * law). The per-step mismatch between sides stays within 0.2, except light
 * arm 3's recorded 1.1, from the poles' asymmetry.
 */
export const CHART_DIVERGING_ARM_LADDER: Record<Mode, readonly { l: number; c: number }[]> = {
  light: [
    { l: 0.81, c: 0.07 },
    { l: 0.68, c: 0.12 },
    { l: 0.55, c: 0.17 },
  ],
  dark: [
    { l: 0.42, c: 0.07 },
    { l: 0.55, c: 0.12 },
    { l: 0.68, c: 0.17 },
  ],
}

export const CHART_DIVERGING_ARM_COUNT = CHART_DIVERGING_ARM_LADDER.light.length

/** Warm above zero, cool below. This hue pair never rotates. */
export const CHART_DIVERGING_HUES = {
  pos: CHART_ANCHORS[0].hue,
  neg: CHART_ANCHORS[2].hue,
} as const

const deltaEOklab = differenceEuclidean('oklab')
const protanopia = filterDeficiencyProt(1)
const deuteranopia = filterDeficiencyDeuter(1)
const toRgb = converter('rgb')

/**
 * OKLab distance × 100, measured **on sRGB hex** (what a display shows). Every
 * gate number in `design/charts-wheel.json` uses this measure.
 */
export function chartDeltaE(a: string, b: string): number {
  return deltaEOklab(a, b) * 100
}

/**
 * Separation under colour-vision deficiency: the worse of protanopia and
 * deuteranopia at severity 1.0 (Machado-Oliveira-Fernandes 2009, as culori
 * implements it). Tritanopia is rare and blue/yellow, so red/green is the
 * limiting case for a categorical wheel and tritanopia is not checked.
 */
export function chartCvdDeltaE(a: string, b: string): number {
  const x = toRgb(a)
  const y = toRgb(b)
  if (!x || !y) throw new Error(`cannot simulate colour-vision deficiency for ${a} / ${b}`)
  return (
    Math.min(
      deltaEOklab(protanopia(x), protanopia(y)),
      deltaEOklab(deuteranopia(x), deuteranopia(y)),
    ) * 100
  )
}

/**
 * An achromatic palette has no anchor, so it uses the canonical wheel. That is
 * how the flagship's `chromaBudget: 'none'` reproduces the reference's chart
 * colours from four ordinary seed fields.
 */
export function isAchromaticBudget(budget: ChromaBudget): boolean {
  return budget === 'none' || budget === 'ink'
}

/**
 * How far the wheel rotates to put slot 1 on the brand hue. **Rigid**: every
 * anchor moves by the same angle, so the spacing the gates are tuned against
 * is unchanged.
 */
export function chartRotation(seeds: Seeds): number {
  if (isAchromaticBudget(seeds.chromaBudget)) return 0
  return seeds.accentHue - CHART_ROTATION_ANCHOR
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Whether the gamut holds the chroma floor at this lightness and hue, guard included. */
function holdsFloor(l: number, h: number): boolean {
  const target = CHART_CHROMA_FLOOR + CHART_QUANTIZATION_GUARD
  return gamutMap({ l, c: target, h }).c >= target - 1e-9
}

/**
 * The contiguous lightness range around `l` where a hue can reach the chroma
 * floor. Both repairs (chroma floor and pair gate) stay inside it, so neither
 * can undo the other: a nudge cannot push a slot into grey, and the floor
 * search cannot place a slot where the next nudge is disallowed.
 *
 * `undefined` would mean a hue with no chroma at any lightness, which sRGB does
 * not have. The caller then does not move the slot.
 */
function admissibleLightness(l: number, h: number): readonly [number, number] | undefined {
  const [low, high] = CHART_L_RANGE
  let seed = l
  if (!holdsFloor(seed, h)) {
    let found: number | undefined
    for (let step = CHART_L_PROBE; step <= high - low; step += CHART_L_PROBE) {
      for (const direction of [1, -1]) {
        const probe = l + direction * step
        if (probe < low || probe > high) continue
        if (holdsFloor(probe, h)) {
          found = probe
          break
        }
      }
      if (found !== undefined) break
    }
    if (found === undefined) return undefined
    seed = found
  }
  let lo = seed
  while (lo - CHART_L_PROBE >= low && holdsFloor(lo - CHART_L_PROBE, h)) lo -= CHART_L_PROBE
  let hi = seed
  while (hi + CHART_L_PROBE <= high && holdsFloor(hi + CHART_L_PROBE, h)) hi += CHART_L_PROBE
  return [lo, hi]
}

/** One slot, with a record of every change the loop made to it. */
export interface ChartSlotDerivation {
  slot: number
  family: string
  /** The emitted colour, gamut-mapped. */
  color: Oklch
  hex: string
  /** Set when the chroma floor moved the slot's lightness. */
  chromaRepair?: { from: number; to: number }
  /** Set when an adjacent-pair gate moved it. */
  pairRepair?: { against: number; from: number; to: number }
}

interface Working {
  slot: number
  family: string
  l: number
  c: number
  h: number
  range?: readonly [number, number]
  chromaRepair?: { from: number; to: number }
  pairRepair?: { against: number; from: number; to: number }
}

/**
 * The categorical wheel for one mode: rotate, apply the steps, repair.
 *
 * On the canonical wheel both repairs do nothing, because the authored steps
 * include them, so the flagship matches the reference exactly. On a rotated
 * wheel a hue that reached chroma .105 at L .418 may reach none as a
 * yellow-green, and families 30 ΔE apart may come closer.
 *
 * Rotation is never an exemption. If the loop cannot repair a pair, the value
 * is still emitted and `chart-laws.test.ts` fails naming the pair, so such a
 * palette cannot ship.
 */
export function deriveChartSlots(mode: Mode, rotation: number): ChartSlotDerivation[] {
  const steps = CHART_WHEEL_STEPS[mode]

  const slots: Working[] = CHART_ANCHORS.map((anchor, index) => {
    const step = steps[index]
    // Throw, not default: a ninth anchor must fail, not emit a mid-grey slot
    // that passes every gate.
    if (!step) throw new Error(`chart wheel: ${mode} slot ${anchor.slot} has no authored step`)
    const [ruledL, ruledC] = step
    const h = normalizeHue(anchor.hue + rotation)
    const working: Working = {
      slot: anchor.slot,
      family: anchor.family,
      l: ruledL,
      c: Math.max(ruledC, CHART_CHROMA_FLOOR),
      h,
    }
    // Lazy: the canonical wheel never enters this branch, so the flagship does
    // no work that only a rotated palette needs.
    if (!holdsFloor(ruledL, h)) {
      const range = rangeOf(working)
      if (range) {
        const placed = clamp(ruledL, range[0], range[1])
        if (Math.abs(placed - ruledL) > 1e-9) {
          working.l = placed
          working.chromaRepair = { from: ruledL, to: placed }
        }
      }
    }
    return working
  })

  const paint = (working: Working): string => toHex({ l: working.l, c: working.c, h: working.h })
  const separated = (a: Working, b: Working): boolean => {
    const [x, y] = [paint(a), paint(b)]
    return chartDeltaE(x, y) >= CHART_NORMAL_TARGET && chartCvdDeltaE(x, y) >= CHART_CVD_TARGET
  }

  // Left to right, repeatedly, because moving a slot can break its other
  // pair. The round limit bounds this.
  for (let round = 0; round < 8; round += 1) {
    let changed = false
    for (let index = 0; index < slots.length - 1; index += 1) {
      const a = slots[index]
      const b = slots[index + 1]
      if (!a || !b || separated(a, b)) continue
      const range = rangeOf(b)
      if (!range) continue

      const start = b.l
      // Away from the neighbour first, then the other way for a slot already at
      // the end of its range.
      for (const direction of b.l >= a.l ? [1, -1] : [-1, 1]) {
        b.l = start
        let moved = false
        for (let step = 0; step < 16; step += 1) {
          const next = clamp(b.l + direction * CHART_L_STEP, range[0], range[1])
          if (Math.abs(next - b.l) < 1e-9) break
          b.l = next
          moved = true
          if (separated(a, b)) break
        }
        if (moved && separated(a, b)) {
          /**
           * One guard step past the gate, because a pair exactly at a floor is
           * one rounding from below it. The step is **checked**, because CVD
           * distance is not monotone in lightness: two hues that merge under
           * protanopia have a minimum, and an unchecked step can move a passing
           * pair back into it. The loop would then oscillate until it ran out of
           * rounds with the pair failing (the property sweep covers this). So
           * the guard step is kept only if the pair still passes.
           */
          const settled = b.l
          b.l = clamp(b.l + direction * CHART_L_STEP, range[0], range[1])
          if (!separated(a, b)) b.l = settled
          b.pairRepair = { against: a.slot, from: b.pairRepair?.from ?? start, to: b.l }
          changed = true
          break
        }
        b.l = start
      }
    }
    if (!changed) break
  }

  return slots.map((working) => ({
    slot: working.slot,
    family: working.family,
    color: gamutMap({ l: working.l, c: working.c, h: working.h }),
    hex: paint(working),
    ...(working.chromaRepair ? { chromaRepair: working.chromaRepair } : {}),
    ...(working.pairRepair ? { pairRepair: working.pairRepair } : {}),
  }))
}

function rangeOf(working: Working): readonly [number, number] | undefined {
  working.range ??= admissibleLightness(working.l, working.h)
  return working.range
}

/**
 * The sequential ramp: slot 1's hue (so it rotates with the brand) on the viz
 * ladder, chroma gamut-clamped per step.
 */
export function deriveChartSequential(mode: Mode, rotation: number): Oklch[] {
  const hue = normalizeHue(CHART_ROTATION_ANCHOR + rotation)
  return CHART_SEQ_LADDER[mode].map((l) => gamutMap({ l, c: CHART_SEQ_CHROMA, h: hue }))
}

/**
 * The diverging arms, **fixed to the orange and blue anchors for every
 * palette**, so "above zero" has one colour everywhere. Neither side is red or
 * green, because polarity is direction and good or bad is a separate decision
 * (the rule Stat's delta follows). The function takes no rotation argument.
 *
 * Arrays run outward: index 0 is arm 1 (nearest mid), index 2 is arm 3 (the
 * pole).
 */
export function deriveChartDivergingArms(mode: Mode): { neg: Oklch[]; pos: Oklch[] } {
  const ladder = CHART_DIVERGING_ARM_LADDER[mode]
  return {
    neg: ladder.map((step) => gamutMap({ l: step.l, c: step.c, h: CHART_DIVERGING_HUES.neg })),
    pos: ladder.map((step) => gamutMap({ l: step.l, c: step.c, h: CHART_DIVERGING_HUES.pos })),
  }
}
