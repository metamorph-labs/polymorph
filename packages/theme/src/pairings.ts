import {
  ACCENT_SOLID_ROLES,
  STATUS_TONES,
  statusSolidRoles,
  TEXT_BEARING_BACKGROUNDS,
  type ColorRole,
  type GradientRole,
  SELECTION_SURFACES,
} from './roles'

/**
 * The contrast law, as data (`docs/theming.md`): every lawful (foreground,
 * background) pair with its APCA Lc floor. The colour engine enforces it in
 * `resolveTheme`, and `laws.test.ts` checks every system × palette × mode.
 *
 * APCA `Lc` is signed (positive dark-on-light, negative light-on-dark). Floors
 * are magnitudes; checkers compare `Math.abs(Lc)`.
 */

export interface Pairing {
  foreground: ColorRole
  background: ColorRole
  /**
   * Minimum |Lc| under APCA. **0 for the delineation class**, which uses
   * `minDeltaL` because APCA does not score hairlines (see
   * `DELINEATION_MIN_DELTA_L`).
   */
  minLc: number
  /**
   * Minimum |ΔL| in OKLCH, on the composite, so a translucent border is
   * measured as drawn. Delineation class only.
   */
  minDeltaL?: number
  kind: 'text' | 'delineation'
  reason: string
}

/** APCA guidance, expressed as the floors this system enforces. */
export const LC_FLOORS = {
  /** Body text and anything a user must read comfortably. */
  bodyText: 75,
  /** Secondary text: less prominent, still readable. */
  secondaryText: 60,
  /** Muted text: timestamps, hints. Below this floor text is only decoration. */
  mutedText: 45,
  /** Foreground on a solid fill (button labels). */
  onSolid: 60,
} as const

/**
 * **Delineation is measured in ΔL, not APCA.**
 *
 * An APCA border floor of `Lc 15` fails on the flagship's reference at once
 * (arithmetic in `pairings.test.ts`):
 *
 * - the reference's light `--border` (L 0.922) scores **Lc 12.9** on its own
 *   background, which would nudge our border three steps darker;
 * - on the reference's wash (L 0.97) it scores **Lc 0.0**;
 * - the reference's dark `--border` (white at 10%) scores **Lc 0.0** on every
 *   dark surface.
 *
 * APCA clips below |Lc| ≈ 8 to exactly zero, because it models text and a
 * hairline is not text. So delineation uses **ΔL in OKLCH**, which still
 * distinguishes them.
 *
 * The floor is the reference's smallest delineation rounded down: its border
 * on its wash differs by ΔL 0.048, so **0.04**. Text floors stay in APCA, so
 * this keeps hairlines at the reference's weight without affecting body text.
 */
export const DELINEATION_MIN_DELTA_L = 0.04

/**
 * **The focus floor: twice the hairline floor, in the same measure.**
 *
 * A focus indicator is a line, so APCA scores it as poorly as a border, and
 * the reference's half-alpha ring scores close to zero on dark surfaces. ΔL
 * measures it. Its floor is twice the hairline's, because the indicator
 * must stand out from the borders it is drawn beside, not merely match them.
 * Both focus roles are held to it on every surface, whichever field style
 * (`overrides.focus.field`) draws them, and a pinned focus colour is held like
 * a derived one.
 */
export const FOCUS_MIN_DELTA_L = DELINEATION_MIN_DELTA_L * 2

/** Whether a pairing is measured in ΔL instead of APCA Lc. */
export function isDelineation(pairing: Pairing): boolean {
  return pairing.kind === 'delineation'
}

function delineationPairings(
  foreground: ColorRole,
  reason: string,
  minDeltaL = DELINEATION_MIN_DELTA_L,
): readonly Pairing[] {
  return TEXT_BEARING_BACKGROUNDS.map((background) => ({
    foreground,
    background,
    minLc: 0,
    minDeltaL,
    kind: 'delineation' as const,
    reason,
  }))
}

