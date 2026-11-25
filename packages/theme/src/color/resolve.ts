import { converter } from 'culori'

import {
  isDelineation,
  isFocus,
  LAWFUL_GRADIENT_PAIRINGS,
  LAWFUL_PAIRINGS,
  pairingId,
  pairingMeasure,
  type GradientPairing,
  type Pairing,
} from '../pairings'
import {
  GRADIENT_BASE,
  GRADIENT_ROLES,
  type ColorRole,
  type ColorRoleValues,
  type GradientRole,
  type GradientRoleValues,
} from '../roles'
import type { Depth } from '../axes'
import { GLASS_SURFACE_MIX } from '../derive'
import {
  CHROMA_BUDGET_PEAK,
  hasGradient,
  neutralHueOf,
  PIN_ROLES,
  pinnedColor,
  statusPeakOf,
  type ModePins,
  type PinRole,
  type Seeds,
} from '../seeds'
import type { Mode, Theme } from '../theme'
import {
  composite,
  contrast,
  contrastDirection,
  deltaL,
  wcagRatio,
  type Translucent,
} from './contrast'
import {
  gamutMap,
  generateNeutralRamp,
  generateRamp,
  STATUS_CHROMA_HARMONY,
  STATUS_HUES,
  SURFACE_TINT_CHROMA,
  toCssColor,
  type Oklch,
  type Ramp,
} from './ramp'
import { buildRoleMap, type RampName, type RoleMap, type StepRef, RING_LIGHTNESS } from './role-map'

/**
 * Seeds + axes -> every colour role, in both modes, with the contrast law
 * enforced. The tenant test (`docs/verification.md`) relies on it: arbitrary
 * brand input gives accessible output with no designer involved.
 */

/** How far a foreground may be moved before the theme is declared unlawful. */
export const MAX_NUDGE = 0.08
export const NUDGE_STEP = 0.01

/**
 * A translucent role gains separation by becoming **more opaque**, never by
 * changing colour: the dark borders are white at 6-15%, so lightness cannot
 * move. One 0.02 step per round bounds the loop, as `NUDGE_STEP` does for
 * opaque roles.
 */
export const ALPHA_NUDGE_STEP = 0.02

const toOklch = converter('oklch')

export type Ramps = Record<RampName, Ramp>

export function generateRamps(seeds: Seeds, mode: Mode): Ramps {
  const peak = CHROMA_BUDGET_PEAK[seeds.chromaBudget]
  // Status has a chroma floor at `low`: it carries information, so an ink
  // budget does not grey it.
  const statusPeak = statusPeakOf(seeds)
  // The neutral hue can be seeded separately; otherwise it is the accent hue.
  const neutralHue = neutralHueOf(seeds)
  const neutral = generateNeutralRamp(neutralHue, seeds.neutralTint, mode)
  /**
   * The ink budget: the accent family derives from the neutral ramp.
   *
   * At peak 0 an accent ramp at `accentHue` is already grey, but the neutral
   * ramp has `neutralTint` at `neutralHue`. Without this, a warm-neutral
   * palette would put a pure grey accent wash next to warm surfaces. Under
   * `none` both come from one ramp.
   */
  const achromatic = seeds.chromaBudget === 'none'
  return {
    neutral,
    tinted: generateNeutralRamp(neutralHue, SURFACE_TINT_CHROMA[seeds.chromaBudget], mode),
    accent: achromatic ? neutral : generateRamp(seeds.accentHue, peak, mode),
    // Always generated, at the accent hue without a partner, so a gradient
    // without a partner hue is a solid colour with no special case.
    gradient: achromatic ? neutral : generateRamp(seeds.gradientHue ?? seeds.accentHue, peak, mode),
    danger: generateRamp(STATUS_HUES.danger, statusPeak * STATUS_CHROMA_HARMONY.danger, mode),
    warning: generateRamp(STATUS_HUES.warning, statusPeak * STATUS_CHROMA_HARMONY.warning, mode),
    success: generateRamp(STATUS_HUES.success, statusPeak * STATUS_CHROMA_HARMONY.success, mode),
    info: generateRamp(STATUS_HUES.info, statusPeak * STATUS_CHROMA_HARMONY.info, mode),
  }
}

