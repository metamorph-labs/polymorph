import type { Axes, ContrastTemperament, Depth } from '../axes'
import type { ColorRole, StatusTone } from '../roles'
import type { ChromaBudget } from '../seeds'
import type { Mode } from '../theme'
import { shiftStep, type RampStep } from './ramp'

/**
 * Role -> (ramp, step). This table is the system's colour design: a changed row
 * changes every screen. Nothing downstream may choose a step.
 */

export const RAMP_NAMES = [
  'neutral',
  /** Neutral with a stronger accent tint. Used only by `tinted` themes. */
  'tinted',
  'accent',
  /**
   * The gradient partner, at `gradientHue` if seeded, else `accentHue`. The
   * ramp always exists, and without a partner hue the two stops are identical.
   */
  'gradient',
  'danger',
  'warning',
  'success',
  'info',
] as const
export type RampName = (typeof RAMP_NAMES)[number]

/**
 * `ladder` pins a role to one mode's lightness ladder regardless of the mode
 * being resolved. Only the solid brand fills use it (see `SOLID_LADDER`).
 */
export interface StepRef {
  ramp: RampName
  step: RampStep
  ladder?: Mode
}

export type RoleSource =
  | ({ kind: 'step'; alpha?: number } & StepRef)
  /** Picks the candidate most legible on `against`. A derived decision. */
  | { kind: 'bestOn'; against: ColorRole; candidates: readonly StepRef[] }
  /**
   * The first lawful colour from two lists of candidates, a derived decision
   * as `bestOn` is. `both` are pinned to one ladder, so each is one colour in
   * either mode: the first that passes every pairing the role is held to in
   * both modes is taken, and the role is one colour, as the solid fills are.
   * Where none does, the first of `either` that passes in this mode. When
   * nothing passes, the last of `either`, which the contrast law then nudges
   * or refuses.
   */
  | { kind: 'firstLawful'; both: readonly StepRef[]; either: readonly StepRef[] }
  /**
   * The focus ring's colour in an ink system, the only role allowed off the
   * ladder.
   *
   * The ladder has no grey between the APCA dead zone it skips and the steps
   * text uses, and nothing is read on a ring, so the ink ring resolves at
   * `RING_LIGHTNESS`, tinted like the palette's neutrals.
   */
  | { kind: 'ring'; alpha?: number }

export type RoleMap = Record<ColorRole, RoleSource>

/**
 * Solid brand fills are the same in both modes. This is a design law.
 *
 * APCA has a dead zone around L 0.68-0.76 where neither black nor white
 * reaches Lc 60. The dark ladder's steps 9-11 (0.68 / 0.76 / 0.84) cross it,
 * so no single label colour is legible across rest, hover and active. The
 * light ladder's 9-11 (0.62 / 0.588 / 0.556) are well on the white-label side.
 *
 * So the accent and status fills come from the light ladder in both modes, and
 * only their surroundings change per mode. (Radix does the same: its step 9 is
 * the same hue in both scales.)
 *
 * The one exception is the ink budget: `chromaBudget: 'none'` has no hue to
 * pin, so its accent fills invert (see `INK_FILL` below).
 */
export const SOLID_LADDER: Mode = 'light'

type FillLevel = 'rest' | 'hover' | 'active'

/**
 * The ink budget's accent fills: **the only exception to `SOLID_LADDER`.**
 *
 * `chromaBudget: 'none'` has no hue, so the accent family comes from the
 * neutral ramp. A neutral fill is ink, a foreground colour, so it inverts with
 * the mode. Pinning suits a hue but not ink: a black button on a black page is
 * invisible. Only this budget is affected, and nothing else reads this table.
 *
 * The fill for each mode comes from the other mode's existing ladder steps,
 * because a light theme's text colour is a dark theme's background. Light uses
 * the dark ladder's 3/2/1 (L 0.205 / 0.175 / 0.145), dark uses the light
 * ladder's 6/7/8 (L 0.922 / 0.88 / 0.83).
 *
 * The dark rest step is 6 because the reference's light `--border` and dark
 * `--primary` are both `oklch(0.922 0 0)`. One step serves both, so the ink
 * fill and the borders match the reference together or not at all.
 *
 * In both modes the fill darkens when pressed, like the hued ladder's
 * 9 → 10 → 11. The inversion changes where a fill starts, not its direction.
 */
