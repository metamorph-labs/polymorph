import { clampChroma, converter, formatHex } from 'culori'

import type { ChromaBudget } from '../seeds'
import type { Mode } from '../theme'

/**
 * Twelve-step OKLCH ramps with fixed step meanings. Every colour is a
 * (ramp, step) pair, so a re-theme is a data edit, not a code search.
 */

export const RAMP_LENGTH = 12

export type RampStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export const RAMP_STEPS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
] as const satisfies readonly RampStep[]

/** What each step is for. Consumers choose by meaning, never by eye. */
export const RAMP_SEMANTICS: Record<RampStep, string> = {
  1: 'app background',
  2: 'subtle background',
  3: 'component rest',
  4: 'component hover',
  5: 'component active',
  6: 'border subtle',
  7: 'border default',
  8: 'border strong',
  9: 'solid fill',
  10: 'solid fill hover',
  11: 'solid fill active / low-contrast text',
  12: 'high-contrast text',
}

export interface Oklch {
  l: number
  c: number
  h: number
}

export type Ramp = Readonly<Record<RampStep, Oklch>>

/**
 * Tuned values (TUNED-IN), not derived ones. Light descends towards text, dark
 * ascends. Tests assert monotonicity, not these exact numbers.
 *
 * The ladders are deliberately not mirror images. On white, APCA gives four
 * usable text steps (9-12). On near-black light-on-dark contrast rises more
 * slowly, so the dark ladder compresses its surfaces (1-5) to give 9-12 room
 * for three levels of text and three of border. Its thresholds, on the
 * lightest dark surface:
 * Lc 75 needs L >= 0.87, Lc 60 needs L >= 0.79, Lc 45 needs L >= 0.70,
 * Lc 15 needs L >= 0.48.
 */
/**
 * **The light ladder matches the reference exactly**, so the reference's
 * inputs give the reference. It holds the reference's values at the steps the
 * shared role map reads. Every number is the reference's or an interpolation
 * between two of them:
 *
 * | step | L | what the reference calls it |
 * | --- | --- | --- |
 * | 1 | **1** | `--background` / `--card` / `--popover`: the page background |
 * | 2 | **0.985** | `--sidebar` (and its `--primary-foreground`) |
 * | 3 | **0.97** | `--muted` / `--secondary` / `--accent` |
 * | 4–5 | 0.955 / 0.94 | the two wash steps between the wash and the border |
 * | 6 | **0.922** | `--border` / `--input`, and dark's `--primary` |
 * | 7–8 | 0.88 / 0.83 | the stronger border steps, and disabled text |
 * | 9–11 | 0.62 / 0.588 / **0.556** | solid fills, ending on `--muted-foreground` |
 * | 12 | **0.145** | `--foreground`: the darkest text |
 *
 * Dark steps 1 / 3 / 12 are the reference's `--background`, `--card` and
 * `--foreground`, and the text end reaches its 0.985. Dark borders are white
 * with alpha, off the ladder (see `role-map.ts`). Dark secondary text stays at
 * the Lc 60 floor, not the reference's 0.708: matching it would lower a text
 * floor, which is never done.
 */
export const LIGHTNESS_LADDER: Record<Mode, readonly number[]> = {
  light: [1, 0.985, 0.97, 0.955, 0.94, 0.922, 0.88, 0.83, 0.62, 0.588, 0.556, 0.145],
  dark: [0.145, 0.175, 0.205, 0.245, 0.285, 0.33, 0.4, 0.5, 0.68, 0.76, 0.84, 0.985],
}

/**
 * Chroma peaks at the solid-fill steps and falls towards both ends, so
 * near-white and near-black surfaces look like tinted neutrals.
 * TUNED-IN
 */
export const CHROMA_CURVE: readonly number[] = [
  0.08, 0.12, 0.2, 0.26, 0.32, 0.4, 0.5, 0.7, 1, 1, 0.72, 0.42,
]

/**
 * Neutrals keep their tint almost constant, so they stay one family to the ends.
 */
export const NEUTRAL_CHROMA_CURVE: readonly number[] = [
  0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1, 1, 1, 0.85, 0.65,
]