interface WorkingColor {
  oklch: Oklch
  alpha: number
}

export class ContrastLawError extends Error {
  constructor(
    readonly pairing: Pairing,
    readonly achieved: number,
    readonly themeName: string,
    readonly mode: Mode,
  ) {
    const measure = pairingMeasure(pairing, {
      lc: achieved,
      deltaL: achieved,
      ratio: achieved,
    })
    super(
      `${themeName} (${mode}): ${pairingId(pairing)} reached ${measure}. ` +
        `Nudging the foreground by up to ${MAX_NUDGE} lightness ` +
        `was not enough — the ramp steps behind these roles are too close together.`,
    )
    this.name = 'ContrastLawError'
  }
}

/** The working value as it is drawn: the colour plus its alpha. */
function painted(color: WorkingColor): Translucent {
  return { ...color.oklch, alpha: color.alpha }
}

/** The WCAG contrast ratio of a foreground as drawn: composited over its background first. */
export function ratioOn(foreground: Translucent, background: Oklch): number {
  return wcagRatio(composite(foreground, background), background)
}

/** What a pairing achieved, in the measure its class is stated in. */
export function measurePairing(
  pairing: Pairing,
  foreground: Translucent,
  background: Oklch,
): number {
  if (isDelineation(pairing)) return deltaL(foreground, background)
  if (isFocus(pairing)) return ratioOn(foreground, background)
  return contrast(foreground, background)
}

/** Whether it passed its floor, in whichever measure its class uses. */
export function pairingPasses(
  pairing: Pairing,
  foreground: Translucent,
  background: Oklch,
): boolean {
  if (isDelineation(pairing)) return deltaL(foreground, background) >= (pairing.minDeltaL ?? 0)
  if (isFocus(pairing)) return ratioOn(foreground, background) >= (pairing.minRatio ?? 0)
  return contrast(foreground, background) >= pairing.minLc
}

/** A pinned colour as a working value, read from the string the stylesheet writes. */
function pinnedWorking(value: string): WorkingColor {
  const parsed = parseEmitted(pinnedColor(value))
  return { oklch: { l: parsed.l, c: parsed.c, h: parsed.h }, alpha: parsed.alpha ?? 1 }
}

/**
 * `other` is the other mode's seeded roles. The `firstLawful` pass measures a
 * shared candidate against its backgrounds too, so it runs only when they are
 * given; seeding the other mode for that purpose leaves it out.
 */
