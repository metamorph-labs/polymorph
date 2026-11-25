import type {
  Axes,
  ContrastTemperament,
  Density,
  Depth,
  Geometry,
  MotionTemperament,
  Ornament,
  TexturedOrnament,
  TypePersonality,
} from './axes'
import { DENSITIES, hasTexture, MOTION_TEMPERAMENTS } from './axes'
import { cssVar } from './css-vars'
import { minSizeForWeight } from './pairings'
import { PLATFORM_FLOORS } from './platforms'
import type { ColorRole } from './roles'
import type { FallbackClass, FontRole, Seeds } from './seeds'
// Type-only, because `systems` imports this file's values (GEOMETRY_RADII) and
// a value import back would create a runtime cycle.
import type { SystemOverrides } from './systems'
import type { Mode } from './theme'
import {
  DISPLAY_STEPS,
  SPACE_STEPS,
  TEXT_STEPS,
  type CubicBezier,
  type DensityScopedTokens,
  type DisplayStep,
  type DisplayStyle,
  type EasingRole,
  type GlowStep,
  type IconSize,
  type MotionTokens,
  type InsetAssignmentClass,
  type NonColorTokens,
  type NumericVariant,
  type RadiusAssignmentClass,
  type RadiusStep,
  type Rgb,
  type ShadowAssignmentClass,
  type ShadowLayerValue,
  type ShadowStep,
  type SpaceStep,
  type TextEntry,
  type TextStep,
  type TextureSpec,
  type TypeStyle,
  type ZStep,
} from './tokens'

/**
 * Everything that is not colour, derived from the axes, like the colour engine:
 * axes in, values out, no hand-written token sheet.
 *
 * Type sizes are `rem` so text grows with the reader's browser font size.
 * Space and component dimensions are `px` so layout spacing stays fixed.
 *
 * Constants marked `TUNED-IN` are taste values, set by inspecting the rendered
 * tokens, not derived. Change them by inspection and keep the marker.
 */

// ---------------------------------------------------------------- type scale

export const TYPE_BASE_PX = 16

/**
 * The focus-zoom floor. iOS Safari zooms the viewport when a focused field's
 * font-size is under 16px, so below the phone line every text-entry recipe
 * takes `--pm-text-entry-size` instead of its step's size
 * (`design/components/README.md`). The token is CSS-only, because the zoom is
 * a browser behaviour: a native text field has no viewport to zoom.
 */
export const TYPE_ENTRY_FLOOR_PX = 16

/** A denser theme uses a tighter modular ratio. TUNED-IN */
export const TYPE_RATIO: Record<Density, number> = {
  compact: 1.2,
  standard: 1.25,
  comfortable: 1.3,
}

/**
 * Steps below the base shrink by a smaller ratio to stay legible. A pure 1.3
 * ratio puts `xs` under 10px.
 */
const DOWN_RATIO_DAMPING = 0.55

/** Larger text needs proportionally less leading. TUNED-IN */
export const LINE_HEIGHTS: Record<TextStep, number> = {
  xs: 1.5,
  sm: 1.5,
  md: 1.5,
  lg: 1.45,
  xl: 1.35,
  '2xl': 1.25,
  '3xl': 1.2,
}

const DISPLAY_LINE_HEIGHTS: Record<DisplayStep, number> = { sm: 1.15, md: 1.1, lg: 1.05 }

interface PersonalityType {
  bodyWeight: number
  /**
   * text.2xl / text.3xl. The scale sets the weight because components may not
   * choose one, otherwise every PageHeader would decide emphasis itself.
   * (`text.xl` uses the fixed medium weight below.)
   */
  titleWeight: number
  displayWeight: number
  /** Applied to text at or above ~30px, where letterfit starts to look loose. */
  tightTracking: string
  /** Applied below ~14px, where letterfit starts to look cramped. */
  looseTracking: string
  bodyTracking: string
  iconStroke: number
}

/**
 * `text.xl` is the first heading step. 500 adds emphasis independent of
 * personality, and every family on the pinned list has it.
 */
const XL_WEIGHT = 500

/**
 * The weight of `text.xl` under a title weight a system file sets below 500.
 * A subheading heavier than the titles above it reads as the larger heading,
 * so `xl` takes the title weight where its size reads at that weight at the
 * body-text floor (`minSizeForWeight`), and otherwise the lightest hundred
 * above it that does. At 500 and over it keeps `XL_WEIGHT`, so every
 * personality's own scale is unchanged.
 */
function xlWeight(px: number, titleWeight: number): number {
  for (let weight = titleWeight; weight < XL_WEIGHT; weight += 100) {
    const needs = minSizeForWeight(weight)
    if (needs !== undefined && px >= needs) return weight
  }
  return XL_WEIGHT
}

/**
 * The weights a system file may give the heading steps
 * (`overrides.type.titleWeight`, `overrides.type.displayWeight`), in hundreds.
 * 700 is the heaviest weight a personality sets. 300 is the lightest at which
 * the smallest title step, `text.2xl`, can still read at the body-text
 * contrast floor at the size the standard ratio gives it (`systemSchema` holds
 * each step to `minSizeForWeight`). The display steps never go under 300
 * either, so `DISPLAY_WEIGHT_DELTA` cannot take one there.
 */
export const HEADING_WEIGHT_RANGE = { min: 300, max: 700 } as const