/**
 * The tint a `tinted` theme gives its surfaces, far below the accent's chroma so
 * they look like warm or cool neutrals, not pale brand colour.
 * TUNED-IN
 */
export const SURFACE_TINT_CHROMA = {
  /**
   * Under the `none` chroma budget there is no accent hue, so
   * `colorStrategy: 'tinted'` keeps its lightness shift and gets no tint, with
   * no special case.
   */
  none: 0,
  ink: 0.008,
  low: 0.012,
  medium: 0.016,
  high: 0.022,
} as const satisfies Record<ChromaBudget, number>

/**
 * OKLCH hues for the status ramps (`docs/theming.md`). Warning is 75, not a
 * yellower 85, because yellow-greens turn olive at the shared solid-fill
 * lightness and a mustard warning looks broken. 75 stays amber at every step.
 * TUNED-IN
 */
export const STATUS_HUES = { danger: 25, warning: 75, success: 150, info: 240 } as const

/**
 * Status chroma relative to the accent's budget. Green looks stronger than red
 * and blue at equal chroma, so it is reduced. Warning keeps the full budget, or
 * amber looks tan at the hue above.
 * TUNED-IN
 */
export const STATUS_CHROMA_HARMONY = {
  danger: 1,
  warning: 1,
  success: 0.82,
  info: 0.95,
} as const

const toRgb = converter('rgb')

function nth(values: readonly number[], index: number, fallback: number): number {
  return values[index] ?? fallback
}

function stepAt(index: number): RampStep {
  return RAMP_STEPS[Math.min(RAMP_LENGTH - 1, Math.max(0, index))] ?? 12
}

/** Move a step by `delta`, saturating at the ends of the ramp. */
export function shiftStep(step: RampStep, delta: number): RampStep {
  return stepAt(step - 1 + Math.round(delta))
}

/** Bring a colour inside the sRGB gamut by reducing chroma, never lightness. */
export function gamutMap(color: Oklch): Oklch {
  const clamped = clampChroma({ mode: 'oklch', ...color }, 'oklch', 'rgb')
  return { l: clamped.l ?? color.l, c: clamped.c ?? 0, h: clamped.h ?? color.h }
}

export function toHex(color: Oklch): string {
  return formatHex({ mode: 'oklch', ...gamutMap(color) })
}

/** sRGB channels 0-255, rounded exactly as the emitted hex will be. */
export function toChannels(color: Oklch): [number, number, number] {
  const rgb = toRgb({ mode: 'oklch', ...gamutMap(color) })
  return [Math.round(rgb.r * 255), Math.round(rgb.g * 255), Math.round(rgb.b * 255)]
}

/**
 * Emitted CSS value. Opaque colours are hex, so the browser draws exactly what
 * the contrast law verified. Translucent ones use `rgb(… / a)`.
 */
export function toCssColor(color: Oklch, alpha = 1): string {
  if (alpha >= 1) return toHex(color)
  const [r, g, b] = toChannels(color)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

function buildRamp(make: (step: RampStep) => Oklch): Ramp {
  return {
    1: make(1),
    2: make(2),
    3: make(3),
    4: make(4),
    5: make(5),
    6: make(6),
    7: make(7),
    8: make(8),
    9: make(9),
    10: make(10),
    11: make(11),
    12: make(12),
  }
}

/**
 * A ramp is a lightness ladder (fixed per mode) with a chroma curve (scaled by
 * the budget) at one hue. Dark mode uses the dark ladder, never an inversion.
 */
export function generateRamp(
  hue: number,
  peakChroma: number,
  mode: Mode,
  curve: readonly number[] = CHROMA_CURVE,
): Ramp {
  const ladder = LIGHTNESS_LADDER[mode]
  return buildRamp((step) => {
    const index = step - 1
    return gamutMap({
      l: nth(ladder, index, 0.5),
      c: peakChroma * nth(curve, index, 0),
      h: ((hue % 360) + 360) % 360,
    })
  })
}

/** Grey, carrying a trace of the accent hue (`docs/theming.md`). */
export function generateNeutralRamp(hue: number, tint: number, mode: Mode): Ramp {
  return generateRamp(hue, tint, mode, NEUTRAL_CHROMA_CURVE)
}