function seedRoles(
  roleMap: RoleMap,
  ramps: Record<Mode, Ramps>,
  mode: Mode,
  seeds: Seeds,
  pins: ModePins = {},
  other?: Record<ColorRole, WorkingColor>,
): Record<ColorRole, WorkingColor> {
  const working: Partial<Record<ColorRole, WorkingColor>> = {}
  const lookup = (ref: StepRef): Oklch => ramps[ref.ladder ?? mode][ref.ramp][ref.step]

  // The off-ladder ink ring (see `RoleSource`), tinted like the palette's
  // neutrals.
  const ring: Oklch = {
    l: RING_LIGHTNESS[mode],
    c: seeds.neutralTint,
    h: neutralHueOf(seeds),
  }

  // Pass 1: everything with a literal (ramp, step), plus the ring's constant.
  for (const [role, source] of Object.entries(roleMap) as [ColorRole, RoleMap[ColorRole]][]) {
    if (source.kind === 'ring') {
      working[role] = { oklch: ring, alpha: source.alpha ?? 1 }
      continue
    }
    if (source.kind !== 'step') continue
    working[role] = { oklch: lookup(source), alpha: source.alpha ?? 1 }
  }

  // The palette's pins replace what pass 1 derived, before pass 2, so a label
  // the palette leaves derived (`accent.contrast`) is chosen against the
  // pinned fill it sits on.
  for (const [role, value] of Object.entries(pins) as [PinRole, string | undefined][]) {
    if (value !== undefined) working[role] = pinnedWorking(value)
  }

  // Pass 2: derived choices, which need pass 1's values to compare against.
  for (const [role, source] of Object.entries(roleMap) as [ColorRole, RoleMap[ColorRole]][]) {
    if (source.kind !== 'bestOn') continue
    if (pins[role as PinRole] !== undefined) continue
    const against = working[source.against]
    if (!against) throw new Error(`${role} is derived from ${source.against}, which has no value`)
    let best: Oklch | undefined
    let bestLc = -1
    for (const candidate of source.candidates) {
      const color = lookup(candidate)
      const lc = contrast(color, against.oklch)
      if (lc > bestLc) {
        bestLc = lc
        best = color
      }
    }
    if (!best) throw new Error(`${role} has no candidates to choose from`)
    working[role] = { oklch: best, alpha: 1 }
  }

  // Pass 3: the first candidate that passes every pairing the role is held to.
  // It runs last, so the backgrounds and washes it is measured on, pins
  // included, are final: no background is ever nudged.
  for (const [role, source] of Object.entries(roleMap) as [ColorRole, RoleMap[ColorRole]][]) {
    if (source.kind !== 'firstLawful' || other === undefined) continue
    if (pins[role as PinRole] !== undefined) continue
    const pairings = LAWFUL_PAIRINGS.filter((pairing) => pairing.foreground === role)
    const lawfulOn = (seeded: Partial<Record<ColorRole, WorkingColor>>) => (color: Oklch) =>
      pairings.every((pairing) => {
        const background = seeded[pairing.background]
        if (!background) throw new Error(`${role} is measured on ${pairing.background}, unseeded`)
        return pairingPasses(pairing, { ...color, alpha: 1 }, background.oklch)
      })
    const here = lawfulOn(working)
    const there = lawfulOn(other)
    const either = source.either.map(lookup)
    const chosen =
      source.both.map(lookup).find((color) => here(color) && there(color)) ??
      either.find(here) ??
      either[either.length - 1]
    if (!chosen) throw new Error(`${role} has no candidates to choose from`)
    working[role] = { oklch: chosen, alpha: 1 }
  }

  return working as Record<ColorRole, WorkingColor>
}

/**
 * Roles whose relative weight is a design decision. When the law nudges one,
 * the whole family moves together, so `border.default` cannot pass
 * `border.strong`. (Only `border.default` is in the pairing table, so the
 * family has one lead.)
 */
const NUDGE_FAMILIES: readonly (readonly ColorRole[])[] = [
  ['border.subtle', 'border.default', 'border.strong'],
]

function familyOf(role: ColorRole): readonly ColorRole[] {
  return NUDGE_FAMILIES.find((family) => family.includes(role)) ?? [role]
}

/**
 * Moves failing foregrounds away from their background in 0.01 lightness steps,
 * once per role per round, so the total is bounded by `MAX_NUDGE`.
 *
 * Foregrounds and backgrounds are disjoint across `LAWFUL_PAIRINGS` (asserted in
 * `pairings.test.ts`), so a nudge never breaks a fixed pair and the loop
 * terminates.
 *
 * A pinned role is the palette's own decision, so it is never nudged, and a
 * pairing with a pinned foreground is not repaired. In a mode with pins nothing
 * throws: a pin can leave a derived neighbour unrepairable (a light pinned fill
 * turns the derived label dark, which then fails on the derived hover fill), and
 * the admission audit reports each failing pairing with its measured value and
 * the pin behind it.
 */