function textPairings(foreground: ColorRole, minLc: number, reason: string): readonly Pairing[] {
  return TEXT_BEARING_BACKGROUNDS.map((background) => ({
    foreground,
    background,
    minLc,
    kind: 'text' as const,
    reason,
  }))
}

export const LAWFUL_PAIRINGS: readonly Pairing[] = [
  ...textPairings('text.primary', LC_FLOORS.bodyText, 'primary body copy'),
  ...textPairings('text.secondary', LC_FLOORS.secondaryText, 'subordinate copy'),
  ...textPairings('text.muted', LC_FLOORS.mutedText, 'hints, metadata'),
  ...textPairings('accent.text', LC_FLOORS.secondaryText, 'links and accent labels'),
  // The inline link's resting underline is a 1px line, so it takes the hairline
  // floor. That limits `TEMPERAMENT_UNDERLINE_ALPHA`: faint, never invisible.
  ...delineationPairings('accent.underline', 'the inline link’s rest underline'),

  // `[data-tone="inverse"]` switches to the opposite mode, so this pair must be
  // lawful for any inverted subtree to be.
  {
    foreground: 'text.inverse',
    background: 'bg.inverse',
    minLc: LC_FLOORS.bodyText,
    kind: 'text',
    reason: 'inverse-tone body copy',
  },

  ...ACCENT_SOLID_ROLES.map((background): Pairing => ({
    foreground: 'accent.contrast',
    background,
    minLc: LC_FLOORS.onSolid,
    kind: 'text',
    reason: 'label on a solid accent fill',
  })),

  // The accent part of the soft-control rule below, without which the most-used
  // soft variant (Button `soft`/`accent` and its hover wash) would be unchecked.
  {
    foreground: 'accent.text',
    background: 'accent.subtle',
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: 'accent text on its own subtle surface',
  },
  {
    foreground: 'accent.text',
    background: 'accent.subtleHover',
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: 'accent text on its hovered subtle surface',
  },

  ...STATUS_TONES.map((tone): Pairing => ({
    foreground: `${tone}.text`,
    background: `${tone}.subtle`,
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: `${tone} text on its own subtle surface`,
  })),

  // A soft status control keeps its text while hovered (the Button recipes).
  ...STATUS_TONES.map((tone): Pairing => ({
    foreground: `${tone}.text`,
    background: `${tone}.subtleHover`,
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: `${tone} text on its hovered subtle surface`,
  })),

  // Labels on solid status fills in every state, as for `accent.contrast`.
  ...STATUS_TONES.flatMap((tone) =>
    statusSolidRoles(tone).map((background): Pairing => ({
      foreground: `${tone}.contrast`,
      background,
      minLc: LC_FLOORS.onSolid,
      kind: 'text',
      reason: `label on a solid ${tone} fill`,
    })),
  ),

  // The pressed step, so a soft control stays legible when pressed.
  {
    foreground: 'accent.text',
    background: 'accent.subtleActive',
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: 'accent text on its pressed subtle surface',
  },
  ...STATUS_TONES.map((tone): Pairing => ({
    foreground: `${tone}.text`,
    background: `${tone}.subtleActive`,
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: `${tone} text on its pressed subtle surface`,
  })),

  // A selected row holds text people read, in both its states.
  {
    foreground: 'selection.text',
    background: 'selection.bg',
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: 'label on a selected surface',
  },
  {
    foreground: 'selection.text',
    background: 'selection.bgHover',
    minLc: LC_FLOORS.secondaryText,
    kind: 'text',
    reason: 'label on a selected surface being pointed at',
  },

  // A selected surface holds content of its own, so every text role is held on
  // it at the floor it has on a background.
  ...SELECTION_SURFACES.flatMap((background): Pairing[] => [
    {
      foreground: 'text.primary',
      background,
      minLc: LC_FLOORS.bodyText,
      kind: 'text',
      reason: 'primary copy on a selected surface',
    },
    {
      foreground: 'text.secondary',
      background,
      minLc: LC_FLOORS.secondaryText,
      kind: 'text',
      reason: 'subordinate copy on a selected surface',
    },
    {
      foreground: 'text.muted',
      background,
      minLc: LC_FLOORS.mutedText,
      kind: 'text',
      reason: 'hints and metadata on a selected surface',
    },
    {
      foreground: 'accent.text',
      background,
      minLc: LC_FLOORS.secondaryText,
      kind: 'text',
      reason: 'links and accent labels on a selected surface',
    },
  ]),

  ...delineationPairings('border.default', 'a border must separate from the surface it sits on'),

  ...delineationPairings(
    'selection.border',
    'a selection edge must separate from the surface it sits on',
  ),

  // The two focus colours: the ring drawn around a part (translucent, so it is
  // composited before it is measured) and the solid edge a focused field takes.
  ...delineationPairings(
    'border.focus',
    'the focus ring must stand out from the surface it is drawn on',
    FOCUS_MIN_DELTA_L,
  ),
  ...delineationPairings(
    'border.focusSolid',
    'a focused edge must stand out from the surface it is drawn on',
    FOCUS_MIN_DELTA_L,
  ),
]

