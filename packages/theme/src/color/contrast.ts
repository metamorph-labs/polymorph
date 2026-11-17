import { converter } from 'culori'

import { lightnessContrast, screenLuminance } from './apca'
import { toChannels, type Oklch } from './ramp'

/**
 * APCA, applied to the rounded sRGB channels instead of the ideal OKLCH values,
 * so the number the law checks matches what a browser renders.
 */

const toOklch = converter('oklch')

/**
 * A colour that may be translucent, since a `RoleSource` can carry alpha.
 */
export interface Translucent extends Oklch {
  /** 1 (or absent) is opaque. */
  alpha?: number
}

/**
 * **Alpha is included in the measurement.**
 *
 * The dark borders in `LAWFUL_PAIRINGS` are white at 6-15%. Measured as opaque,
 * a barely visible 10% white hairline would pass every floor. So a translucent
 * foreground is composited over its background first, in the rounded sRGB
 * channels a browser blends in.
 *
 * The background is taken as drawn. A translucent one would need to know what
 * is behind it, which a pairing does not state. No lawful pairing has one
 * (`bg.scrim` carries no text); one that adds it must state what is behind.
 */
function fromChannels(r: number, g: number, b: number): Oklch {
  const painted = toOklch({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
  if (!painted) throw new Error('cannot read back composited channels')
  return { l: painted.l, c: painted.c, h: painted.h ?? 0 }
}

/**
 * The colour as drawn: gamut-mapped and rounded to 8-bit channels. Everything
 * here measures this, so the enforcement loop and the audit of the emitted
 * string agree on every floor.
 */
export function quantize(color: Oklch): Oklch {
  const [r, g, b] = toChannels(color)
  return fromChannels(r, g, b)
}

export function composite(foreground: Translucent, background: Oklch): Oklch {
  const alpha = foreground.alpha ?? 1
  if (alpha >= 1) return quantize(foreground)
  const [fr, fg, fb] = toChannels(foreground)
  const [br, bg, bb] = toChannels(background)
  const mix = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha))
  return fromChannels(mix(fr, br), mix(fg, bg), mix(fb, bb))
}

/** Signed APCA Lc: positive for dark-on-light, negative for light-on-dark. */
export function apcaLc(foreground: Translucent, background: Oklch): number {
  return lightnessContrast(
    screenLuminance(toChannels(composite(foreground, background))),
    screenLuminance(toChannels(background)),
  )
}

/** The magnitude of Lc, which every floor in `LAWFUL_PAIRINGS` is stated in. */
export function contrast(foreground: Translucent, background: Oklch): number {
  return Math.abs(apcaLc(foreground, background))
}

/**
 * OKLCH lightness difference on the composite, the **delineation** measure
 * (see `DELINEATION_MIN_DELTA_L` in `pairings.ts`). APCA models text and clips
 * to 0 below |Lc| ≈ 8, reporting zero for clearly visible hairlines. ΔL still
 * separates them.
 */
export function deltaL(foreground: Translucent, background: Oklch): number {
  return Math.abs(composite(foreground, background).l - quantize(background).l)
}

/**
 * Which way to move a foreground for contrast: further in the direction it
 * already differs. Ties go towards the farther end of the lightness range, so
 * a nudge always has room.
 */
export function contrastDirection(foreground: Oklch, background: Oklch): -1 | 1 {
  if (foreground.l < background.l) return -1
  if (foreground.l > background.l) return 1
  return background.l > 0.5 ? -1 : 1
}

/**
 * WCAG 2.1's contrast ratio, the other standard.
 *
 * The law uses APCA (`docs/theming.md`), which models perception better,
 * especially in dark mode. Auditors run WCAG 2.1 AA, and the two disagree, so
 * the difference is measured: `laws.test.ts` holds body text to both and
 * limits the disagreement to supporting roles.
 */
export function wcagRatio(foreground: Oklch, background: Oklch): number {
  const light = relativeLuminance(foreground)
  const dark = relativeLuminance(background)
  const [high, low] = light > dark ? [light, dark] : [dark, light]
  return (high + 0.05) / (low + 0.05)
}

/** WCAG 2.1 (SC 1.4.3) relative luminance, from the same rounded channels APCA uses. */
function relativeLuminance(color: Oklch): number {
  const [r, g, b] = toChannels(color).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