/** TUNED-IN */
const PERSONALITY: Record<TypePersonality, PersonalityType> = {
  grotesque: {
    bodyWeight: 400,
    titleWeight: 600,
    displayWeight: 600,
    tightTracking: '-0.02em',
    looseTracking: '0.01em',
    bodyTracking: '0em',
    iconStroke: 1.75,
  },
  humanist: {
    bodyWeight: 400,
    titleWeight: 600,
    displayWeight: 600,
    tightTracking: '-0.01em',
    looseTracking: '0.008em',
    bodyTracking: '0em',
    iconStroke: 1.5,
  },
  mono: {
    // Mono faces look heavy above medium, so titles stay at 500 and hierarchy
    // relies on size and colour.
    bodyWeight: 400,
    titleWeight: 500,
    displayWeight: 500,
    tightTracking: '-0.02em',
    looseTracking: '0em',
    bodyTracking: '-0.01em',
    iconStroke: 1.5,
  },
  editorial: {
    bodyWeight: 400,
    titleWeight: 700,
    displayWeight: 700,
    tightTracking: '-0.015em',
    looseTracking: '0.012em',
    bodyTracking: '0.005em',
    iconStroke: 1.25,
  },
}

/** Type sizes round to a half-pixel grid. Finer differences are invisible. */
function roundHalf(px: number): number {
  return Math.round(px * 2) / 2
}

function rem(px: number): string {
  return `${px / TYPE_BASE_PX}rem`
}

/**
 * `md` is the base, 16px unless the system sets one. Everything above steps
 * up by the ratio; everything below steps down by the damped ratio.
 */
export function typeSizePx(stepsFromBase: number, ratio: number, base = TYPE_BASE_PX): number {
  if (stepsFromBase >= 0) return roundHalf(base * ratio ** stepsFromBase)
  const down = 1 + (ratio - 1) * DOWN_RATIO_DAMPING
  return roundHalf(base / down ** -stepsFromBase)
}

function trackingFor(px: number, personality: PersonalityType): string {
  if (px >= 30) return personality.tightTracking
  if (px < 14) return personality.looseTracking
  return personality.bodyTracking
}

function deriveTextScale(
  axes: Axes,
  override: SystemOverrides['type'] = undefined,
): Record<TextStep, TypeStyle> {
  // A system file may set the base (`overrides.type.base`, the md step) and
  // the density axis's ratio (`overrides.type.ratio`), which spreads the
  // ladder around the base. It may also set the two steps under the base
  // (`overrides.type.sm`, `overrides.type.xs`); every other step derives.
  // `overrides.type.titleWeight` replaces the personality's title weight on
  // the two steps it governs, and under 500 it lightens `xl` as far as that
  // step's size allows (`xlWeight`); body and the working sizes keep theirs.
  const base = override?.base ?? TYPE_BASE_PX
  const ratio = override?.ratio ?? TYPE_RATIO[axes.density]
  const personality = PERSONALITY[axes.typePersonality]
  const baseIndex = TEXT_STEPS.indexOf('md')

  const titleWeight = override?.titleWeight ?? personality.titleWeight
  const weightFor = (step: TextStep, px: number): number => {
    if (step === '2xl' || step === '3xl') return titleWeight
    if (step === 'xl') return xlWeight(px, titleWeight)
    return personality.bodyWeight
  }

  const entries = TEXT_STEPS.map((step, index) => {
    const set = step === 'sm' ? override?.sm : step === 'xs' ? override?.xs : undefined
    const px = set ?? typeSizePx(index - baseIndex, ratio, base)
    const style: TypeStyle = {
      size: rem(px),
      lineHeight: LINE_HEIGHTS[step],
      weight: weightFor(step, px),
      family: 'body',
      tracking: trackingFor(px, personality),
    }
    return [step, style] as const
  })

  return Object.fromEntries(entries) as Record<TextStep, TypeStyle>
}

/**
 * The floor under the display ratio.
 *
 * Body type tightens with density, because a compact table needs a compact
 * scale. Display type should not: at 1.2 the display steps come too close to
 * the heading steps and the page title loses prominence. So display uses a
 * ratio of at least 1.25 at every density, while still continuing the scale.
 */
export const DISPLAY_RATIO_FLOOR = 1.25

/**
 * Optical tracking per display step. Larger type needs tighter spacing than the
 * single "tight" body value: each step above `sm` removes another 0.005em from
 * the personality's `tightTracking`.
 */
const DISPLAY_TRACKING_STEP_EM = 0.005

/**
 * Weight decreases as size increases, because the stroke grows with the size.
 * A constant weight would make the largest step the boldest text on the page.
 * It applies to a display weight a system file sets as to the personality's,
 * and stops at `HEADING_WEIGHT_RANGE.min`: a display weight of 300 keeps 300
 * at `lg`, because no font is checked for a lighter one.
 */
const DISPLAY_WEIGHT_DELTA: Record<DisplayStep, number> = { sm: 0, md: 0, lg: -50 }

function tightenEm(tracking: string, byEm: number): string {
  const value = parseFloat(tracking)
  const tightened = (Number.isNaN(value) ? 0 : value) - byEm
  return `${tightened.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}em`
}

function deriveDisplayScale(
  axes: Axes,
  displayStyle: 'normal' | 'italic',
  override: SystemOverrides['type'] = undefined,
): Record<DisplayStep, DisplayStyle> {
  // The floor also applies to the ratio override, so a flatter body ladder
  // cannot shrink the page title. Display continues the ladder from the base.
  const base = override?.base ?? TYPE_BASE_PX
  const ratio = Math.max(override?.ratio ?? TYPE_RATIO[axes.density], DISPLAY_RATIO_FLOOR)
  const personality = PERSONALITY[axes.typePersonality]
  const displayWeight = override?.displayWeight ?? personality.displayWeight
  // Display continues the same ratio past the last text step.
  const firstDisplayIndex = TEXT_STEPS.length - TEXT_STEPS.indexOf('md')

  const entries = DISPLAY_STEPS.map((step, index) => {
    const px = typeSizePx(firstDisplayIndex + index, ratio, base)
    const style: DisplayStyle = {
      size: rem(px),
      lineHeight: DISPLAY_LINE_HEIGHTS[step],
      weight: Math.max(HEADING_WEIGHT_RANGE.min, displayWeight + DISPLAY_WEIGHT_DELTA[step]),
      family: 'display',
      tracking: tightenEm(personality.tightTracking, index * DISPLAY_TRACKING_STEP_EM),
      // For families with an optical-size axis. Others ignore it.
      opsz: px,
      // Seeded per slot (`fonts.display.style`) for italic display faces, such
      // as Press's masthead.
      style: displayStyle,
    }
    return [step, style] as const
  })

  return Object.fromEntries(entries) as Record<DisplayStep, DisplayStyle>
}