const INK_FILL: Record<Mode, { ladder: Mode } & Record<FillLevel, RampStep>> = {
  light: { ladder: 'dark', rest: 3, hover: 2, active: 1 },
  dark: { ladder: 'light', rest: 6, hover: 7, active: 8 },
}

/** A hued accent fill uses the pinned solid steps: rest, hover, pressed. */
const ACCENT_SOLID_STEPS: Record<FillLevel, RampStep> = { rest: 9, hover: 10, active: 11 }

/**
 * The two colours a label on an ink fill may use: paper (light) and ink
 * (dark). `accent.contrast` stays a derived choice (`bestOn`), so the switch
 * from paper in light mode to ink in dark mode follows from legibility instead
 * of being stated in a second table that could disagree.
 *
 * **Both poles are the dark ladder's ends.** The ink pole is the light-mode
 * fill's step. The paper pole is the dark ladder's text end, L 0.985, not the
 * light ladder's white step 1, so a label does not look like a hole through
 * the fill. The reference agrees: `--primary-foreground` is 0.985 and
 * `--background` is 1.
 */
const INK_POLES: readonly StepRef[] = [
  { ramp: 'neutral', step: 12, ladder: 'dark' },
  { ramp: 'neutral', step: 3, ladder: 'dark' },
]

interface TemperamentTuning {
  textPrimary: RampStep
  textSecondary: RampStep
  textMuted: RampStep
  /** Extra distance between the page and the surfaces sitting on it. */
  bgSpread: number
  borderShift: number
  /**
   * The deepest light step an achromatic system's selected surface may take
   * (see `inkSelectedStep`). Soft's secondary and muted text are a step
   * lighter than the others', and they cannot be read on step 6: muted text
   * falls under 3:1, and no nudge inside the budget brings secondary text to
   * its floor.
   */
  inkSelectedDeepest: RampStep
}

/**
 * Every temperament keeps primary text at step 12. Softness goes in the
 * supporting roles (lighter secondary and muted text, fainter borders, closer
 * surfaces). (At step 11 the law would have to nudge primary a whole ladder
 * step, more than the nudge budget, so resolution would throw.)
 * TUNED-IN
 */
const TEMPERAMENT_TUNING: Record<ContrastTemperament, TemperamentTuning> = {
  soft: {
    textPrimary: 12,
    textSecondary: 10,
    textMuted: 9,
    bgSpread: 0,
    borderShift: -1,
    inkSelectedDeepest: 5,
  },
  standard: {
    textPrimary: 12,
    textSecondary: 11,
    textMuted: 10,
    bgSpread: 0,
    borderShift: 0,
    inkSelectedDeepest: 6,
  },
  stark: {
    textPrimary: 12,
    textSecondary: 11,
    textMuted: 10,
    bgSpread: 1,
    borderShift: 1,
    inkSelectedDeepest: 6,
  },
}

/**
 * Flat strengthens its borders, its only separation. `borders` does not: a
 * hairline-first system needs more borders, not stronger ones, and the
 * reference draws its many borders faintly. Otherwise temperament sets border
 * strength, which gives terminal its stark edges while plain stays quiet.
 */
const DEPTH_BORDER_SHIFT: Record<Depth, number> = { flat: 1, borders: 0, elevated: 0, glass: 0 }

/**
 * The opacity of `border.focus`, the half-alpha focus role, exported because
 * the law suite reads it.
 */
export const FOCUS_RING_ALPHA = 0.5

/**
 * The ink ring's lightness per mode: the reference's two ring greys (oklch
 * 0.556 and 0.708), swapped. The reference draws its ring at half alpha, 0.708
 * on a light page and 0.556 on a dark one, where neither reaches the focus
 * floor as a solid 2px line (2.56:1 on white). Swapped, each is the darker
 * grey on a light page and the lighter on a dark one, and each meets 3:1 on
 * every background and wash of the shipped ink pairings, with room to spare:
 * the light mode passes up to L 0.61 and the dark mode from L 0.67. Hue and
 * chroma come from the neutral seed, so zinc's ring is slightly cool.
 */
export const RING_LIGHTNESS: Record<'light' | 'dark', number> = {
  light: 0.556,
  dark: 0.708,
}

/**
 * The inline link's resting underline strength, by temperament. The underline
 * is the non-colour signal accessibility requires in running text, and the law
 * forbids removing it. Full strength is only the browser default, so at rest
 * it uses the link colour at this strength and goes to full on hover, like the
 * thickness. Soft is faint. Standard is half, as with `FOCUS_RING_ALPHA`: a
 * visible line that does not compete with the text. Stark does not soften it.
 */
