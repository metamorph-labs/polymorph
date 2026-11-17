import { converter } from 'culori'

import { DELINEATION_MIN_DELTA_L } from '../pairings'
import {
  CHART_DIVERGING_ARM_STEPS,
  CHART_SEQ_STEPS,
  CHART_SLOTS,
  chartDivergingRole,
  chartSeqRole,
  chartSlotRole,
  type ChartRoleValues,
  type ColorRoleValues,
} from '../roles'
import { MODES, type Mode, type Theme } from '../theme'
import { deltaL, wcagRatio, type Translucent } from './contrast'
import {
  CHART_CHROMA_FLOOR,
  CHART_CVD_FLOOR,
  CHART_CVD_TARGET,
  CHART_LIGHTNESS_BAND,
  CHART_MARK_MIN_RATIO,
  CHART_NORMAL_TARGET,
  CHART_SEQ_MIN_DELTA_L,
  chartCvdDeltaE,
  chartDeltaE,
  chartRotation,
  deriveChartDivergingArms,
  deriveChartSequential,
  deriveChartSlots,
  type ChartSlotDerivation,
} from './chart-wheel'
import {
  RAMP_LENGTH,
  RAMP_STEPS,
  shiftStep,
  toCssColor,
  toHex,
  type Oklch,
  type Ramp,
  type RampStep,
} from './ramp'
import { generateAllRamps, type Ramps } from './resolve'

/**
 * Chart roles, resolved after the colour roles, like gradients, because grid
 * and axis are measured against surfaces the contrast law may have adjusted.
 * (The midpoint and the de-emphasis grey come from the raw neutral ramp.)
 */

/**
 * The de-emphasis grey is the neutral ramp's **solid-fill** step. It uses the
 * mode's own ladder, not `SOLID_LADDER`, because grey must be dark on a light
 * page and light on a dark one or it disappears.
 */
const CHART_OTHER_STEP: RampStep = 9

/**
 * The diverging midpoint's default step. Light 3 is `bg.subtle`'s step. Dark 5
 * is the neutral step nearest L .32 **that is not the grid's** (step 6), so a
 * zero cell does not match the gridlines. Both come from the **neutral** ramp
 * whatever the colour strategy, because zero has no hue.
 */
const CHART_MID_STEP: Record<Mode, RampStep> = { light: 3, dark: 5 }

/**
 * The pairing's midpoint: the default step, moved **down** past the grid or
 * axis step, never up.
 *
 * With the canonical grid and axis (6 and 7) only the grid can collide. But
 * faint-border systems put their dark grid at step 5, and "nearest L .32 that
 * is not the grid" would then give step 6, their axis. So both are avoided,
 * moving down only, because zero must be fainter than the arms, grid and axis.
 * Moving only down also keeps a stark system's midpoint at 5 (grid and axis at
 * 7/8) instead of moving up towards L .32.
 *
 * The loop terminates: each pass moves down, and step 1 is never grid or axis,
 * because the grid is past the surface's step (so at least 2) and the axis is
 * past the grid.
 */
function midStep(mode: Mode, furniture: { grid: RampStep; axis: RampStep }): RampStep {
  let step = CHART_MID_STEP[mode]
  while (step === furniture.grid || step === furniture.axis) step = shiftStep(step, -1)
  return step
}

const toOklch = converter('oklch')

/** The shorter distance round the wheel, in degrees (0…180). */
function hueDistance(a: number, b: number): number {
  const raw = Math.abs((((a - b) % 360) + 360) % 360)
  return raw > 180 ? 360 - raw : raw
}