/** A heading step as the derivation sets it: its size in px and its weight. */
export interface HeadingStep {
  step: `text.${'2xl' | '3xl'}` | `display.${DisplayStep}`
  /** The `overrides.type` key that sets this step's weight. */
  key: 'titleWeight' | 'displayWeight'
  px: number
  weight: number
}

/**
 * The steps the title and display weights govern, from the same derivation
 * the tokens come from, so `systemSchema` measures the weight and size that
 * ship, the system file's weight where it sets one.
 */
export function deriveHeadingSteps(
  axes: Axes,
  override: SystemOverrides['type'] = undefined,
): HeadingStep[] {
  const text = deriveTextScale(axes, override)
  const display = deriveDisplayScale(axes, 'normal', override)
  const remPx = (size: string) => parseFloat(size) * TYPE_BASE_PX
  return [
    ...(['2xl', '3xl'] as const).map((step): HeadingStep => ({
      step: `text.${step}`,
      key: 'titleWeight',
      px: remPx(text[step].size),
      weight: text[step].weight,
    })),
    ...DISPLAY_STEPS.map((step): HeadingStep => ({
      step: `display.${step}`,
      key: 'displayWeight',
      px: remPx(display[step].size),
      weight: display[step].weight,
    })),
  ]
}

/**
 * The text-entry floor: the md step, or 16px where the step is under it. Its
 * line-height is the md step's, so a field that steps up keeps its rhythm.
 */
function deriveTextEntry(base: number): TextEntry {
  return { size: rem(Math.max(TYPE_ENTRY_FLOOR_PX, base)), lineHeight: LINE_HEIGHTS.md }
}

// --------------------------------------------------------------- space scale

/** The only spacing scale. No other spacing value can be expressed. */
export const SPACE_LADDER_PX: readonly number[] = [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96]

export const DENSITY_MULTIPLIER: Record<Density, number> = {
  compact: 0.85,
  standard: 1,
  comfortable: 1.15,
}

/**
 * Interactive targets, before density. TUNED-IN
 *
 * 4px steps around 36: the reference control heights, which the flagship
 * `plain` system matches exactly. 0.85 gives 28 / 30 / 34 and 1.15 gives
 * 36 / 42 / 46, all even and monotonic. `sm` stays above the WCAG 2.5.8 24px
 * floor at every density, which is the real limit on the small end.
 */
export const CONTROL_HEIGHT_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 32, md: 36, lg: 40 }

/**
 * Every dimension rounds to a 2px grid. Whole pixels would give 3px / 7px /
 * 27px at compact density, an irregular rhythm (`docs/concepts.md`). Exported
 * so the WCAG floor check in `systems.ts` rounds like the derivation and checks
 * the value that ships.
 */
export function roundEven(px: number): number {
  return Math.max(2, Math.round(px / 2) * 2)
}

/**
 * Overrides change the base (standard-density) ladders. The multiplier still
 * derives all three densities from the changed base, so density still changes
 * only space, through an attribute swap.
 */
function deriveDensityTokens(density: Density, overrides: SystemOverrides): DensityScopedTokens {
  const multiplier = DENSITY_MULTIPLIER[density]

  const space = Object.fromEntries(
    SPACE_STEPS.map((step) => {
      const base =
        (step === 0 ? undefined : overrides.space?.[step as Exclude<SpaceStep, 0>]) ??
        SPACE_LADDER_PX[step] ??
        0
      return [step, `${base === 0 ? 0 : roundEven(base * multiplier)}px`] as const
    }),
  ) as Record<SpaceStep, string>

  const controlBase = (size: 'sm' | 'md' | 'lg'): number =>
    overrides.controlHeight?.[size] ?? CONTROL_HEIGHT_PX[size]

  return {
    space,
    controlHeight: {
      sm: `${roundEven(controlBase('sm') * multiplier)}px`,
      md: `${roundEven(controlBase('md') * multiplier)}px`,
      lg: `${roundEven(controlBase('lg') * multiplier)}px`,
    },
  }
}

// -------------------------------------------------------------------- radius

/** sm / md / lg in px; `pill` is always 9999 and `none` always 0. */
export const GEOMETRY_RADII: Record<Geometry, readonly [number, number, number]> = {
  sharp: [0, 0, 0],
  crisp: [2, 4, 8],
  soft: [4, 8, 14],
  round: [6, 12, 24],
}

/**
 * The radius assignment map (`design/components/README.md`) as defaults. A
 * class token is a reference, like the shell tokens, so an override changes
 * every member that uses it. No colour or property name changes, so the
 * contrast and churn laws are unaffected.
 */
export const RADIUS_ASSIGNMENT_DEFAULT: Record<RadiusAssignmentClass, RadiusStep> = {
  control: 'md',
  detail: 'sm',
  surface: 'lg',
}

/** The shadow assignment map's defaults, taken from the recipes. */
export const SHADOW_ASSIGNMENT_DEFAULT: Record<ShadowAssignmentClass, ShadowStep> = {
  seat: 'control',
  resting: 'raised',
  transient: 'overlay',
}

/** The container-inset assignment defaults: the map the recipes use. */
export const INSET_ASSIGNMENT_DEFAULT: Record<InsetAssignmentClass, SpaceStep> = {
  surface: 6,
  pane: 5,
  list: 2,
}

/**
 * The assignment maps as token paths. The emitted values are these paths
 * wrapped in `var()` (`asVars`), and the token document reads the paths.
 */
