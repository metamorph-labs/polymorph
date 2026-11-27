import { z } from 'zod'

import type { Density, MotionTemperament } from './axes'
import type { ColorRole } from './roles'
import { FONT_ROLES, type FontRole } from './seeds'
import type { Mode } from './theme'

/**
 * Non-colour token shapes, with no values. `derive.ts` derives the values and
 * holds the tuned constants. The emitter (`emit.ts`) writes from these types.
 */

/**
 * Eleven steps, 0-10, on the ladder `SPACE_LADDER_PX` in `derive.ts`. The top
 * step is page-level spacing.
 */
export const SPACE_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
export type SpaceStep = (typeof SPACE_STEPS)[number]

export const TEXT_STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const
export type TextStep = (typeof TEXT_STEPS)[number]

/**
 * The text steps drawn in the heading slot: the steps the type-usage table
 * gives headings and titles (`design/components/README.md`), from Heading's
 * level 3 at `lg` to a Stat's value at `3xl`. The steps under them are body
 * sizes and draw in the body slot.
 */
export const HEADING_TEXT_STEPS = ['lg', 'xl', '2xl', '3xl'] as const satisfies readonly TextStep[]

export const DISPLAY_STEPS = ['sm', 'md', 'lg'] as const
export type DisplayStep = (typeof DISPLAY_STEPS)[number]

export const RADIUS_STEPS = ['none', 'sm', 'md', 'lg', 'pill'] as const
export type RadiusStep = (typeof RADIUS_STEPS)[number]

/**
 * The component classes a radius is assigned to, as data.
 *
 * The assignment map (`design/components/README.md`, radius assignment) gives
 * controls `md`, small details `sm` and surfaces `lg`, as references like the
 * shell tokens. A recipe writes `var(--pm-radius-control)` and the system
 * picks the step. `pill` is not a class: it is a meaning (a track is a
 * capsule) and cannot be reassigned.
 */
export const RADIUS_ASSIGNMENT_CLASSES = ['control', 'detail', 'surface'] as const
export type RadiusAssignmentClass = (typeof RADIUS_ASSIGNMENT_CLASSES)[number]

/**
 * Shadow assignment classes, named by role because `control` is already a
 * step: a control's contact `seat`, a `resting` surface's lift, a `transient`
 * surface's float. Switch thumb and Tooltip are outside the map and use
 * `raised` on purpose.
 */
export const SHADOW_ASSIGNMENT_CLASSES = ['seat', 'resting', 'transient'] as const
export type ShadowAssignmentClass = (typeof SHADOW_ASSIGNMENT_CLASSES)[number]

/**
 * Container-inset classes: the large `surface` (Card, Dialog), the small
 * floating `pane` (Popover, HoverCard, Toast) and the row-holding `list`
 * (Menu, Select content). Row and control insets stay in member recipes.
 */
export const INSET_ASSIGNMENT_CLASSES = ['surface', 'pane', 'list'] as const
export type InsetAssignmentClass = (typeof INSET_ASSIGNMENT_CLASSES)[number]

/**
 * `control` is the contact shadow under a control, the shortest in the system,
 * so a filled button need not imitate one with a border.
 */
export const SHADOW_STEPS = ['control', 'raised', 'overlay'] as const
export type ShadowStep = (typeof SHADOW_STEPS)[number]

/**
 * Coloured halos, separate from `shadow.*` because they are **decorative
 * only**: a glow must never replace the focus ring. Values reference the
 * `*.glow` roles, so a halo matches the hue of its element.
 */
export const GLOW_STEPS = ['focus', 'hover'] as const
export type GlowStep = (typeof GLOW_STEPS)[number]

/**
 * One `box-shadow` layer as numbers, in px. `derive.ts` renders the CSS string
 * from these, so the string and the numbers cannot disagree.
 *
 * `color` is a CSS colour. A glow takes its colour from a role that varies by
 * mode, so its `color` is the `var()` reference and `colorRef` names the role.
 */
export interface ShadowLayerValue {
  x: number
  y: number
  blur: number
  spread: number
  color: string
  colorRef?: ColorRole
  inset: boolean
}

/** sRGB channels, 0-255. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * A page texture as parameters, the input `derive.ts` draws the SVG from.
 *
 * Grain is fractal noise (`baseFrequency`, `octaves`) whose darkest pixel is
 * `alpha`. Grid is a hairline (`strokeWidth`) along two edges of each `tile`,
 * drawn in `stroke` at `alpha`. Both tiles are `tile` px square.
 */
