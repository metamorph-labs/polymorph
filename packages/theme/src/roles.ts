/**
 * The colour role catalogue: the semantic layer (`docs/concepts.md`).
 * Application code and vocabulary CSS name only roles. Ramps and steps belong
 * to the colour engine (`color/`).
 *
 * Roles are written out, not generated, so they are greppable and a typo is a
 * type error. `roles.test.ts` checks the status cross-product, as a generator
 * would guarantee.
 */

export const BACKGROUND_ROLES = [
  'bg.app',
  'bg.subtle',
  'bg.surface',
  'bg.raised',
  'bg.overlay',
  'bg.scrim',
  'bg.inverse',
] as const
export type BackgroundRole = (typeof BACKGROUND_ROLES)[number]

/**
 * The backgrounds text may sit on. `bg.scrim` carries no text and `bg.inverse`
 * pairs with `text.inverse`, so neither is in the `text.*` pairings.
 */
export const TEXT_BEARING_BACKGROUNDS = [
  'bg.app',
  'bg.subtle',
  'bg.surface',
  'bg.raised',
  'bg.overlay',
] as const satisfies readonly BackgroundRole[]
export type TextBearingBackground = (typeof TEXT_BEARING_BACKGROUNDS)[number]

export const ACCENT_ROLES = [
  'accent.bg',
  'accent.bgHover',
  'accent.bgActive',
  'accent.subtle',
  'accent.subtleHover',
  /**
   * The third wash step. Without it, soft, ghost and outline controls would
   * have no pressed value, and `:active` would reuse hover (no visible press)
   * or leave the catalogue.
   */
  'accent.subtleActive',
  'accent.text',
  'accent.underline',
  'accent.contrast',
  /**
   * Low-alpha accent for halos and glows. **Decorative only**: a glow must
   * never replace the focus ring (`laws.test.ts` asserts the ring remains
   * without a glow).
   */
  'accent.glow',
] as const
export type AccentRole = (typeof ACCENT_ROLES)[number]

/** The solid accent fills that `accent.contrast` must be legible on. */
export const ACCENT_SOLID_ROLES = [
  'accent.bg',
  'accent.bgHover',
  'accent.bgActive',
] as const satisfies readonly AccentRole[]

export const TEXT_ROLES = [
  'text.primary',
  'text.secondary',
  'text.muted',
  'text.disabled',
  'text.inverse',
] as const
export type TextRole = (typeof TEXT_ROLES)[number]

export const BORDER_ROLES = [
  'border.subtle',
  'border.default',
  'border.strong',
  'border.field',
  'border.focus',
  'border.focusSolid',
] as const
export type BorderRole = (typeof BORDER_ROLES)[number]

export const STATUS_TONES = ['danger', 'warning', 'success', 'info'] as const
export type StatusTone = (typeof STATUS_TONES)[number]

/**
 * Each status family has the accent family's shape: one shape to learn, one
 * contrast law for all fills. Recipes need every variant: a `danger.solid`
 * fill needs hover and active, a soft danger button a hover wash, and a solid
 * fill a lawful label colour. `text.inverse` cannot be that label, because it
 * flips with mode and the fills do not.
 */
export const STATUS_VARIANTS = [
  'solid',
  'solidHover',
  'solidActive',
  'subtle',
  'subtleHover',
  /** The press step of the wash family. */
  'subtleActive',
  'text',
  'border',
  'contrast',
  /** The status colour's halo. Decorative only. */
  'glow',
] as const
export type StatusVariant = (typeof STATUS_VARIANTS)[number]