export const TEMPERAMENT_UNDERLINE_ALPHA: Record<ContrastTemperament, number> = {
  soft: 0.4,
  standard: 0.5,
  stark: 1,
}

/**
 * The scrim's strength by mode, before the depth boost. The scrim law in
 * `laws.test.ts` holds what the result must do in every pairing: it never
 * lightens the page, the page's body text behind it falls below the
 * secondary-text floor, and the panel stays as far from the scrimmed page as
 * from the page.
 */
const SCRIM_ALPHA: Record<Mode, number> = { light: 0.4, dark: 0.6 }

/**
 * The darkest end of the neutral ramp: step 12 in light and step **1** in dark,
 * because the dark ladder runs the other way.
 *
 * Step 12 in both modes would give dark themes a near-white scrim at 0.6 that
 * brightens the page behind a dialog. `bg.inverse` does use step 12 in both
 * modes, because an inverse surface should flip with the mode and a scrim
 * should not.
 */
const SCRIM_STEP: Record<Mode, RampStep> = { light: 12, dark: 1 }

/** A flat theme has no elevation cue behind a dialog, so its scrim is stronger. */
const DEPTH_SCRIM_BOOST: Record<Depth, number> = { flat: 0.1, borders: 0.05, elevated: 0, glass: 0 }

/**
 * Glow strength by depth. Without shadows a halo is flat's only separation
 * cue, so flat glows strongest. `elevated` already has shadow, so its halo
 * only adds colour.
 */
// Glass matches elevated, because material and shadow provide the separation.
const GLOW_ALPHA: Record<Depth, number> = { flat: 0.28, borders: 0.22, elevated: 0.16, glass: 0.16 }

interface BackgroundSteps {
  app: RampStep
  subtle: RampStep
  surface: RampStep
  raised: RampStep
  overlay: RampStep
}

/**
 * Light: surfaces are lightest and shadow shows elevation, so the three surface
 * levels share step 1 and spread moves the page down. Dark: elevation is
 * lightness (`docs/theming.md`), so each level is one step higher, and
 * `bg.subtle` is above `bg.app`. Separate derivation, not inversion.
 */
/**
 * **The light page is white**, not a half-step below the card. The depth axis
 * separates panels: `borders` draws the reference's edge, `elevated` casts a
 * shadow, `flat` moves its borders up a step. `app` and `surface` share step 1,
 * and a stark temperament's `bgSpread` moves the page down to make panels stand
 * out.
 */
const BG_BASE: Record<Mode, BackgroundSteps> = {
  light: { app: 1, subtle: 3, surface: 1, raised: 1, overlay: 1 },
  dark: { app: 1, subtle: 2, surface: 3, raised: 4, overlay: 5 },
}

interface BorderSteps {
  subtle: RampStep
  default: RampStep
  strong: RampStep
}

/**
 * Dark borders are a step higher than light ones. The dark ladder's lower end
 * is compressed, so a step-7 border fails the Lc 15 floor against
 * `bg.overlay`, and the nudge would push `border.default` past `border.strong`.
 * Placing them correctly avoids the repair.
 */
/**
 * The reference's borders are faint lines that group content. Mid-grey dark
 * borders would be the most prominent thing on screen. Temperament moves the
 * whole zone (stark +1 keeps terminal's edges). Depth moves it only for flat
 * (see DEPTH_BORDER_SHIFT).
 */
const BORDER_BASE: Record<Mode, BorderSteps> = {
  // Step 6 is the reference's `--border`, L 0.922, at the default position with
  // no shift. An Lc 15 floor would nudge it three steps darker. The floor is in
  // ΔL instead (`DELINEATION_MIN_DELTA_L`), and 0.922 passes.
  light: { subtle: 5, default: 6, strong: 7 },
  /**
   * In dark mode only status and selection edges use these steps. Neutral
   * borders are off the ladder (see `DARK_BORDER_ALPHA`).
   */
  dark: { subtle: 5, default: 7, strong: 8 },
}