function deriveRadiusAssignRef(
  override: SystemOverrides['assign'] = undefined,
): Record<RadiusAssignmentClass, `radius.${RadiusStep}`> {
  const step = (cls: RadiusAssignmentClass): RadiusStep =>
    override?.radius?.[cls] ?? RADIUS_ASSIGNMENT_DEFAULT[cls]
  return {
    control: `radius.${step('control')}`,
    detail: `radius.${step('detail')}`,
    surface: `radius.${step('surface')}`,
  }
}

function deriveShadowAssignRef(
  override: SystemOverrides['assign'] = undefined,
): Record<ShadowAssignmentClass, `shadow.${ShadowStep}`> {
  const step = (cls: ShadowAssignmentClass): ShadowStep =>
    override?.shadow?.[cls] ?? SHADOW_ASSIGNMENT_DEFAULT[cls]
  return {
    seat: `shadow.${step('seat')}`,
    resting: `shadow.${step('resting')}`,
    transient: `shadow.${step('transient')}`,
  }
}

function deriveInsetAssignRef(
  override: SystemOverrides['assign'] = undefined,
): Record<InsetAssignmentClass, `space.${number}`> {
  // `number`, not `SpaceStep`: the schema owns the 0–10 limit.
  const step = (cls: InsetAssignmentClass): number =>
    override?.inset?.[cls] ?? INSET_ASSIGNMENT_DEFAULT[cls]
  return {
    surface: `space.${step('surface')}`,
    pane: `space.${step('pane')}`,
    list: `space.${step('list')}`,
  }
}

/** Token paths to `var()` references, key for key. */
function asVars<K extends string>(refs: Record<K, string>): Record<K, string> {
  return Object.fromEntries(
    (Object.entries(refs) as [K, string][]).map(([key, path]) => [key, cssVar(path)]),
  ) as Record<K, string>
}

/**
 * The axis selects the ladder and an override changes individual steps.
 * `none` and `pill` are meanings, not sizes, so they stay fixed.
 */
function deriveRadii(
  geometry: Geometry,
  override: SystemOverrides['radius'] = undefined,
): Record<RadiusStep, string> {
  const [sm, md, lg] = GEOMETRY_RADII[geometry]
  return {
    none: '0',
    sm: `${override?.sm ?? sm}px`,
    md: `${override?.md ?? md}px`,
    lg: `${override?.lg ?? lg}px`,
    pill: '9999px',
  }
}

// ----------------------------------------------------------------- elevation

/**
 * Shadows are black alpha in both modes. In dark mode `bg.raised` is already
 * lighter (elevation as lightness), so the shadow is a secondary cue there.
 * TUNED-IN
 */
/** One shadow layer, as numbers so a throw can scale it. */
interface ShadowLayer {
  y: number
  blur: number
  alpha: number
}

/**
 * Numbers, because the throw override scales them and parsing our own strings
 * is the anti-pattern the gradient emitter describes. At a throw of 1,
 * `renderShadow` reproduces the recipe strings byte for byte (`derive.test.ts`).
 */
const DEPTH_SHADOW_LAYERS: Record<Depth, Record<ShadowStep, readonly ShadowLayer[]>> = {
  /**
   * **Flat still gives overlays a shadow.**
   *
   * Flat forbids resting elevation: a card is separated by its border, and a
   * shadow would be a competing signal.
   *
   * Transient surfaces are different. A menu with no shadow, no scrim and a
   * one-step surface difference blends into the page. A dialog, menu, select
   * or popover is in front of the page, and hiding that is a bug.
   *
   * So flat keeps `control` and `raised` at `none` and has a real `overlay`,
   * expressed as a token value so no recipe branches on the axis. An empty
   * layer list renders as `none`, so the throw override has nothing to scale.
   */
  flat: { control: [], raised: [], overlay: [{ y: 4, blur: 14, alpha: 0.14 }] },
  borders: {
    control: [{ y: 1, blur: 1, alpha: 0.04 }],
    raised: [{ y: 1, blur: 2, alpha: 0.06 }],
    overlay: [{ y: 4, blur: 12, alpha: 0.1 }],
  },
  elevated: {
    // A contact line plus a wider ambient shadow, so cards sit on the page.
    // Overlays get the long throw.
    control: [{ y: 1, blur: 2, alpha: 0.08 }],
    // Three layers, each longer and lighter, so depth reads as distance, not a
    // smudge under the edge.
    raised: [
      { y: 1, blur: 1, alpha: 0.05 },
      { y: 4, blur: 10, alpha: 0.06 },
      { y: 16, blur: 32, alpha: 0.07 },
    ],
    overlay: [
      { y: 6, blur: 16, alpha: 0.1 },
      { y: 20, blur: 48, alpha: 0.16 },
    ],
  },
  glass: {
    // Glass uses a thinner contact line and longer, lighter ambient layers than
    // elevated, because translucency and blur provide the separation. At
    // elevated's darkness the pane would look smoked.
    control: [{ y: 1, blur: 2, alpha: 0.07 }],
    raised: [
      { y: 2, blur: 6, alpha: 0.05 },
      { y: 10, blur: 28, alpha: 0.09 },
    ],
    overlay: [
      { y: 8, blur: 24, alpha: 0.1 },
      { y: 28, blur: 64, alpha: 0.14 },
    ],
  },
}

/** `1.5 → 1.5`, `2.004 → 2`. Shadow lengths carry at most two decimals and no trailing zeros. */
const trimmed = (value: number): number => Math.round(value * 100) / 100

/** A length as a shadow writes it: `0` bare, anything else in px. */
const shadowLength = (px: number): string => (px === 0 ? '0' : `${px}px`)

/**
 * The `box-shadow` value for a list of layers, or `none` for an empty list.
 * Spread is written only when it is not zero.
 */
function renderLayers(layers: readonly ShadowLayerValue[]): string {
  if (layers.length === 0) return 'none'
  return layers
    .map((layer) =>
      [
        ...(layer.inset ? ['inset'] : []),
        shadowLength(layer.x),
        shadowLength(layer.y),
        shadowLength(layer.blur),
        ...(layer.spread === 0 ? [] : [shadowLength(layer.spread)]),
        layer.color,
      ].join(' '),
    )
    .join(', ')
}