export const STATUS_ROLES = [
  'danger.solid',
  'danger.solidHover',
  'danger.solidActive',
  'danger.subtle',
  'danger.subtleHover',
  'danger.subtleActive',
  'danger.text',
  'danger.border',
  'danger.contrast',
  'danger.glow',
  'warning.solid',
  'warning.solidHover',
  'warning.solidActive',
  'warning.subtle',
  'warning.subtleHover',
  'warning.subtleActive',
  'warning.text',
  'warning.border',
  'warning.contrast',
  'warning.glow',
  'success.solid',
  'success.solidHover',
  'success.solidActive',
  'success.subtle',
  'success.subtleHover',
  'success.subtleActive',
  'success.text',
  'success.border',
  'success.contrast',
  'success.glow',
  'info.solid',
  'info.solidHover',
  'info.solidActive',
  'info.subtle',
  'info.subtleHover',
  'info.subtleActive',
  'info.text',
  'info.border',
  'info.contrast',
  'info.glow',
] as const
export type StatusRole = (typeof STATUS_ROLES)[number]

/** The solid fills of one status tone, which `{tone}.contrast` must be legible on. */
export function statusSolidRoles(tone: StatusTone): readonly [StatusRole, StatusRole, StatusRole] {
  return [`${tone}.solid`, `${tone}.solidHover`, `${tone}.solidActive`]
}

/**
 * Persistent selection, which is not hover.
 *
 * Selection cannot use `accent.subtle`, the hover wash, or selected and hovered
 * rows would look the same in the nav rail, menu, tab strip and calendar.
 *
 * Not `accent.selected*`, because selection is a state of the surface, not an
 * accent variant. A system may want selection quieter than hover, which would
 * look like a mistake inside the accent family.
 *
 * There are two fills, because a selected part holds one of two things.
 * `selection.bg` holds one label, in `selection.text`, and nothing else: a day,
 * a nav item, a command. An achromatic system draws it as its ink fill, so no
 * other text role can be read on it. `selection.surface` holds content of its
 * own, such as a table row's cells or a bar of actions. It is a wash in every
 * system, and the contrast law holds every text role on it, as on a background.
 */
export const SELECTION_ROLES = [
  'selection.bg',
  'selection.bgHover',
  'selection.text',
  'selection.border',
  'selection.surface',
  'selection.surfaceHover',
] as const
export type SelectionRole = (typeof SELECTION_ROLES)[number]

/** The selected fills that hold content of their own, so every text role is held on them. */
export const SELECTION_SURFACES = [
  'selection.surface',
  'selection.surfaceHover',
] as const satisfies readonly SelectionRole[]

export const COLOR_ROLES = [
  ...BACKGROUND_ROLES,
  ...ACCENT_ROLES,
  ...TEXT_ROLES,
  ...BORDER_ROLES,
  ...STATUS_ROLES,
  ...SELECTION_ROLES,
] as const

export type ColorRole = (typeof COLOR_ROLES)[number]

/** Resolved colours for one mode, filled in by the colour engine. */
export type ColorRoleValues = Record<ColorRole, string>

/**
 * Gradient roles: two-stop values, deliberately kept out of `ColorRole`.
 *
 * A gradient is not a colour: the contrast law cannot nudge it, `culori` cannot
 * parse it, and text over it must be legible at its worst stop. A separate
 * catalogue keeps every colour role one colour and makes the worst-stop rule
 * explicit.
 */
export const GRADIENT_ROLES = [
  /** The solid-fill variant: a brand fill that goes from one hue to another. */
  'accent.gradient',
  /** A page-region wash: large, low-contrast, and carrying text. */
  'bg.wash',
] as const
export type GradientRole = (typeof GRADIENT_ROLES)[number]

/**
 * One resolved gradient. `solid` marks the no-op form: without a partner hue
 * or a pinned stop the role is a plain colour, so recipes never branch on
 * gradients. It is the same in both modes (`gradientPinFault`).
 */
export interface GradientValue {
  from: string
  to: string
  /** What the emitter writes: `linear-gradient(...)`, or the colour when solid. */
  css: string
  solid: boolean
  /** The direction in degrees, CSS convention: 0 points up, 90 right. */
  angle: number
  /** The colour stops `css` is drawn from, `at` from 0 to 1. A solid has two equal stops. */
  stops: readonly GradientStop[]
}

export interface GradientStop {
  color: string
  at: number
}