export type TextureSpec =
  | { kind: 'none' }
  | { kind: 'grain'; alpha: number; tile: number; baseFrequency: number; octaves: number }
  | { kind: 'grid'; alpha: number; tile: number; stroke: Rgb; strokeWidth: number }

/** A `cubic-bezier()` easing as its four control values. */
export interface CubicBezier {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * How a focused field shows focus. `ring` is the shared mark every part draws,
 * the default. `border` draws the outline inside the field's edge whatever the
 * system's offset, so it differs from `ring` only in a system that moves the
 * mark outside. A system chooses it (`overrides.focus.field`), the emitter
 * writes it as the flag `--pm-focus-field`, and `focus.module.css` branches on
 * the flag.
 */
export const FIELD_FOCUS_STYLES = ['ring', 'border'] as const
export type FieldFocusStyle = (typeof FIELD_FOCUS_STYLES)[number]

/**
 * Where the focus mark is drawn, read from the offset: `inside` the part's
 * edge for a negative offset, the derived default, and `outside` it for 0 or
 * more. The emitter writes it as the flag `--pm-focus-place`, and
 * `focus.module.css` branches on it. Inside, a filled part draws the mark in
 * its own text colour, and a part whose border carries state moves the mark in
 * past that border. Outside, the mark is drawn on the surface behind the part,
 * in the focus colour, and covers no border. A value token cannot carry the
 * choice, because it switches which colour a rule reads.
 */
export const FOCUS_PLACES = ['inside', 'outside'] as const
export type FocusPlace = (typeof FOCUS_PLACES)[number]

/**
 * Whether a control with no rest fill (Button's `outline` and `ghost`) takes a
 * wash under the pointer. `wash` is the default. `none` leaves the hover
 * background transparent; the press wash and the on state stay. A system
 * chooses it (`overrides.hover.unfilled`), the emitter writes it as the flag
 * `--pm-hover-unfilled`, and `button.module.css` branches on the flag.
 */
export const UNFILLED_HOVERS = ['wash', 'none'] as const
export type UnfilledHover = (typeof UNFILLED_HOVERS)[number]

/** The `font-variant-numeric` keywords the derivation uses. */
export type NumericVariant = 'tabular-nums' | 'slashed-zero'

/**
 * Which side of its column a numeric column's figures sit on: Table's
 * `numeric` headers, cells and totals, and DataTable's `numeric` columns. `end`
 * is the default, so the ones, tens and hundreds of a column's figures line up.
 * `start` puts them at the column's start edge, where its label begins. Both
 * keep tabular figures. A system chooses it (`overrides.numeric.align`), and
 * the emitter writes it as `--pm-numeric-align`, a value `table.module.css`
 * sets as the cell's `text-align`. It is a keyword, not a role, so a value
 * token carries it and no recipe branches on it.
 */
export const NUMERIC_ALIGNS = ['end', 'start'] as const
export type NumericAlign = (typeof NUMERIC_ALIGNS)[number]

export const ICON_SIZES = ['sm', 'md', 'lg'] as const
export type IconSize = (typeof ICON_SIZES)[number]

/**
 * The stacking ladder: four fixed planes. `raise` lifts within a member (the
 * focused half of a split control, a chart readout over its plot). `shell` is
 * shell chrome (the drawer-mode rail). `overlay` is every portalled overlay.
 * `toast` is above them all. The integer values leave gaps so an app can place
 * something between `shell` and `overlay`. The value law governs `z-index`, so
 * a recipe cannot add a fifth plane by writing a number.
 */
export const Z_STEPS = ['raise', 'shell', 'overlay', 'toast'] as const
export type ZStep = (typeof Z_STEPS)[number]

/**
 * Enter durations and their exits, as separate keys because CSS transitions
 * need literal values. `EXIT_RATIO` in `derive.ts` sets the ~0.65x relation.
 */
export const DURATION_ROLES = [
  'control',
  'controlExit',
  'surface',
  'surfaceExit',
  'overlay',
  'overlayExit',
] as const
export type DurationRole = (typeof DURATION_ROLES)[number]

/**
 * Enter decelerates, exit accelerates, standard is for symmetric changes.
 * `overshoot` gives CSS transitions a spring-like feel without the motion
 * engine, and equals `standard` below `expressive`, so calm systems never
 * overshoot.
 */
export const EASING_ROLES = ['enter', 'exit', 'standard', 'overshoot'] as const
export type EasingRole = (typeof EASING_ROLES)[number]

export const SPRING_ROLES = ['default', 'snappy', 'gentle'] as const
export type SpringRole = (typeof SPRING_ROLES)[number]

export const springSchema = z.strictObject({
  stiffness: z.number().positive(),
  damping: z.number().positive(),
  mass: z.number().positive(),
})
export type Spring = z.infer<typeof springSchema>

/**
 * One type step. `size`/`tracking` are emitted as CSS values. `lineHeight` is
 * unitless, because the value rule allows a unitless `line-height` literal.
 */
export const typeStyleSchema = z.strictObject({
  size: z.string().min(1),
  lineHeight: z.number().positive(),
  weight: z.number().int().min(1).max(1000),
  family: z.enum(FONT_ROLES),
  tracking: z.string().min(1),
})
export type TypeStyle = z.infer<typeof typeStyleSchema> & { family: FontRole }

/**
 * The text-entry floor. Below the phone line a text-entry recipe takes this
 * size and line-height instead of its step's, because iOS Safari zooms the
 * viewport when a focused field's font-size is under 16px
 * (`design/components/README.md`, the focus-zoom floor). It is the md step or
 * 16px, whichever is larger, so a base under 16px keeps its fields at 16px on
 * a phone and a larger base keeps its own. The zoom is a browser behaviour,
 * so the floor is emitted to CSS only; a native text field has no viewport.
 */
export interface TextEntry {
  size: string
  lineHeight: number
}

/**
 * The part of the scale that varies with density: space and component
 * dimensions **only**, never the type ratio.
 */
export interface DensityScopedTokens {
  space: Record<SpaceStep, string>
  /** Heights for sm/md/lg controls, so density reflows components too. */
  controlHeight: Record<'sm' | 'md' | 'lg', string>
}

/** Ambient loops a component may run; periods scale inversely. */
export const AMBIENT_ROLES = ['shimmer', 'spin'] as const
export type AmbientRole = (typeof AMBIENT_ROLES)[number]

export interface MotionTokens {
  duration: Record<DurationRole, string>
  easing: Record<EasingRole, string>
  /** The control values `easing` is rendered from. */
  easingCurve: Record<EasingRole, CubicBezier>
  spring: Record<SpringRole, Spring>
  /**
   * Tokens so CSS press feedback rescales with temperament and CSS ambient
   * loops get their periods (`design/motion/motion.md`). At `none`,
   * `pressScale` is `1` and periods are `0s`.
   */
  pressScale: string
  ambient: Record<AmbientRole, string>
  /**
   * The bounded stagger primitive. Unbounded, the fortieth row of a table
   * would appear 1.5s late. `step` is the per-index delay and `max` caps the
   * total, so longer lists get a tighter stagger.
   *
   * Both are `0s` at `none`, and reduced motion removes stagger entirely,
   * because a delay counts as motion.
   */
  stagger: { step: string; max: string }
}

/**
 * A display step, with the treatments large type needs and body type does not.
 *
 * `opsz` is the size in px, passed through for families with an optical-size
 * axis. `style` is the display slot's font-style, so a system can use an
 * italic display without changing the family.
 */
export interface DisplayStyle extends TypeStyle {
  opsz: number
  style: 'normal' | 'italic'
}

export interface NonColorTokens {
  /** All three are always derived. The theme axis selects the default. */
  density: Record<Density, DensityScopedTokens>
  /**
   * All four temperaments, likewise, so switching is an attribute change
   * (`[data-motion]`). Scaling is in the tokens so CSS transitions rescale
   * with the motion engine.
   */
  motion: Record<MotionTemperament, MotionTokens>
  text: Record<TextStep, TypeStyle>
  textEntry: TextEntry
  display: Record<DisplayStep, DisplayStyle>
  radius: Record<RadiusStep, string>
  /**
   * The radius assignment map as references to `var(--pm-radius-<step>)`, so
   * re-pointing a class changes every member that uses it without a recipe
   * edit. The step tokens still serve uses the map does not cover.
   */
  radiusAssign: Record<RadiusAssignmentClass, string>
  /** The token path each radius class points at (`radius.md`), which `radiusAssign` wraps in `var()`. */
  radiusAssignRef: Record<RadiusAssignmentClass, `radius.${RadiusStep}`>
  /** The shadow map as references (`--pm-shadow-seat/resting/transient`). */
  shadowAssign: Record<ShadowAssignmentClass, string>
  /** The token path each shadow class points at (`shadow.raised`). */
  shadowAssignRef: Record<ShadowAssignmentClass, `shadow.${ShadowStep}`>
  /** The container-inset map as references (`--pm-inset-surface/pane/list`). */
  insetAssign: Record<InsetAssignmentClass, string>
  /** The space step each inset class points at (`space.6`). */
  insetAssignRef: Record<InsetAssignmentClass, `space.${number}`>
  shadow: Record<ShadowStep, string>
  /** The layers each `shadow` string is rendered from. Empty is `none`. */
  shadowLayers: Record<ShadowStep, readonly ShadowLayerValue[]>
  glow: Record<GlowStep, string>
  /** The layers each `glow` string is rendered from. Empty is `none`. */
  glowLayers: Record<GlowStep, readonly ShadowLayerValue[]>
  /**
   * The inset top highlight that makes a filled control look lit. `none`
   * under `depth: flat`. It composes with a gradient fill.
   */
  insetTop: string
  /** The layer `insetTop` is rendered from, or `null` for `none`. */
  insetTopLayer: ShadowLayerValue | null
  /**
   * Page texture: a data-URI SVG, or `none`. Gated on the ornament axis, so
   * `none` and `minimal` cannot produce one.
   *
   * Per mode, because black strokes are invisible on a near-black page: black
   * on light, white on dark. Grain is grey noise visible on both, so its two
   * entries share one pattern. The ΔL bound applies in both directions.
   */
  texture: { page: Record<Mode, string> }
  /** The parameters each `texture.page` pattern is drawn from. */
  textureSpec: { page: Record<Mode, TextureSpec> }
  /**
   * Material: what a surface is made of (depth is how it separates). Only
   * `depth: glass` gives it effect, gated like texture on ornament:
   *
   * - `blur`: the backdrop blur radius.
   * - `saturate`: the backdrop saturation boost that keeps blurred content
   *   coloured.
   * The pane's fill is a colour, so it resolves with the colours
   * (`ResolvedTheme.materialSurface`) at `GLASS_SURFACE_MIX`. The value law
   * forbids `color-mix` in recipes, because a mix is a colour decision.
   */
  material: { blur: string; saturate: string }
  /**
   * `font-variant-numeric` for data surfaces. Tables need tabular numerals,
   * and switching to the mono family would change the whole column's look.
   */
  numeric: string
  /** The keywords `numeric` joins. */
  numericVariants: readonly NumericVariant[]
  /** Which side of its column a numeric column's figures sit on (see `NUMERIC_ALIGNS`). */
  numericAlign: NumericAlign
  /**
   * The shell's region surfaces, pattern-scoped under `--pm-shell-*`.
   *
   * Values, not recipe code, so "dark rail on a light page", "seated topbar"
   * and "paper rail" are three values, not three edits to
   * `app-shell.module.css`. They are role references, so the contrast law
   * still applies when a system points a region at another surface.
   */
  shell: { topbarBg: string; railBg: string; topbarBorder: string; railBorder: string }
  /** The colour role each `shell` value references. */
  shellRef: {
    topbarBg: ColorRole
    railBg: ColorRole
    topbarBorder: ColorRole
    railBorder: ColorRole
  }
  /**
   * The focus mark's width and offset, tunable per system. The mark is one
   * global convention. `place` is read from the offset (see `FOCUS_PLACES`),
   * and `field` is how a focused field draws it (see `FIELD_FOCUS_STYLES`).
   */
  focus: { width: string; offset: string; place: FocusPlace; field: FieldFocusStyle }
  /** Whether an unfilled control washes under the pointer (see `UNFILLED_HOVERS`). */
  hover: { unfilled: UnfilledHover }
  /**
   * The minimum pressable size (`--pm-hit-target`): the web's floor, WCAG 2.5.8's
   * 24px (`PLATFORM_FLOORS` in `platforms.ts`). The same at every density,
   * because density changes how large a control looks, never the smallest
   * target a pointer or finger must hit. A pressable element drawn smaller
   * than this extends its hit area with a pseudo-element to at least this: to
   * this token, or to `--pm-control-height-sm`, which the derivation keeps at
   * or above it.
   */
  hitTarget: string
  /** Sizes align to text line-heights so inline icons sit on the type scale.
   *  Stroke is per size, in SVG units compensated so every size renders the
   *  stroke weight tuned at `md` (see `deriveIcons`). */
  icon: { size: Record<IconSize, string>; stroke: Record<IconSize, string> }
  /** The stacking ladder (see `Z_STEPS`). Constants, because the vocabulary
   *  fixes the plane order. */
  z: Record<ZStep, string>
}