/**
 * The throw scales distance and blur together, never darkness, because a
 * darker long throw would be two decisions in one setting.
 */
function deriveShadowLayers(
  depth: Depth,
  override: SystemOverrides['shadow'] = undefined,
): Record<ShadowStep, ShadowLayerValue[]> {
  const throwFactor = override?.throw ?? 1
  const scaled = (layers: readonly ShadowLayer[]): ShadowLayerValue[] =>
    layers.map((layer) => ({
      x: 0,
      y: trimmed(layer.y * throwFactor),
      blur: trimmed(layer.blur * throwFactor),
      spread: 0,
      color: `rgb(0 0 0 / ${layer.alpha})`,
      inset: false,
    }))
  const layers = DEPTH_SHADOW_LAYERS[depth]
  return {
    control: scaled(layers.control),
    raised: scaled(layers.raised),
    overlay: scaled(layers.overlay),
  }
}

/**
 * The top highlight for lit fills: a thin white line at the top inside edge
 * that makes a fill look lit instead of printed. It is drawn above the fill,
 * so it composes with a gradient.
 *
 * `flat` has no resting shadows, so it has no highlight either.
 */
const DEPTH_INSET_TOP_ALPHA: Record<Depth, number | null> = {
  flat: null,
  borders: 0.06,
  elevated: 0.12,
  // The specular edge is where glass catches the light, so it is brighter than
  // any lit fill.
  glass: 0.2,
}

function deriveInsetTopLayer(depth: Depth): ShadowLayerValue | null {
  const alpha = DEPTH_INSET_TOP_ALPHA[depth]
  if (alpha === null) return null
  return { x: 0, y: 1, blur: 0, spread: 0, color: `rgb(255 255 255 / ${alpha})`, inset: true }
}

// ------------------------------------------------------------------ material

/**
 * The share of `bg.surface` in a glass pane's fill, as numbers the law reads.
 *
 * Both are contrast decisions (see `auditGlassPairings`). Every text pairing
 * lawful on the opaque surface must stay lawful on the mix over pure black and
 * pure white, the worst possible backdrops. Each value is the lowest whole
 * percent at which every shipped palette passes.
 *
 * The values differ by arithmetic, not taste. Black threatens a light pane
 * (`text.secondary`'s Lc 60 binds at 96%) and white a dark one (`text.muted`'s
 * Lc 45 binds at 91%), so dark glass is more translucent instead of both modes
 * using the stricter value.
 */
export const GLASS_SURFACE_MIX: Record<Mode, number> = { light: 0.96, dark: 0.91 }

/**
 * What a surface is made of, by depth. Like texture, the values are emitted
 * for every pairing (the property-set law) and only `glass` gives them effect.
 *
 * The mix law relies on the blur: at 24px the backdrop is a smooth blend, so
 * the solid black or white composite really is the worst case. The saturation
 * boost keeps the blurred backdrop coloured, which is why a high mix still
 * looks like a material.
 */
const OPAQUE_MATERIAL: NonColorTokens['material'] = { blur: '0px', saturate: '1' }

const DEPTH_MATERIAL: Record<Depth, NonColorTokens['material']> = {
  flat: OPAQUE_MATERIAL,
  borders: OPAQUE_MATERIAL,
  elevated: OPAQUE_MATERIAL,
  glass: { blur: '24px', saturate: '1.5' },
}

/**
 * Halos, as shapes. The colour comes from a `*.glow` role, so
 * `box-shadow: var(--pm-glow-focus)` gives a halo in the component's own tone.
 *
 * `none` under `ornament: 'none'`, enforced here, not by convention. The focus
 * ring is never affected: `laws.test.ts` asserts its tokens remain without a
 * glow, because a halo replacing the ring would be an accessibility regression.
 */
function deriveGlowLayers(ornament: Ornament): Record<GlowStep, ShadowLayerValue[]> {
  if (ornament === 'none') return { focus: [], hover: [] }
  const role: ColorRole = 'accent.glow'
  const halo = (y: number, blur: number, spread: number): ShadowLayerValue => ({
    x: 0,
    y,
    blur,
    spread,
    color: cssVar(role),
    colorRef: role,
    inset: false,
  })
  return { focus: [halo(0, 0, 4)], hover: [halo(2, 12, 0)] }
}

// ------------------------------------------------------------------- texture

/**
 * The most a page texture may move the surface's lightness.
 *
 * Texture must **not be visible as a colour change**, because contrast is
 * measured against the flat colour beneath it.
 *
 * 0.012 in OKLCH L is about a quarter of one ramp step at the surface end of
 * the ladder: visible as texture, not as colour. `laws.test.ts` checks the
 * emitted patterns against it.
 */
export const TEXTURE_MAX_DELTA_L = 0.012

/**
 * Peak alpha per texture. Both are black on transparent, so alpha is the
 * lightness change at the darkest pixel, and the bound can be checked by
 * reading the pattern.
 */
const TEXTURE_ALPHA: Record<TexturedOrnament, number> = { grain: 0.011, grid: 0.008 }

/** Tile size in px: large for grain so it does not look repetitive, regular for grid. */
const TEXTURE_TILE: Record<TexturedOrnament, number> = { grain: 120, grid: 24 }

/** Fractal noise, one octave: fine speckle, not blotches. */
const GRAIN_BASE_FREQUENCY = 0.8
const GRAIN_OCTAVES = 1

/** The grid is a hairline. */
const GRID_STROKE_WIDTH = 1

/**
 * The grid's stroke colour: black on a light page, white on a dark one,
 * because black alpha over near-black is invisible. Grain is grey speckle,
 * which shows on both, so it takes no ink.
 */