function enforceContrast(
  working: Record<ColorRole, WorkingColor>,
  themeName: string,
  mode: Mode,
  pinned: ReadonlySet<ColorRole> = new Set(),
): void {
  const maxRounds = Math.round(MAX_NUDGE / NUDGE_STEP)

  for (let round = 0; round <= maxRounds; round += 1) {
    const failing = LAWFUL_PAIRINGS.filter(
      (p) =>
        !pinned.has(p.foreground) &&
        !pairingPasses(p, painted(working[p.foreground]), working[p.background].oklch),
    )
    if (failing.length === 0) return

    if (round === maxRounds) {
      const worst = failing[0]
      if (!worst || pinned.size > 0) return
      throw new ContrastLawError(
        worst,
        measurePairing(worst, painted(working[worst.foreground]), working[worst.background].oklch),
        themeName,
        mode,
      )
    }

    const nudged = new Set<ColorRole>()
    for (const pairing of failing) {
      if (nudged.has(pairing.foreground)) continue
      const lead = working[pairing.foreground]
      const direction = contrastDirection(lead.oklch, working[pairing.background].oklch)
      for (const member of familyOf(pairing.foreground)) {
        if (nudged.has(member)) continue
        nudged.add(member)
        const color = working[member]
        // Translucent roles become more opaque instead of changing shade.
        if (color.alpha < 1) {
          color.alpha = Math.min(1, color.alpha + ALPHA_NUDGE_STEP)
          continue
        }
        color.oklch = gamutMap({
          ...color.oklch,
          l: Math.min(1, Math.max(0, color.oklch.l + direction * NUDGE_STEP)),
        })
      }
    }
  }
}

/**
 * The ramps a mode is resolved from. Dark is derived on the dark ladder, never
 * inverted from light. Both ladders are needed because the solid brand fills
 * are pinned to one (see `SOLID_LADDER`).
 */
export function generateAllRamps(seeds: Seeds): Record<Mode, Ramps> {
  return { light: generateRamps(seeds, 'light'), dark: generateRamps(seeds, 'dark') }
}

export function resolveModeColors(
  theme: Theme,
  mode: Mode,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): ColorRoleValues {
  const pins = theme.seeds.pins?.[mode] ?? {}
  // The other mode's backgrounds, which a role shared by both modes is
  // measured on too (`firstLawful`).
  const otherMode: Mode = mode === 'light' ? 'dark' : 'light'
  const other = seedRoles(
    buildRoleMap(theme.axes, otherMode, theme.seeds.chromaBudget),
    ramps,
    otherMode,
    theme.seeds,
    theme.seeds.pins?.[otherMode] ?? {},
  )
  const working = seedRoles(
    buildRoleMap(theme.axes, mode, theme.seeds.chromaBudget),
    ramps,
    mode,
    theme.seeds,
    pins,
    other,
  )
  const pinned = PIN_ROLES.filter((role) => pins[role] !== undefined)
  enforceContrast(working, theme.name, mode, new Set(pinned))

  const values: Partial<ColorRoleValues> = {}
  for (const [role, color] of Object.entries(working) as [ColorRole, WorkingColor][]) {
    values[role] = toCssColor(color.oklch, color.alpha)
  }
  // A pin is written as the palette states it, not re-derived through OKLCH,
  // so the stylesheet carries the brand's colour byte for byte.
  for (const role of pinned) values[role] = pinnedColor(pins[role] as string)
  return values as ColorRoleValues
}

/**
 * Where each gradient's second stop comes from.
 *
 * One step apart on the partner ramp, so the gradient crosses two hues at
 * nearly one lightness instead of fading to grey. `accent.gradient` uses the
 * solid-fill steps. `bg.wash` uses the page steps, because a wash at
 * solid-fill chroma would not work as a background.
 */
const GRADIENT_STOPS: Record<GradientRole, { to: RampStepPair }> = {
  'accent.gradient': { to: [9, 10] },
  'bg.wash': { to: [2, 3] },
}

type RampStepPair = readonly [
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
]

/** The angle of a two-stop gradient, in degrees. One value, so systems stay consistent. */
export const GRADIENT_ANGLE_DEG = 135
export const GRADIENT_ANGLE = `${GRADIENT_ANGLE_DEG}deg`

/**
 * Gradient roles for one mode.
 *
 * The no-op form matters most: with no `gradientHue`, `from`, `to` and `css`
 * are the same colour. A recipe reading `var(--pm-accent-gradient)` gets a
 * solid with no branch, so it stays theme-neutral.
 */