/**
 * The gradient half of the contrast law.
 *
 * **Text over a gradient is measured at its worst stop**, because a label that
 * fails at one end is illegible for part of its width. That is why gradients
 * are a separate catalogue (`GRADIENT_ROLES`), not colour roles the nudge
 * loop could silently adjust.
 *
 * Stops are the ends of a straight OKLCH interpolation, so for any monotonic
 * contrast measure the worst point is an end, and measuring the ends measures
 * the whole gradient.
 */
export interface GradientPairing {
  foreground: ColorRole
  background: GradientRole
  minLc: number
  reason: string
}

export const LAWFUL_GRADIENT_PAIRINGS: readonly GradientPairing[] = [
  {
    foreground: 'accent.contrast',
    background: 'accent.gradient',
    minLc: LC_FLOORS.onSolid,
    reason: 'label on a gradient brand fill — legible at both ends or at neither',
  },
  {
    foreground: 'text.primary',
    background: 'bg.wash',
    minLc: LC_FLOORS.bodyText,
    reason: 'body copy over a page wash',
  },
  {
    foreground: 'text.secondary',
    background: 'bg.wash',
    minLc: LC_FLOORS.secondaryText,
    reason: 'subordinate copy over a page wash',
  },
  {
    foreground: 'text.muted',
    background: 'bg.wash',
    minLc: LC_FLOORS.mutedText,
    reason: 'hints and metadata over a page wash',
  },
]

export function gradientPairingId(pairing: GradientPairing): string {
  return `${pairing.foreground} on ${pairing.background}`
}

export interface PairingExemption {
  role: ColorRole
  reason: string
}

/**
 * Exemptions are listed, not omitted, so each is a visible decision and a
 * missing row is an oversight.
 */
export const PAIRING_EXEMPTIONS: readonly PairingExemption[] = [
  {
    role: 'text.disabled',
    reason:
      'Disabled controls are exempt from contrast minimums (WCAG 1.4.3 incidental-text ' +
      'exemption, industry standard). Legibility here would defeat the affordance: ' +
      'disabled must read as unavailable.',
  },
]

const EXEMPT: ReadonlySet<ColorRole> = new Set(PAIRING_EXEMPTIONS.map((e) => e.role))

export function isExemptFromContrast(role: ColorRole): boolean {
  return EXEMPT.has(role)
}

/** Stable identifier for a pairing, used in failure messages and gallery keys. */
export function pairingId(pairing: Pairing): string {
  return `${pairing.foreground} on ${pairing.background}`
}

/** Every pairing a given role is part of. Used by the `/tokens` swatches. */
export function pairingsInvolving(role: ColorRole): readonly Pairing[] {
  return LAWFUL_PAIRINGS.filter((p) => p.foreground === role || p.background === role)
}