/**
 * **Dark borders are white with alpha, not a grey.**
 *
 * On the neutral ladder the Lc 15 floor would push dark borders to step 7
 * (L 0.40), three steps heavier than the reference. The reference draws
 * **white at low alpha** (`--border: oklch(1 0 0 / 10%)`, `--input: … / 15%`).
 * So the role resolves to the top of the **light** ladder at an alpha and
 * composites over its surface. That is why the contrast code composites
 * before measuring: measured as opaque, a 10% white hairline is white.
 *
 * The alpha ladder is indexed like the step ladder, so `borderShift` still
 * moves the whole zone with the same arithmetic.
 *
 * Light borders stay opaque steps. Dark borders are white at an alpha, because
 * on a light page a border is a darker colour and in dark mode it is light
 * showing through. Modes are derived separately, not inverted (see `BG_BASE`).
 */
const DARK_BORDER_ALPHA: readonly number[] = [0.04, 0.06, 0.1, 0.15, 0.22]

/** Where each level starts on the alpha ladder: the reference's 6% / 10% / 15%. */
const DARK_BORDER_ALPHA_BASE: Record<keyof BorderSteps, number> = {
  subtle: 1,
  default: 2,
  strong: 3,
}

/** The colour of a dark border: the light ladder's step 1, at an alpha. */
const DARK_BORDER_SOURCE: StepRef = { ramp: 'neutral', step: 1, ladder: 'light' }