export function resolveModeGradients(
  theme: Theme,
  mode: Mode,
  colors: ColorRoleValues,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): GradientRoleValues {
  const values: Partial<GradientRoleValues> = {}

  for (const role of GRADIENT_ROLES) {
    const from = colors[GRADIENT_BASE[role]]
    const stops = (to: string) => [
      { color: from, at: 0 },
      { color: to, at: 1 },
    ]
    if (!hasGradient(theme.seeds)) {
      values[role] = {
        from,
        to: from,
        css: from,
        solid: true,
        angle: GRADIENT_ANGLE_DEG,
        stops: stops(from),
      }
      continue
    }
    const [, second] = GRADIENT_STOPS[role].to
    // `accent.gradient` uses the pinned solid ladder. `bg.wash` uses the
    // resolved mode, because a page wash belongs to its mode.
    const ladder: Mode = role === 'accent.gradient' ? 'light' : mode
    const to = toCssColor(ramps[ladder].gradient[second])
    values[role] = {
      from,
      to,
      css: `linear-gradient(${GRADIENT_ANGLE}, ${from}, ${to})`,
      solid: false,
      angle: GRADIENT_ANGLE_DEG,
      stops: stops(to),
    }
  }

  return values as GradientRoleValues
}

/**
 * Both modes. `@polymorph/theme` exposes this as the colour half of
 * `resolveTheme` (`derive.ts` supplies the non-colour half).
 */
export function resolveColors(
  theme: Theme,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): Record<Mode, ColorRoleValues> {
  return {
    light: resolveModeColors(theme, 'light', ramps),
    dark: resolveModeColors(theme, 'dark', ramps),
  }
}

/** Both modes' gradients, given the colours they collapse to. */
export function resolveGradients(
  theme: Theme,
  colors: Record<Mode, ColorRoleValues>,
  ramps: Record<Mode, Ramps> = generateAllRamps(theme.seeds),
): Record<Mode, GradientRoleValues> {
  return {
    light: resolveModeGradients(theme, 'light', colors.light, ramps),
    dark: resolveModeGradients(theme, 'dark', colors.dark, ramps),
  }
}

/** One pairing's outcome. Used by the `/tokens` gallery and the contrast law (`laws.test.ts`). */
export interface PairingResult {
  pairing: Pairing
  /** APCA Lc, measured on the composite. Reported for every pair, floor or not. */
  lc: number
  /** OKLCH lightness difference on the composite. Delineation pairs are measured in this. */
  deltaL: number
  /** WCAG contrast ratio on the composite. Focus pairs are measured in this. */
  ratio: number
  passes: boolean
}

/**
 * Measures the emitted strings, not the working values, so the audit reports
 * what ships. Takes only colours, which `/tokens` and the contrast law both
 * have already resolved.
 */
export function auditPairings(colors: ColorRoleValues): PairingResult[] {
  return LAWFUL_PAIRINGS.map((pairing) => {
    const foreground = parseEmitted(colors[pairing.foreground])
    const background = parseEmitted(colors[pairing.background])
    return {
      pairing,
      lc: contrast(foreground, background),
      deltaL: deltaL(foreground, background),
      ratio: ratioOn(foreground, background),
      passes: pairingPasses(pairing, foreground, background),
    }
  })
}

/** One gradient pairing's outcome, measured at the worse stop. */
export interface GradientPairingResult {
  pairing: GradientPairing
  /** The lower of the two stops' |Lc|, which is the whole gradient's legibility. */
  lc: number
  /** Which stop scored lower. `from` for a solid, where both stops are the same colour. */
  worstStop: 'from' | 'to'
  passes: boolean
}

/**
 * The worst-case-stop rule, measured from the emitted strings.
 *
 * A gradient is lawful only if both stops pass, so the reported Lc is the
 * smaller. A solid measures one colour twice, the ordinary check, so this is
 * safe to run over every theme.
 */
export function auditGradientPairings(
  colors: ColorRoleValues,
  gradients: GradientRoleValues,
): GradientPairingResult[] {
  return LAWFUL_GRADIENT_PAIRINGS.map((pairing) => {
    const foreground = parseEmitted(colors[pairing.foreground])
    const gradient = gradients[pairing.background]
    const fromLc = contrast(foreground, parseEmitted(gradient.from))
    const toLc = contrast(foreground, parseEmitted(gradient.to))
    const lc = Math.min(fromLc, toLc)
    return {
      pairing,
      lc,
      worstStop: fromLc <= toLc ? 'from' : 'to',
      passes: lc >= pairing.minLc,
    }
  })
}

