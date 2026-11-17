import { z } from 'zod'

import type { ColorRole } from './roles'

/**
 * Seeds: the brand inputs a tenant supplies (`docs/theming.md`): hue, neutral
 * temperature, chroma budget, font families. The axes decide how the system
 * looks; the seeds supply its colours and fonts.
 */

/**
 * `ink` is for an accent that looks like ink, a warm near-neutral fill, as a
 * document system wants. `low`'s 0.09 peak is a muted colour: at that chroma an
 * accent sits with the harmonized status colours, and hue alone is not enough
 * to keep their meanings apart. At ink's 0.035 no status colour is close.
 *
 * `none` is **the ink budget**: not a quieter `ink`, but no hue at all. At
 * peak 0 the accent family derives from the ends of the *neutral* ramp (see
 * `role-map.ts`, `INK_FILL`). The order is a chroma scale,
 * none < ink < low < medium < high, and `seeds.test.ts` checks that
 * `CHROMA_BUDGET_PEAK` increases along it.
 */
export const CHROMA_BUDGETS = ['none', 'ink', 'low', 'medium', 'high'] as const
export type ChromaBudget = (typeof CHROMA_BUDGETS)[number]
export const chromaBudgetSchema = z.enum(CHROMA_BUDGETS)

export const FONT_ROLES = ['body', 'display', 'mono'] as const
export type FontRole = (typeof FONT_ROLES)[number]

/**
 * Neutrals carry a trace of the accent hue (`docs/theming.md`), at most 3%
 * chroma, above which they stop looking neutral.
 */
export const MAX_NEUTRAL_TINT = 0.03

/**
 * The fallback class a family uses before its webfont loads.
 *
 * `typePersonality` alone cannot express a serif display over a sans body, the
 * most common pairing. The class belongs to the family, so it is seeded with
 * the family name.
 */
export const FALLBACK_CLASSES = ['sans', 'serif', 'mono'] as const
export type FallbackClass = (typeof FALLBACK_CLASSES)[number]

export const fontSpecSchema = z.strictObject({
  family: z.string().min(1),
  /** When omitted, the personality's default class applies. */
  fallback: z.enum(FALLBACK_CLASSES).optional(),
  /**
   * The slot's font-style, a property of the chosen face like its fallback
   * class. Only the display derivation reads it. Body and mono stay upright by
   * convention, not by schema.
   */
  style: z.enum(['normal', 'italic']).optional(),
})
export type FontSpec = z.infer<typeof fontSpecSchema>

export const fontFamiliesSchema = z.strictObject({
  body: fontSpecSchema,
  display: fontSpecSchema,
  mono: fontSpecSchema,
})

export type FontFamilies = z.infer<typeof fontFamiliesSchema>

/**
 * Exported because a palette seeds three hues and a pairing's seeds are the
 * palette's fields plus the system's fonts, so both schemas share it.
 */
export const hueSchema = z.number().min(0).max(360)
export const neutralTintSchema = z.number().min(0).max(MAX_NEUTRAL_TINT)

/**
 * The roles a palette may pin to an exact colour: the accent fills, the label
 * on them, and the focus pair. A brand that owns its primary button's colour
 * states it here instead of in application CSS. A pin replaces the derived
 * value after derivation (`color/resolve.ts`), the contrast law never moves
 * it, and admission measures it like any derived value (`admit.ts`).
 */
export const PIN_ROLES = [
  'accent.bg',
  'accent.bgHover',
  'accent.bgActive',
  'accent.contrast',
  'border.focus',
  'border.focusSolid',
] as const satisfies readonly ColorRole[]
export type PinRole = (typeof PIN_ROLES)[number]

const OPAQUE_PIN = /^#[0-9a-fA-F]{6}$/
const TRANSLUCENT_PIN = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (0?\.\d{1,2})\)$/

/**
 * A fill or a label is opaque, because the contrast law measures a background
 * as drawn and composites only a foreground.
 */
const opaquePinSchema = z
  .string()
  .regex(OPAQUE_PIN, 'a pinned fill or label is an opaque #rrggbb colour')

/**
 * The ring may also be translucent, as the derived ring is, in the form the
 * engine emits. Two decimals of alpha are enough for a ring, and every native
 * emitter prints them exactly.
 */
const ringPinSchema = z.string().refine((value) => {
  if (OPAQUE_PIN.test(value)) return true
  const match = TRANSLUCENT_PIN.exec(value)
  return match !== null && [match[1], match[2], match[3]].every((channel) => Number(channel) <= 255)
}, 'the pinned ring is #rrggbb, or rgb(r g b / a) with channels 0–255 and alpha below 1 to two decimals')