const TEXTURE_INK: Record<Mode, Rgb> = {
  light: { r: 0, g: 0, b: 0 },
  dark: { r: 255, g: 255, b: 255 },
}

function textureSvg(spec: Exclude<TextureSpec, { kind: 'none' }>): string {
  const { alpha, tile } = spec
  if (spec.kind === 'grain') {
    // `feColorMatrix` makes the noise greyscale and the transfer scales it
    // into alpha, so the darkest pixel is exactly `alpha`.
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${spec.baseFrequency}" ` +
      `numOctaves="${spec.octaves}"/>` +
      `<feColorMatrix type="saturate" values="0"/>` +
      `<feComponentTransfer><feFuncA type="linear" slope="${alpha}"/></feComponentTransfer>` +
      `</filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`
    )
  }
  const { r, g, b } = spec.stroke
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
    `<path d="M${tile} 0H0V${tile}" fill="none" stroke="rgb(${r} ${g} ${b} / ${alpha})" ` +
    `stroke-width="${spec.strokeWidth}"/>` +
    `</svg>`
  )
}

/** A data URI, percent-encoded only where needed: `#` and `<` break `url()`. */
function dataUri(svg: string): string {
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23')
  return `url("data:image/svg+xml,${encoded}")`
}

/** The texture's parameters per mode. `none` where the ornament axis permits none. */
export function deriveTextureSpec(ornament: Ornament): { page: Record<Mode, TextureSpec> } {
  if (!hasTexture(ornament)) return { page: { light: { kind: 'none' }, dark: { kind: 'none' } } }
  const alpha = TEXTURE_ALPHA[ornament]
  const tile = TEXTURE_TILE[ornament]
  // Grain uses one pattern for both modes. The grid has a colour per mode.
  const spec = (mode: Mode): TextureSpec =>
    ornament === 'grain'
      ? { kind: 'grain', alpha, tile, baseFrequency: GRAIN_BASE_FREQUENCY, octaves: GRAIN_OCTAVES }
      : {
          kind: 'grid',
          alpha,
          tile,
          stroke: { ...TEXTURE_INK[mode] },
          strokeWidth: GRID_STROKE_WIDTH,
        }
  return { page: { light: spec('light'), dark: spec('dark') } }
}

/** The patterns `--pm-texture-page` carries, drawn from `deriveTextureSpec`. */
export function deriveTexture(ornament: Ornament): { page: Record<Mode, string> } {
  const { page } = deriveTextureSpec(ornament)
  const draw = (spec: TextureSpec): string =>
    spec.kind === 'none' ? 'none' : dataUri(textureSvg(spec))
  return { page: { light: draw(page.light), dark: draw(page.dark) } }
}

/**
 * **2px at the standard temperament.** The mark is drawn in the solid focus
 * colour (`border.focusSolid`), so 2px carries the weight the reference's 3px
 * half-alpha ring did. Temperament sets edge strength, so stark draws 3px.
 * Soft keeps 2px, the floor a system file may not go under.
 */
export const TEMPERAMENT_FOCUS_WIDTH: Record<ContrastTemperament, number> = {
  soft: 2,
  standard: 2,
  stark: 3,
}

/**
 * The focus mark's width and offset in px, for a temperament and a system's
 * `overrides.focus`.
 *
 * **The mark sits inside the edge.** The derived offset is minus the width at
 * every geometry, so the outline covers the border and the pixels inside it,
 * and nothing is drawn outside the control. A container that clips its
 * content (a scroll area, a pane, a table's wrapper) then never cuts the mark,
 * and a field's border reads as taking the focus colour and thickening inward.
 * A system that re-values the width and leaves the offset moves the mark in by
 * the new width. A system may move the mark back outside with an offset of 0
 * or more (`focusOverrideSchema`).
 */
export function focusPx(
  temperament: ContrastTemperament,
  override?: { width?: number; offset?: number },
): { width: number; offset: number } {
  const width = override?.width ?? TEMPERAMENT_FOCUS_WIDTH[temperament]
  return { width, offset: override?.offset ?? -width }
}

// ------------------------------------------------------------------ stacking

/**
 * The stacking ladder: constants, not axis-derived, because no temperament may
 * reorder announcements, overlays and the frame. The gaps (2 → 100 → 200) let
 * an application place its own chrome between the shell and the overlay plane.
 */
const Z_LADDER: Record<ZStep, string> = {
  raise: '1',
  shell: '2',
  overlay: '100',
  toast: '200',
}

// --------------------------------------------------------------------- icons

const TEMPERAMENT_STROKE_DELTA: Record<ContrastTemperament, number> = {
  soft: -0.25,
  standard: 0,
  stark: 0.25,
}

/**
 * Icon sizes follow the type scale, so an inline icon matches its text.
 *
 * Stroke is per size, anchored at `md`. The tuned value is in SVG units on
 * lucide's 24 grid, so one value at all sizes would draw sm at ~85% of md's
 * weight and lg at ~125%. Scaling by each size's rendered box gives all three
 * the tuned weight, as optical sizing does for type. The clamp applies after
 * compensation, to keep strokes drawable.
 */
function deriveIcons(
  axes: Axes,
  text: Record<TextStep, TypeStyle>,
): { size: Record<IconSize, string>; stroke: Record<IconSize, string> } {
  const px = (step: TextStep) => roundEven(parseFloat(text[step].size) * TYPE_BASE_PX)
  const tuned =
    PERSONALITY[axes.typePersonality].iconStroke +
    TEMPERAMENT_STROKE_DELTA[axes.contrastTemperament]
  const strokeAt = (sizePx: number) => {
    const compensated = (tuned * px('md')) / sizePx
    return `${Math.round(Math.min(2.5, Math.max(1, compensated)) * 100) / 100}`
  }

  return {
    size: { sm: `${px('sm')}px`, md: `${px('md')}px`, lg: `${px('lg')}px` },
    stroke: { sm: strokeAt(px('sm')), md: strokeAt(px('md')), lg: strokeAt(px('lg')) },
  }
}