/** One glass pairing's outcome at one backdrop extreme. */
export interface GlassPairingResult {
  pairing: Pairing
  /** The solid backdrop the pane was composited over for this measurement. */
  extreme: 'black' | 'white'
  lc: number
  passes: boolean
}

const GLASS_EXTREMES: Record<'black' | 'white', Translucent> = {
  black: { l: 0, c: 0, h: 0, alpha: 1 },
  white: { l: 1, c: 0, h: 0, alpha: 1 },
}

/**
 * The only role a glass pane may be mixed from: `bg.surface`.
 *
 * Not `bg.overlay`, on purpose. Dark mode shows elevation as lightness, and a
 * pane that light over a white worst case needs a 99% mix to keep light text
 * lawful, which is barely translucent. Glass separates by material instead, so
 * a transient pane uses the surface role, blur and shadow separate it, and
 * dark glass can be 91%. `bg.app` and `bg.subtle` stay opaque: the page is
 * not a pane. Recipes follow this and the audit enforces it.
 */
export const GLASS_BACKGROUNDS = ['bg.surface'] as const satisfies readonly ColorRole[]

/**
 * **Glass: the exception to measuring backgrounds as drawn.**
 *
 * `contrast.ts` takes backgrounds as drawn, which works because no other
 * translucent surface carries text. A glass pane's fill is `bg.surface` at
 * `material.surfaceMix`, and its backdrop is unknown at resolve time.
 *
 * So the pane is composited over **pure black and pure white**, and every text
 * pairing lawful on the opaque surface must pass on both. Any real backdrop
 * falls between them, so this guarantee does not depend on what scrolls
 * underneath.
 *
 * Delineation pairs are exempt: a hairline's ΔL cannot be guaranteed over any
 * backdrop, and on glass the material (blur, specular edge, shadow) does the
 * hairline's job. Text has no substitute, so the law covers text.
 */
export function auditGlassPairings(
  colors: ColorRoleValues,
  surfaceMix: number,
): GlassPairingResult[] {
  return GLASS_BACKGROUNDS.flatMap((background) => {
    const painted = parseEmitted(colors[background])
    const pane: Translucent = { ...painted, alpha: (painted.alpha ?? 1) * surfaceMix }
    return (['black', 'white'] as const).flatMap((extreme) => {
      const backdrop = composite(pane, GLASS_EXTREMES[extreme])
      return LAWFUL_PAIRINGS.filter(
        (pairing) => pairing.kind === 'text' && pairing.background === background,
      ).map((pairing) => {
        const lc = contrast(parseEmitted(colors[pairing.foreground]), backdrop)
        return { pairing, extreme, lc, passes: lc >= pairing.minLc }
      })
    })
  })
}

/**
 * The pane's fill, computed in the engine because the value law forbids
 * `color-mix` in recipes. Under `glass` it is `bg.surface` at the mode's
 * `GLASS_SURFACE_MIX`; otherwise it is `bg.surface` unchanged, so the property
 * exists in every pairing.
 */
export function resolveMaterialSurface(
  colors: Record<Mode, ColorRoleValues>,
  depth: Depth,
): Record<Mode, string> {
  const paint = (mode: Mode): string => {
    const surface = colors[mode]['bg.surface']
    if (depth !== 'glass') return surface
    const parsed = parseEmitted(surface)
    return toCssColor(parsed, (parsed.alpha ?? 1) * GLASS_SURFACE_MIX[mode])
  }
  return { light: paint('light'), dark: paint('dark') }
}

/**
 * Keeps alpha through the round trip, so an audit does not measure a
 * translucent dark border as solid white.
 */
function parseEmitted(value: string): Translucent {
  const parsed = toOklch(value)
  if (!parsed) throw new Error(`cannot re-parse emitted colour: ${value}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0, alpha: parsed.alpha ?? 1 }
}