export const modePinsSchema = z.strictObject({
  'accent.bg': opaquePinSchema.optional(),
  'accent.bgHover': opaquePinSchema.optional(),
  'accent.bgActive': opaquePinSchema.optional(),
  'accent.contrast': opaquePinSchema.optional(),
  'border.focus': ringPinSchema.optional(),
  'border.focusSolid': opaquePinSchema.optional(),
})
export type ModePins = z.infer<typeof modePinsSchema>

/** Pins per mode. A mode it omits keeps every derived value. */
export const pinsSchema = z.strictObject({
  light: modePinsSchema.optional(),
  dark: modePinsSchema.optional(),
})
export type Pins = z.infer<typeof pinsSchema>

/**
 * A pin as the stylesheet writes it: hex in lower case, a translucent ring in
 * the engine's `rgb(r g b / a)` form. The audit re-reads the emitted string, so
 * the value measured is the value written.
 */
export function pinnedColor(value: string): string {
  const match = TRANSLUCENT_PIN.exec(value)
  if (match === null) return value.toLowerCase()
  return `rgb(${Number(match[1])} ${Number(match[2])} ${Number(match[3])} / ${Number(match[4])})`
}

export const seedsSchema = z.strictObject({
  /** OKLCH hue angle, degrees. */
  accentHue: hueSchema,
  /**
   * The partner hue for gradient roles. **Usually absent**, which is normal:
   * every gradient role then resolves to a solid colour, so recipes need no
   * branch.
   */
  gradientHue: hueSchema.optional(),
  /**
   * The neutral ramp's hue, when it is not the accent's.
   *
   * Without it, warm neutrals under a cool accent are impossible, because the
   * neutral ramp otherwise uses `accentHue`.
   */
  neutralHue: hueSchema.optional(),
  /** OKLCH chroma mixed into the neutral ramp. */
  neutralTint: neutralTintSchema,
  chromaBudget: chromaBudgetSchema,
  /** Exact colours for the roles in `PIN_ROLES`, per mode. Usually absent. */
  pins: pinsSchema.optional(),
  fonts: fontFamiliesSchema,
})

export type Seeds = z.infer<typeof seedsSchema>

/** Peak chroma at ramp steps 9-10, before per-hue gamut clamping. */
export const CHROMA_BUDGET_PEAK: Record<ChromaBudget, number> = {
  /** Exactly zero. The accent ramp is a grey ramp. */
  none: 0,
  ink: 0.035,
  low: 0.09,
  medium: 0.15,
  high: 0.21,
}

/**
 * Status colours harmonize toward a budget, never below legibility.
 *
 * The four status families take the theme's chroma so they match the accent.
 * Under `ink` that would scale status to 0.035, near-grey, and a warning must
 * still look like a warning. Status carries information, so its chroma has a
 * floor at `low`.
 *
 * `none` follows the same rule: a palette with no accent hue still ships four
 * coloured status families. `none` applies to the accent only.
 */
export const STATUS_CHROMA_FLOOR = CHROMA_BUDGET_PEAK.low

export function statusPeakOf(seeds: Seeds): number {
  return Math.max(CHROMA_BUDGET_PEAK[seeds.chromaBudget], STATUS_CHROMA_FLOOR)
}

/** The neutral ramp's hue: the seeded one, or else the accent's. */
export function neutralHueOf(seeds: Seeds): number {
  return seeds.neutralHue ?? seeds.accentHue
}

/**
 * Whether gradient roles have two stops or one colour. The derivation and the
 * laws share it, so "no partner hue means solid" is defined once.
 *
 * Under `none` the answer is no even with a partner hue: both stops would be
 * the same grey, a `linear-gradient` that costs bytes and draws a solid. So an
 * achromatic palette need not omit the field.
 */
export function hasGradient(seeds: Seeds): boolean {
  return seeds.chromaBudget !== 'none' && seeds.gradientHue !== undefined
}

/**
 * `"Plus Jakarta Sans Variable"` -> `@fontsource-variable/plus-jakarta-sans`;
 * `"IBM Plex Mono"` -> `@fontsource/ibm-plex-mono`.
 *
 * Applies Fontsource's naming convention. A `Variable` suffix selects the
 * variable packages; without it, the static ones, so static-only faces are
 * allowed. It sits with the font seeds because admission (`admit.ts`) uses it
 * to tell a guest application what to install, and the registry imports it
 * instead of keeping a copy.
 */
export function fontPackage(family: string): string {
  const variable = /\s+Variable$/.test(family)
  const slug = family
    .replace(/\s+Variable$/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
  return `${variable ? '@fontsource-variable' : '@fontsource'}/${slug}`
}