export type GradientRoleValues = Record<GradientRole, GradientValue>

/**
 * The colour role a gradient starts from, and collapses to when the theme seeds
 * no partner hue and pins no stop.
 */
export const GRADIENT_BASE: Record<GradientRole, ColorRole> = {
  'accent.gradient': 'accent.bg',
  'bg.wash': 'bg.app',
}

/**
 * Chart roles, kept out of `ColorRole` because **none is a (ramp, step)
 * pair.** A slot is a chart wheel step with its own repair loop and gates
 * (`chart-laws.test.ts`). The contrast nudge must never move it, because that
 * would break the adjacent-slot separation the wheel is tuned for.
 *
 * Still a **role family**, not per-component tokens: series colour is shared
 * by the whole product, and charts are its first consumer, not its owner
 * (`docs/charts.md`).
 */
export const CHART_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type ChartSlot = (typeof CHART_SLOTS)[number]

export const CHART_SEQ_STEPS = [1, 2, 3, 4, 5, 6, 7] as const
export type ChartSeqStep = (typeof CHART_SEQ_STEPS)[number]

/**
 * The diverging arms: three steps per side, arm 1 nearest the midpoint, arm 3
 * the pole. There must never be a separate `chart.neg`/`chart.pos` role,
 * because two names for one step is drift.
 */
export const CHART_DIVERGING_SIDES = ['neg', 'pos'] as const
export type ChartDivergingSide = (typeof CHART_DIVERGING_SIDES)[number]

export const CHART_DIVERGING_ARM_STEPS = [1, 2, 3] as const
export type ChartDivergingArmStep = (typeof CHART_DIVERGING_ARM_STEPS)[number]

export const CHART_ROLES = [
  // Identity. Numbers, because a series has no semantic name, following the
  // common `--chart-N` convention (`--chart-N` <-> `--pm-chart-N`).
  'chart.1',
  'chart.2',
  'chart.3',
  'chart.4',
  'chart.5',
  'chart.6',
  'chart.7',
  'chart.8',
  /** The folded tail, and every series but the emphasised one. */
  'chart.other',
  // Magnitude: one hue, light to dark.
  'chart.seq.1',
  'chart.seq.2',
  'chart.seq.3',
  'chart.seq.4',
  'chart.seq.5',
  'chart.seq.6',
  'chart.seq.7',
  // Polarity around zero, three arms per side. `mid` is neutral grey and means
  // exactly zero. Values near zero use arm 1.
  'chart.neg.1',
  'chart.neg.2',
  'chart.neg.3',
  'chart.mid',
  'chart.pos.1',
  'chart.pos.2',
  'chart.pos.3',
  // Grid and axis.
  'chart.grid',
  'chart.axis',
] as const

export type ChartRole = (typeof CHART_ROLES)[number]
export type ChartRoleValues = Record<ChartRole, string>

export function chartSlotRole(slot: ChartSlot): ChartRole {
  return `chart.${slot}`
}

export function chartSeqRole(step: ChartSeqStep): ChartRole {
  return `chart.seq.${step}`
}

export function chartDivergingRole(
  side: ChartDivergingSide,
  step: ChartDivergingArmStep,
): ChartRole {
  return `chart.${side}.${step}`
}

export const COLOR_ROLE_GROUPS = {
  background: BACKGROUND_ROLES,
  accent: ACCENT_ROLES,
  text: TEXT_ROLES,
  border: BORDER_ROLES,
  status: STATUS_ROLES,
  selection: SELECTION_ROLES,
} as const satisfies Record<string, readonly ColorRole[]>

export type ColorRoleGroup = keyof typeof COLOR_ROLE_GROUPS

const ROLE_SET: ReadonlySet<string> = new Set(COLOR_ROLES)

export function isColorRole(value: string): value is ColorRole {
  return ROLE_SET.has(value)
}

export function statusRole(tone: StatusTone, variant: StatusVariant): StatusRole {
  return `${tone}.${variant}`
}