function parse(value: string): Translucent {
  const parsed = toOklch(value)
  if (!parsed) throw new Error(`cannot re-parse emitted colour: ${value}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0, alpha: parsed.alpha ?? 1 }
}

function opaque(value: string): Oklch {
  const { l, c, h } = parse(value)
  return { l, c, h }
}

/**
 * **The grid uses the same visual weight as this theme's borders.**
 *
 * "One and two neutral steps from `bg.surface`" works in dark mode (surface
 * step 3, and step 4 nearly matches the reference's gridline) but is invisible
 * in light mode: from white, the next steps are 0.985 and 0.97, ΔL 0.015, under
 * half the delineation floor (`DELINEATION_MIN_DELTA_L`).
 *
 * So the grid takes the first neutral step whose difference from `bg.surface`
 * matches `border.default`, and the axis the next step. In light mode that is
 * step 6, `#e5e5e5`, the reference's `--border` and its chart gridline colour.
 * In dark mode it is also step 6, close to the white-alpha border's composite.
 * A stark system's stronger borders give a stronger grid. The delineation
 * floor is the minimum, for themes with fainter borders.
 *
 * Both sides use `deltaL`, which quantises, because the border is measured on
 * its drawn colour. Light step 6 is 0.922 ideal and 0.9218 drawn, and the
 * light border is that step, so an unquantised comparison would miss by 0.0002
 * and put the grid a step stronger than the reference.
 */
function furnitureSteps(
  neutral: Ramp,
  surface: Oklch,
  border: Translucent,
): { grid: RampStep; axis: RampStep } {
  const target = Math.max(deltaL(border, surface), DELINEATION_MIN_DELTA_L)
  const separation = (step: RampStep) => deltaL(neutral[step], surface)
  // The surface's step, found by lightness instead of from `BG_BASE`, so it is
  // also right for a tinted surface, whose step comes from another ramp.
  const last: RampStep = RAMP_LENGTH
  const nearest = RAMP_STEPS.reduce((best, step) =>
    separation(step) < separation(best) ? step : best,
  )

  const grid =
    RAMP_STEPS.find((step) => step > nearest && separation(step) >= target - 1e-9) ?? last
  const axis = RAMP_STEPS.find((step) => step > grid) ?? last
  return { grid, axis }
}

/**
 * Every `--pm-chart-*` value for one mode.
 *
 * Categorical, sequential and diverging come from the wheel. The four neutral
 * roles come from the system's neutral ramp, so a chart matches its page.
 */
export function resolveModeChart(
  theme: Theme,
  mode: Mode,
  colors: ColorRoleValues,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): ChartRoleValues {
  const rotation = chartRotation(theme.seeds)
  const slots = deriveChartSlots(mode, rotation)
  const sequential = deriveChartSequential(mode, rotation)
  const arms = deriveChartDivergingArms(mode)
  const neutral = ramps[mode].neutral
  const surface = opaque(colors['bg.surface'])
  const furniture = furnitureSteps(neutral, surface, parse(colors['border.default']))

  const values: Partial<ChartRoleValues> = {}

  for (const slot of CHART_SLOTS) {
    const derived = slots[slot - 1]
    if (!derived) throw new Error(`chart wheel produced no slot ${slot}`)
    values[chartSlotRole(slot)] = derived.hex
  }
  for (const step of CHART_SEQ_STEPS) {
    const color = sequential[step - 1]
    if (!color) throw new Error(`chart sequential ramp produced no step ${step}`)
    values[chartSeqRole(step)] = toCssColor(color)
  }

  values['chart.other'] = toCssColor(neutral[CHART_OTHER_STEP])
  for (const step of CHART_DIVERGING_ARM_STEPS) {
    const neg = arms.neg[step - 1]
    const pos = arms.pos[step - 1]
    if (!neg || !pos) throw new Error(`chart diverging ladder produced no arm ${step}`)
    values[chartDivergingRole('neg', step)] = toHex(neg)
    values[chartDivergingRole('pos', step)] = toHex(pos)
  }
  values['chart.mid'] = toCssColor(neutral[midStep(mode, furniture)])
  values['chart.grid'] = toCssColor(neutral[furniture.grid])
  values['chart.axis'] = toCssColor(neutral[furniture.axis])

  return values as ChartRoleValues
}

/** Both modes, given the colours the neutral roles are read against. */
export function resolveChart(
  theme: Theme,
  colors: Record<Mode, ColorRoleValues>,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): Record<Mode, ChartRoleValues> {
  return {
    light: resolveModeChart(theme, 'light', colors.light, ramps),
    dark: resolveModeChart(theme, 'dark', colors.dark, ramps),
  }
}

/**
 * The any-neighbour cap. Scatter, small multiples and radar put any two marks
 * side by side, so their limit is the number of leading slots that pass the
 * gates for all pairs. The audit and the resolver share this function, so the
 * law and the sheet use one computation.
 */
export function chartAllPairsCap(hexes: readonly string[]): number {
  let cap = 1
  for (let count = 2; count <= hexes.length; count += 1) {
    let ok = true
    for (let i = 0; i < count && ok; i += 1) {
      for (let j = i + 1; j < count && ok; j += 1) {
        const a = hexes[i] ?? '#000000'
        const b = hexes[j] ?? '#000000'
        if (chartDeltaE(a, b) < CHART_NORMAL_TARGET || chartCvdDeltaE(a, b) < CHART_CVD_TARGET)
          ok = false
      }
    }
    if (!ok) break
    cap = count
  }
  return cap
}

/**
 * The published series cap for one pairing: the value of `--pm-chart-cap`.
 *
 * **The minimum across modes** (`charts-wheel.json`, `seriesCap`), because a
 * chart does not gain a series when the mode changes. One integer per pairing,
 * the same in every mode block, so the inverse borrow never includes it.
 */
export function chartSeriesCap(chart: Record<Mode, ChartRoleValues>): number {
  return Math.min(
    ...MODES.map((mode) =>
      chartAllPairsCap(CHART_SLOTS.map((slot) => chart[mode][chartSlotRole(slot)])),
    ),
  )
}

/* -------------------------------------------------------------------------- */
/* The palette laws, as measurements                                          */
/* -------------------------------------------------------------------------- */

export interface ChartAdjacentPair {
  /** `1-2`, `2-3`, … */
  pair: string
  /** Unsimulated OKLab ΔE x 100. */
  normal: number
  /** The worse of protanopia and deuteranopia. */
  cvd: number
}

export interface ChartSlotMeasurement {
  slot: number
  hex: string
  chroma: number
  lightness: number
  /** WCAG 2.1 contrast ratio against `bg.surface`, the non-text standard. */
  markRatio: number
  /** Outside the mode's lightness band. Soft: recorded, never failed. */
  bandWarn: boolean
  /** Under 3:1 on the surface. Soft, because the table twin carries the data. */
  reliefSlot: boolean
}

export interface ChartAudit {
  mode: Mode
  slots: ChartSlotMeasurement[]
  adjacent: ChartAdjacentPair[]
  worstAdjacentNormal: ChartAdjacentPair
  worstAdjacentCvd: ChartAdjacentPair
  /** How many leading slots pass the gates against *every* other one, not only neighbours. */
  allPairsCap: number
  sequential: {
    hexes: string[]
    monotone: boolean
    minDeltaL: number
    /** Every stop shares slot 1's hue, to a rounding tolerance. */
    singleHue: boolean
    /** First stop passing 2:1 on the surface, where an ordinal ramp may start. */
    ordinalUsableFrom: number
  }
  diverging: {
    /** Arm hexes, outward: index 0 is arm 1 (nearest mid), index 2 the pole. */
    neg: string[]
    mid: string
    pos: string[]
    /**
     * ΔE from each arm to the midpoint, per side, outward. Strictly increasing
     * (hard), and matched per step between sides. The laws state the mismatch
     * bound, because light arm 3 inherits the poles' recorded asymmetry.
     */
    loudnessToMid: { neg: number[]; pos: number[] }
    midChroma: number
    /** Warm above, cool below: arm 3's hues must be on opposite sides of the wheel. */
    opposed: boolean
  }
  /** Hard-gate failures, each already worded as the message a law should print. */
  failures: string[]
}

/**
 * Measures one pairing's chart palette in one mode, from the **emitted
 * strings**, so the law reads what ships, as `auditPairings` does for contrast.
 */
export function auditChartPalette(
  mode: Mode,
  chart: ChartRoleValues,
  colors: ColorRoleValues,
): ChartAudit {
  const surface = opaque(colors['bg.surface'])
  const surfaceHex = toHex(surface)
  const band = CHART_LIGHTNESS_BAND[mode]

  const hexes = CHART_SLOTS.map((slot) => chart[chartSlotRole(slot)])

  const slots: ChartSlotMeasurement[] = CHART_SLOTS.map((slot, index) => {
    const hex = hexes[index] ?? '#000000'
    const color = opaque(hex)
    const markRatio = wcagRatio(color, surface)
    return {
      slot,
      hex,
      chroma: color.c,
      lightness: color.l,
      markRatio,
      bandWarn: color.l < band[0] - 1e-9 || color.l > band[1] + 1e-9,
      reliefSlot: markRatio < CHART_MARK_MIN_RATIO,
    }
  })

  const adjacent: ChartAdjacentPair[] = []
  for (let index = 0; index < hexes.length - 1; index += 1) {
    const a = hexes[index] ?? '#000000'
    const b = hexes[index + 1] ?? '#000000'
    adjacent.push({
      pair: `${index + 1}-${index + 2}`,
      normal: chartDeltaE(a, b),
      cvd: chartCvdDeltaE(a, b),
    })
  }

  const worstAdjacentNormal = adjacent.reduce((worst, row) =>
    row.normal < worst.normal ? row : worst,
  )
  const worstAdjacentCvd = adjacent.reduce((worst, row) => (row.cvd < worst.cvd ? row : worst))

  const allPairsCap = chartAllPairsCap(hexes)

  const seqHexes = CHART_SEQ_STEPS.map((step) => chart[chartSeqRole(step)])
  const seqColors = seqHexes.map(opaque)
  const seqDeltas: number[] = []
  let monotone = true
  const direction = Math.sign((seqColors.at(-1)?.l ?? 0) - (seqColors[0]?.l ?? 0))
  for (let index = 0; index < seqColors.length - 1; index += 1) {
    const from = seqColors[index]
    const to = seqColors[index + 1]
    if (!from || !to) continue
    const delta = to.l - from.l
    if (Math.sign(delta) !== direction) monotone = false
    seqDeltas.push(Math.abs(delta))
  }
  const seqHue = seqColors[0]?.h ?? 0
  // Hex quantisation moves a hue by a fraction of a degree at these chromas.
  // Within a tolerance of three degrees the stops count as one hue.
  const singleHue = seqColors.every((color) => hueDistance(color.h, seqHue) <= 3)
  const firstOrdinal = seqColors.findIndex((color) => wcagRatio(color, surface) >= 2)
  // Past the end when NO stop passes 2:1. The ladder's far end passes in both
  // modes, so this does not happen, but `CHART_SEQ_STEPS.length` would wrongly
  // mark the last stop usable.
  const ordinalUsableFrom = firstOrdinal === -1 ? CHART_SEQ_STEPS.length + 1 : firstOrdinal + 1

  const mid = chart['chart.mid']
  const negArms = CHART_DIVERGING_ARM_STEPS.map((step) => chart[chartDivergingRole('neg', step)])
  const posArms = CHART_DIVERGING_ARM_STEPS.map((step) => chart[chartDivergingRole('pos', step)])
  const loudnessToMid = {
    neg: negArms.map((hex) => chartDeltaE(hex, mid)),
    pos: posArms.map((hex) => chartDeltaE(hex, mid)),
  }
  // Opposition is measured on the poles, the pair a reader compares across zero.
  const negPole = negArms[negArms.length - 1] ?? '#000000'
  const posPole = posArms[posArms.length - 1] ?? '#000000'
  const hueGap = hueDistance(opaque(posPole).h, opaque(negPole).h)

  const failures: string[] = []
  for (const measurement of slots) {
    if (measurement.chroma < CHART_CHROMA_FLOOR - 1e-9) {
      failures.push(
        `slot ${measurement.slot} carries C ${measurement.chroma.toFixed(3)}, under the chroma floor ${CHART_CHROMA_FLOOR}`,
      )
    }
  }
  for (const row of adjacent) {
    if (row.normal < CHART_NORMAL_TARGET) {
      failures.push(
        `slots ${row.pair} separate by ΔE ${row.normal.toFixed(1)}, under the normal-vision floor ${CHART_NORMAL_TARGET}`,
      )
    }
    if (row.cvd < CHART_CVD_FLOOR) {
      failures.push(
        `slots ${row.pair} separate by ΔE ${row.cvd.toFixed(1)} under CVD, below the floor ${CHART_CVD_FLOOR}`,
      )
    }
  }
  if (!monotone) failures.push('the sequential ramp is not monotone in lightness')
  const minSeqDelta = seqDeltas.length > 0 ? Math.min(...seqDeltas) : 0
  if (minSeqDelta < CHART_SEQ_MIN_DELTA_L - 1e-9) {
    failures.push(
      `the sequential ramp steps by ΔL ${minSeqDelta.toFixed(3)}, under ${CHART_SEQ_MIN_DELTA_L}`,
    )
  }
  if (!singleHue) failures.push('the sequential ramp changes hue between stops')
  // A quarter-turn is the loosest "opposed" that still excludes a pair from
  // the same region of the wheel.
  if (hueGap < 90) {
    failures.push(`the diverging arms sit ${hueGap.toFixed(0)}° apart, which is not opposition`)
  }
  for (const [side, loudness] of Object.entries(loudnessToMid)) {
    // Strictly increasing outward, or two magnitudes would share a colour: the
    // sequential monotonicity rule on both sides of zero.
    for (let index = 0; index < loudness.length - 1; index += 1) {
      if ((loudness[index] ?? 0) >= (loudness[index + 1] ?? 0)) {
        failures.push(
          `the ${side} arms' loudness does not step strictly outward from the midpoint ` +
            `(${loudness.map((value) => value.toFixed(1)).join(' → ')})`,
        )
        break
      }
    }
  }
  for (const [side, arms] of [
    ['neg', negArms],
    ['pos', posArms],
  ] as const) {
    // The sequential ΔL floor, reused: each side is a three-stop perceptual
    // ramp, and steps a reader cannot tell apart count as one step.
    for (let index = 0; index < arms.length - 1; index += 1) {
      const delta = Math.abs(
        opaque(arms[index + 1] ?? '#000000').l - opaque(arms[index] ?? '#000000').l,
      )
      if (delta < CHART_SEQ_MIN_DELTA_L - 1e-9) {
        failures.push(
          `the ${side} arms ${index + 1}-${index + 2} step by ΔL ${delta.toFixed(3)}, under ${CHART_SEQ_MIN_DELTA_L}`,
        )
      }
    }
  }

  return {
    mode,
    slots,
    adjacent,
    worstAdjacentNormal,
    worstAdjacentCvd,
    allPairsCap,
    sequential: {
      hexes: seqHexes,
      monotone,
      minDeltaL: minSeqDelta,
      singleHue,
      ordinalUsableFrom,
    },
    diverging: {
      neg: negArms,
      mid,
      pos: posArms,
      loudnessToMid,
      midChroma: opaque(mid).c,
      opposed: hueGap >= 90,
    },
    failures: failures.map((failure) => `${failure} (surface ${surfaceHex})`),
  }
}

export type { ChartSlotDerivation }