// -------------------------------------------------------------------- motion

/** Enter durations in ms, before temperament. TUNED-IN (`design/motion/motion.md`). */
const BASE_DURATION_MS = { control: 140, surface: 220, overlay: 260 } as const

/** Exits are quicker than entrances and accelerate out. TUNED-IN */
export const EXIT_RATIO = 0.65

export const MOTION_SCALE: Record<MotionTemperament, number> = {
  none: 0,
  // The legibility floor (`design/motion/motion.md`): at 0.7 a colour-only
  // hover takes 98ms, too short to register. 112ms (the control class at 0.8)
  // is the shortest perceptible hover.
  subtle: 0.8,
  standard: 1,
  expressive: 1.35,
}

/**
 * Springs per temperament (`design/motion/motion.md`): subtle has no overshoot
 * (ζ ≈ 1.0), standard a slight one (ζ ≈ 0.85), expressive a visible one
 * (ζ ≈ 0.70), stiffer so the bounce stays quick. `none` copies standard but
 * the motion engine skips springs there, and every duration is already 0.
 * TUNED-IN
 */
const SPRINGS: Record<MotionTemperament, MotionTokens['spring']> = {
  subtle: {
    default: { stiffness: 300, damping: 35, mass: 1 },
    snappy: { stiffness: 400, damping: 38, mass: 0.9 },
    gentle: { stiffness: 200, damping: 30, mass: 1.1 },
  },
  standard: {
    default: { stiffness: 300, damping: 30, mass: 1 },
    snappy: { stiffness: 400, damping: 32, mass: 0.9 },
    gentle: { stiffness: 200, damping: 26, mass: 1.1 },
  },
  expressive: {
    default: { stiffness: 340, damping: 26, mass: 1 },
    snappy: { stiffness: 480, damping: 28, mass: 0.9 },
    gentle: { stiffness: 220, damping: 22, mass: 1.1 },
  },
  none: {
    default: { stiffness: 300, damping: 30, mass: 1 },
    snappy: { stiffness: 400, damping: 32, mass: 0.9 },
    gentle: { stiffness: 200, damping: 26, mass: 1.1 },
  },
}

/**
 * Transform scale at `:active` (press feedback). `1` at none, where colour
 * alone shows the press. TUNED-IN
 */
const PRESS_SCALE: Record<MotionTemperament, number> = {
  none: 1,
  subtle: 0.99,
  standard: 0.97,
  expressive: 0.95,
}

/**
 * Ambient loop periods. They scale inversely, so calmer temperaments are
 * slower. `none` emits 0s, alongside the global ambient off switch, never a
 * fast loop. TUNED-IN
 */
const AMBIENT_PERIOD_MS = { shimmer: 1600, spin: 900 } as const

/**
 * Bounded stagger. `step` scales with temperament. `max` caps the total, so a
 * forty-row list gets shorter steps instead of taking 1.5s to appear.
 * TUNED-IN (the numbers; the bound itself is structural).
 */
const STAGGER_STEP_MS = 24
const STAGGER_MAX_MS = 200

/**
 * `overshoot` overshoots only under `expressive` and equals `standard`
 * elsewhere, so recipes use it without branching on the axis.
 */
const EASING_STANDARD: CubicBezier = { x1: 0.4, y1: 0, x2: 0.2, y2: 1 }
const EASING_OVERSHOOT: CubicBezier = { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }
/** Enter decelerates into place. Exit accelerates away. */
const EASING_ENTER: CubicBezier = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 }
const EASING_EXIT: CubicBezier = { x1: 0.7, y1: 0, x2: 0.84, y2: 0 }

const cubicBezier = ({ x1, y1, x2, y2 }: CubicBezier): string =>
  `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`

function deriveMotion(temperament: MotionTemperament): MotionTokens {
  const scale = MOTION_SCALE[temperament]
  const ms = (base: number, exit = false) =>
    `${Math.round(base * (exit ? EXIT_RATIO : 1) * scale)}ms`
  const ambient = (base: number) => (scale === 0 ? '0s' : `${Math.round(base / scale)}ms`)
  const easingCurve: Record<EasingRole, CubicBezier> = {
    enter: { ...EASING_ENTER },
    exit: { ...EASING_EXIT },
    standard: { ...EASING_STANDARD },
    overshoot: { ...(temperament === 'expressive' ? EASING_OVERSHOOT : EASING_STANDARD) },
  }

  return {
    duration: {
      control: ms(BASE_DURATION_MS.control),
      controlExit: ms(BASE_DURATION_MS.control, true),
      surface: ms(BASE_DURATION_MS.surface),
      surfaceExit: ms(BASE_DURATION_MS.surface, true),
      overlay: ms(BASE_DURATION_MS.overlay),
      overlayExit: ms(BASE_DURATION_MS.overlay, true),
    },
    easing: {
      enter: cubicBezier(easingCurve.enter),
      exit: cubicBezier(easingCurve.exit),
      standard: cubicBezier(easingCurve.standard),
      overshoot: cubicBezier(easingCurve.overshoot),
    },
    easingCurve,
    spring: SPRINGS[temperament],
    pressScale: `${PRESS_SCALE[temperament]}`,
    ambient: {
      shimmer: ambient(AMBIENT_PERIOD_MS.shimmer),
      spin: ambient(AMBIENT_PERIOD_MS.spin),
    },
    stagger: {
      step: ms(STAGGER_STEP_MS),
      max: ms(STAGGER_MAX_MS),
    },
  }
}

// --------------------------------------------------------------------- shell

/**
 * Shell chrome surfaces as data. Values are role references, so the contrast
 * law still covers them. A raw colour would bypass it.
 *
 * Flat relies on borders for every separation, so its region edges use
 * `border.default`. Systems with shadows use `border.subtle`.
 */