function darkBorderAlpha(level: keyof BorderSteps, shift: number): number {
  const index = clamp(
    DARK_BORDER_ALPHA_BASE[level] + Math.round(shift),
    0,
    DARK_BORDER_ALPHA.length - 1,
  )
  return DARK_BORDER_ALPHA[index] ?? 0.1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * How many steps past the mode's deepest background an achromatic system's
 * selected surface sits (see `selection.surface`).
 *
 * The light ladder's first five steps are 0.015 apart in lightness. One step
 * past the hover fill is a second pale grey that a reader cannot tell from the
 * hover fill beside it, so light takes two. The dark ladder's steps are 0.03
 * or more apart, and one is enough.
 */
const INK_SELECTED_SHIFT: Record<Mode, number> = { light: 2, dark: 1 }

/**
 * The step of an achromatic system's selected surface.
 *
 * The wash bears text in every role, so in light mode it goes no deeper than
 * the temperament's text can be read on (`inkSelectedDeepest`). It is always
 * at least one step past the deepest background. Where the bound leaves it one
 * step from the hover fill, it differs from the hover fill by one ladder step
 * only: a soft temperament on a tinted system, whose hover fill is at step 4.
 */
function inkSelectedStep(mode: Mode, deepest: RampStep, tuning: TemperamentTuning): RampStep {
  const wanted = shiftStep(deepest, INK_SELECTED_SHIFT[mode])
  if (mode === 'dark') return wanted
  const bounded = Math.min(wanted, tuning.inkSelectedDeepest) as RampStep
  return Math.max(bounded, shiftStep(deepest, 1)) as RampStep
}

/**
 * The least lightness difference, in OKLCH, between an achromatic system's
 * selected surface and each background. Exported because the law suite reads
 * it.
 *
 * One step of the light ladder, 0.015, is under the floor, and two are over
 * it. The law therefore fails a selected surface one step from the hover fill.
 */
export const INK_SELECTED_MIN_DELTA_L = 0.025

function backgroundSteps(mode: Mode, spread: number, tinted: boolean): BackgroundSteps {
  const base = BG_BASE[mode]
  if (mode === 'light') {
    // sRGB has almost no chroma at L 0.99, so a tint at step 1 clamps to white.
    // Tinted light surfaces start one step down, where the tint survives.
    const tint = tinted ? 1 : 0
    return {
      app: shiftStep(base.app, spread + tint),
      subtle: shiftStep(base.subtle, spread + tint),
      surface: shiftStep(base.surface, tint),
      raised: shiftStep(base.raised, tint),
      overlay: shiftStep(base.overlay, tint),
    }
  }
  return {
    ...base,
    raised: shiftStep(base.raised, spread),
    overlay: shiftStep(base.overlay, spread),
  }
}

export function buildRoleMap(axes: Axes, mode: Mode, chromaBudget: ChromaBudget): RoleMap {
  const tuning = TEMPERAMENT_TUNING[axes.contrastTemperament]

  // Under `none` the accent family is ink from the neutral ramp, so the table
  // needs the budget too, not only the ramps.
  const isInk = chromaBudget === 'none'
  const inkFill = INK_FILL[mode]

  // `quiet` uses the accent only on interactive parts. `tinted` also tints
  // surfaces at low chroma.
  const isTinted = axes.colorStrategy === 'tinted'
  const surfaceRamp: RampName = isTinted ? 'tinted' : 'neutral'

  const bg = backgroundSteps(mode, tuning.bgSpread, isTinted)
  /** An achromatic system's selected surface (see `selection.surface` below). */
  const inkSurface: RoleSource = {
    kind: 'step',
    ramp: surfaceRamp,
    step: inkSelectedStep(
      mode,
      Math.max(bg.app, bg.subtle, bg.surface, bg.raised, bg.overlay) as RampStep,
      tuning,
    ),
  }
  /**
   * -1..1 in both modes. The dark alpha ladder's faintest step (4%) is still
   * visible, so soft can thin its edges in dark mode too.
   */
  const borderShift = clamp(tuning.borderShift + DEPTH_BORDER_SHIFT[axes.depth], -1, 1)
  const borderBase = BORDER_BASE[mode]

  const neutral = (step: RampStep): RoleSource => ({ kind: 'step', ramp: 'neutral', step })
  const accent = (step: RampStep): RoleSource => ({ kind: 'step', ramp: 'accent', step })
  /**
   * Neutral borders: a ladder step in light, white at an alpha in dark (see
   * `DARK_BORDER_ALPHA`).
   */
  const border = (level: keyof BorderSteps): RoleSource =>
    mode === 'dark'
      ? { kind: 'step', ...DARK_BORDER_SOURCE, alpha: darkBorderAlpha(level, borderShift) }
      : { kind: 'step', ramp: 'neutral', step: shiftStep(borderBase[level], borderShift) }

  /** Saturated fills: same colour in both modes (see `SOLID_LADDER`). */
  const solid = (ramp: RampName, step: RampStep): RoleSource => ({
    kind: 'step',
    ramp,
    step,
    ladder: SOLID_LADDER,
  })

  /**
   * The accent's fills, the only family the budget can remove hue from. With a
   * hue this is `solid`. Under `none` it is ink from the neutral ramp, which
   * inverts with the mode (see `INK_FILL`). Status fills always use `solid`:
   * their chroma floor at `low` guarantees a hue to pin.
   */
  const accentSolid = (level: FillLevel): RoleSource =>
    isInk
      ? { kind: 'step', ramp: 'neutral', step: inkFill[level], ladder: inkFill.ladder }
      : solid('accent', ACCENT_SOLID_STEPS[level])

  /** The pole most legible on an accent fill: paper or ink. */
  const accentContrast = (against: ColorRole): RoleSource => ({
    kind: 'bestOn',
    against,
    candidates: isInk
      ? INK_POLES
      : [
          { ramp: 'neutral', step: 1, ladder: SOLID_LADDER },
          { ramp: 'neutral', step: 12, ladder: SOLID_LADDER },
        ],
  })

  const status = (tone: StatusTone, step: RampStep): RoleSource => ({
    kind: 'step',
    ramp: tone,
    step,
  })
  /**
   * Glow: the solid fill at low alpha, so a halo matches its element. Pinned to
   * `SOLID_LADDER` like the fills, because a halo that changed with the mode
   * would look like a different signal.
   */
  const glow = (ramp: RampName, alpha = GLOW_ALPHA[axes.depth]): RoleSource => ({
    kind: 'step',
    ramp,
    step: 9,
    ladder: SOLID_LADDER,
    alpha,
  })
  /**
   * A status edge is a step at its own hue in both modes. The alpha form is for
   * faint neutral hairlines. A danger border is a signal and would look grey as
   * white alpha.
   */
  const statusBorder = (tone: StatusTone): RoleSource => ({
    kind: 'step',
    ramp: tone,
    step: shiftStep(borderBase.default, borderShift),
  })
  /** Mirrors `accent.contrast`: the pole most legible on the tone's fill. */
  const statusContrast = (tone: StatusTone): RoleSource => ({
    kind: 'bestOn',
    against: `${tone}.solid`,
    candidates: [
      { ramp: 'neutral', step: 1, ladder: SOLID_LADDER },
      { ramp: 'neutral', step: 12, ladder: SOLID_LADDER },
    ],
  })

  return {
    'bg.app': neutral(bg.app),
    'bg.subtle': { kind: 'step', ramp: surfaceRamp, step: bg.subtle },
    'bg.surface': { kind: 'step', ramp: surfaceRamp, step: bg.surface },
    'bg.raised': { kind: 'step', ramp: surfaceRamp, step: bg.raised },
    'bg.overlay': { kind: 'step', ramp: surfaceRamp, step: bg.overlay },
    'bg.scrim': {
      kind: 'step',
      ramp: 'neutral',
      step: SCRIM_STEP[mode],
      alpha: clamp(SCRIM_ALPHA[mode] + DEPTH_SCRIM_BOOST[axes.depth], 0, 1),
    },
    'bg.inverse': neutral(12),

    'accent.bg': accentSolid('rest'),
    'accent.bgHover': accentSolid('hover'),
    'accent.bgActive': accentSolid('active'),
    // No branch needed: under `none` the accent ramp is the neutral ramp
    // (`generateRamps`), so these resolve to the surfaces' wash steps.
    'accent.subtle': accent(3),
    'accent.subtleHover': accent(4),
    'accent.subtleActive': accent(5),
    // An achromatic system has no link colour, so accent text is primary text.
    'accent.text': isInk ? neutral(tuning.textPrimary) : accent(11),
    /**
     * The resting underline: `accent.text` at the temperament's strength (see
     * `TEMPERAMENT_UNDERLINE_ALPHA`). A colour role, so it is derived once and
     * the delineation law can check it on every pairing.
     */
    'accent.underline': isInk
      ? {
          kind: 'step',
          ramp: 'neutral',
          step: tuning.textPrimary,
          alpha: TEMPERAMENT_UNDERLINE_ALPHA[axes.contrastTemperament],
        }
      : {
          kind: 'step',
          ramp: 'accent',
          step: 11,
          alpha: TEMPERAMENT_UNDERLINE_ALPHA[axes.contrastTemperament],
        },
    'accent.contrast': accentContrast('accent.bg'),
    /**
     * No halo under `none`. The role resolves to transparent, so
     * `box-shadow: 0 0 0 4px var(--pm-accent-glow)` draws nothing, not a grey
     * smudge, and no recipe branches on the budget. The focus ring is
     * `border.focus` and is not affected.
     */
    'accent.glow': glow('accent', isInk ? 0 : GLOW_ALPHA[axes.depth]),

    'text.primary': neutral(tuning.textPrimary),
    'text.secondary': neutral(tuning.textSecondary),
    'text.muted': neutral(tuning.textMuted),
    // Exempt from the contrast law, because disabled must look unavailable.
    'text.disabled': neutral(8),
    'text.inverse': neutral(1),

    'border.subtle': border('subtle'),
    'border.default': border('default'),
    'border.strong': border('strong'),
    /**
     * The interactive edge: the reference's `--input`, equal to its `--border`
     * only in light mode (both #e5e5e5; in dark, white/15% against white/10%).
     * Hairlines are hard to see on dark surfaces and an input's edge must stay
     * visible, so fields use the default step in light and the strong alpha in
     * dark. Field recipes (Input through Checkbox) use this. Cards, separators
     * and toasts stay on `border.default`.
     */
    'border.field': mode === 'dark' ? border('strong') : border('default'),
    /**
     * The focus colour at half alpha: the reference's half-alpha ring.
     *
     * Nothing in the vocabulary draws in it: the focus ring is a solid line in
     * `border.focusSolid`. The role stays a token and a pin, held to its own
     * floor (`FOCUS_MIN_DELTA_L`), for a palette that pins the pair and for a
     * part an application draws in a translucent focus colour. An ink system's
     * role uses the off-ladder `ring` kind (`RING_LIGHTNESS`), as the solid one
     * does.
     */
    'border.focus': isInk
      ? { kind: 'ring', alpha: FOCUS_RING_ALPHA }
      : { kind: 'step', ramp: 'accent', step: 9, ladder: SOLID_LADDER, alpha: FOCUS_RING_ALPHA },
    /**
     * The focus ring's colour, at full strength. The shared convention draws
     * the ring in it at `focus.width` (`design/components/README.md`, the focus
     * ring), so the colour carries the line, and the contrast law holds it to
     * 3:1 by the WCAG ratio on every background and wash it is drawn on
     * (`FOCUS_MIN_RATIO`). A hued system starts at the accent's solid, step 9
     * on the solid ladder, and moves along that ladder, steps 10 to 12, to the
     * first step that passes in both modes, so the ring is one colour in
     * either mode, as the fills beside it are. A stark system's dark washes
     * can leave no such step, and then each mode moves from step 9 along its
     * own ladder, which darkens in light mode and lightens in dark mode, away
     * from the backgrounds. An ink system uses the `ring` grey, whose
     * lightness is chosen to pass. A filled part draws the ring in its own
     * label colour instead, which the label laws hold on its fill.
     */
    'border.focusSolid': isInk
      ? { kind: 'ring' }
      : {
          kind: 'firstLawful',
          both: ([9, 10, 11, 12] as const).map((step) => ({
            ramp: 'accent' as const,
            step,
            ladder: SOLID_LADDER,
          })),
          either: [
            { ramp: 'accent', step: 9, ladder: SOLID_LADDER },
            { ramp: 'accent', step: 10 },
            { ramp: 'accent', step: 11 },
            { ramp: 'accent', step: 12 },
          ],
        },

    // Each status family has the accent family's shape at its own hue: pinned
    // solid fills at steps 9 -> 10 -> 11, washes 3 -> 4, step-11 text, a border
    // on the border ladder and a contrast pole chosen for legibility.
    'danger.solid': solid('danger', 9),
    'danger.solidHover': solid('danger', 10),
    'danger.solidActive': solid('danger', 11),
    'danger.subtle': status('danger', 3),
    'danger.subtleHover': status('danger', 4),
    'danger.subtleActive': status('danger', 5),
    'danger.text': status('danger', 11),
    'danger.border': statusBorder('danger'),
    'danger.contrast': statusContrast('danger'),
    'danger.glow': glow('danger'),
    'warning.solid': solid('warning', 9),
    'warning.solidHover': solid('warning', 10),
    'warning.solidActive': solid('warning', 11),
    'warning.subtle': status('warning', 3),
    'warning.subtleHover': status('warning', 4),
    'warning.subtleActive': status('warning', 5),
    'warning.text': status('warning', 11),
    'warning.border': statusBorder('warning'),
    'warning.contrast': statusContrast('warning'),
    'warning.glow': glow('warning'),
    'success.solid': solid('success', 9),
    'success.solidHover': solid('success', 10),
    'success.solidActive': solid('success', 11),
    'success.subtle': status('success', 3),
    'success.subtleHover': status('success', 4),
    'success.subtleActive': status('success', 5),
    'success.text': status('success', 11),
    'success.border': statusBorder('success'),
    'success.contrast': statusContrast('success'),
    'success.glow': glow('success'),
    'info.solid': solid('info', 9),
    'info.solidHover': solid('info', 10),
    'info.solidActive': solid('info', 11),
    'info.subtle': status('info', 3),
    'info.subtleHover': status('info', 4),
    'info.subtleActive': status('info', 5),
    'info.text': status('info', 11),
    'info.border': statusBorder('info'),
    'info.contrast': statusContrast('info'),
    'info.glow': glow('info'),

    // Selection is quieter than hover, so a selected row does not outweigh the
    // row under the pointer. It sits one step below the hover wash, with its
    // own text and border.
    //
    // Under `none` that fails arithmetically: `accent(3)` is the step
    // `bg.subtle` already uses, so a wash would leave the row unchanged. An
    // achromatic system selects with its ink fill instead, and the label
    // inverts with it, like `accent.contrast`.
    'selection.bg': isInk ? accentSolid('rest') : accent(3),
    'selection.bgHover': isInk ? accentSolid('hover') : accent(4),
    'selection.text': isInk ? accentContrast('selection.bg') : accent(11),
    // The border ladder at the accent hue, strong position. A selected row's
    // edge acts like a status edge, and the default position barely reaches the
    // Lc 15 floor over `bg.overlay` in dark mode. It is the one border allowed a
    // step above the neutral borders.
    'selection.border': {
      kind: 'step',
      ramp: 'accent',
      step: shiftStep(borderBase.strong, borderShift),
    },
    // A selected surface that holds content of its own. With a hue it is the
    // selection wash, which every text role can be read on.
    //
    // Under `none` it cannot be the ink fill, because a row's cells hold text
    // in every role, and controls. It is a wash past the deepest background of
    // the mode (`INK_SELECTED_SHIFT`), so a selected row is a visible step from
    // the surface it sits on and from the hover fill, `bg.subtle`. It has no
    // deeper hover step: secondary text is at its floor on this one.
    'selection.surface': isInk ? inkSurface : accent(3),
    'selection.surfaceHover': isInk ? inkSurface : accent(4),
  }
}