function deriveShellRef(depth: Depth): NonColorTokens['shellRef'] {
  const edge = depth === 'flat' ? 'border.default' : 'border.subtle'
  return {
    topbarBg: 'bg.surface',
    railBg: 'bg.subtle',
    topbarBorder: edge,
    railBorder: edge,
  }
}

// --------------------------------------------------------------------- fonts

const SANS_FALLBACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const SERIF_FALLBACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif'
const MONO_FALLBACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

function quote(family: string): string {
  return /[^a-zA-Z0-9-]/.test(family) ? `"${family}"` : family
}

const FALLBACK_STACKS: Record<FallbackClass, string> = {
  sans: SANS_FALLBACK,
  serif: SERIF_FALLBACK,
  mono: MONO_FALLBACK,
}

/**
 * The seed family plus a system fallback.
 *
 * The class comes from the family when declared, else from the personality.
 * Personality alone cannot express a serif display over a sans body: the
 * display would fall back to Arial except under `editorial`, so a slow webfont
 * would change the typeface. `mono` always falls back to mono, so code does
 * not reflow.
 *
 * Apps load the webfonts. The library never bundles them.
 */
export function deriveFontStacks(axes: Axes, seeds: Seeds): Record<FontRole, string> {
  const stack = (role: FontRole): string =>
    `${quote(seeds.fonts[role].family)}, ${FALLBACK_STACKS[fontFallbackClass(axes, seeds, role)]}`
  return { body: stack('body'), display: stack('display'), mono: stack('mono') }
}

/** A slot's fallback class: the seeded one, else the personality's, and always mono for mono. */
export function fontFallbackClass(axes: Axes, seeds: Seeds, role: FontRole): FallbackClass {
  const byPersonality: FallbackClass = axes.typePersonality === 'editorial' ? 'serif' : 'sans'
  return seeds.fonts[role].fallback ?? (role === 'mono' ? 'mono' : byPersonality)
}

// ------------------------------------------------------------------ assembly

export function deriveNonColorTokens(
  axes: Axes,
  // Optional for callers with only axes (coherence fixtures, laws). The only
  // seed input here. Defaults to upright.
  displayStyle: 'normal' | 'italic' = 'normal',
  // Optional for the same reason. A system's value-only overrides; absent means
  // the axes' ladder unchanged.
  overrides: SystemOverrides = {},
): NonColorTokens {
  const text = deriveTextScale(axes, overrides.type)

  // Every density and temperament is derived and the axes pick the default,
  // so switching is an attribute swap. Contextual density never changes the
  // type ratio.
  const density = Object.fromEntries(
    DENSITIES.map((value) => [value, deriveDensityTokens(value, overrides)] as const),
  ) as Record<Density, DensityScopedTokens>

  const motion = Object.fromEntries(
    MOTION_TEMPERAMENTS.map((value) => [value, deriveMotion(value)] as const),
  ) as Record<MotionTemperament, MotionTokens>

  // The structured values come first and every emitted string is rendered
  // from them, so the CSS and the token document read one derivation.
  const radiusAssignRef = deriveRadiusAssignRef(overrides.assign)
  const shadowAssignRef = deriveShadowAssignRef(overrides.assign)
  const insetAssignRef = deriveInsetAssignRef(overrides.assign)
  const shadowLayers = deriveShadowLayers(axes.depth, overrides.shadow)
  const glowLayers = deriveGlowLayers(axes.ornament)
  const insetTopLayer = deriveInsetTopLayer(axes.depth)
  const shellRef = deriveShellRef(axes.depth)
  const focus = focusPx(axes.contrastTemperament, overrides.focus)
  // Tabular figures, plus `slashed-zero` for mono, where zero is ambiguous.
  const numericVariants: NumericVariant[] =
    axes.typePersonality === 'mono' ? ['tabular-nums', 'slashed-zero'] : ['tabular-nums']

  return {
    density,
    motion,
    text,
    textEntry: deriveTextEntry(overrides.type?.base ?? TYPE_BASE_PX),
    display: deriveDisplayScale(axes, displayStyle, overrides.type),
    radius: deriveRadii(axes.geometry, overrides.radius),
    radiusAssign: asVars(radiusAssignRef),
    radiusAssignRef,
    shadowAssign: asVars(shadowAssignRef),
    shadowAssignRef,
    insetAssign: asVars(insetAssignRef),
    insetAssignRef,
    shadow: {
      control: renderLayers(shadowLayers.control),
      raised: renderLayers(shadowLayers.raised),
      overlay: renderLayers(shadowLayers.overlay),
    },
    shadowLayers,
    glow: { focus: renderLayers(glowLayers.focus), hover: renderLayers(glowLayers.hover) },
    glowLayers,
    insetTop: renderLayers(insetTopLayer === null ? [] : [insetTopLayer]),
    insetTopLayer,
    material: DEPTH_MATERIAL[axes.depth],
    texture: deriveTexture(axes.ornament),
    textureSpec: deriveTextureSpec(axes.ornament),
    numeric: numericVariants.join(' '),
    numericVariants,
    // A choice, like the hover and field focus choices. `end` is the default,
    // because figures that share their ones column read as one column.
    numericAlign: overrides.numeric?.align ?? 'end',
    shell: asVars(shellRef),
    shellRef,
    focus: {
      // Overridable. The schema's 2px floor (the softest temperament's width)
      // keeps the mark visible.
      width: `${focus.width}px`,
      offset: `${focus.offset}px`,
      place: focus.offset < 0 ? 'inside' : 'outside',
      // A choice, not a value: the recipe branches on the flag. `ring` is the
      // default because it is the convention every other focusable part draws.
      field: overrides.focus?.field ?? 'ring',
    },
    hover: { unfilled: overrides.hover?.unfilled ?? 'wash' },
    // The web's floor at every density (see `NonColorTokens.hitTarget`).
    hitTarget: `${PLATFORM_FLOORS.web.hitTarget}px`,
    icon: deriveIcons(axes, text),
    z: Z_LADDER,
  }
}
