import { z } from 'zod'

import {
  AXIS_NAMES,
  axesSchema,
  DENSITIES,
  MOTION_TEMPERAMENTS,
  type Axes,
  type Density,
  type MotionTemperament,
} from './axes'
import { fontFallbackClass, TYPE_BASE_PX } from './derive'
import { PLATFORM_FLOORS, PLATFORMS, type Platform } from './platforms'
import {
  CHART_ROLES,
  COLOR_ROLES,
  GRADIENT_ROLES,
  type ChartRole,
  type ColorRole,
  type ColorRoleValues,
  type GradientRole,
} from './roles'
import { FALLBACK_CLASSES, FONT_ROLES, type FallbackClass, type FontRole } from './seeds'
import {
  MODE_PREFERENCES,
  MODES,
  THEME_KINDS,
  type Mode,
  type ModePreference,
  type ResolvedTheme,
  type ThemeKind,
} from './theme'
import {
  AMBIENT_ROLES,
  DISPLAY_STEPS,
  DURATION_ROLES,
  EASING_ROLES,
  FIELD_FOCUS_STYLES,
  FOCUS_PLACES,
  GLOW_STEPS,
  ICON_SIZES,
  INSET_ASSIGNMENT_CLASSES,
  NUMERIC_ALIGNS,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
  UNFILLED_HOVERS,
  Z_STEPS,
  type AmbientRole,
  type CubicBezier,
  type DisplayStep,
  type DurationRole,
  type EasingRole,
  type FieldFocusStyle,
  type FocusPlace,
  type GlowStep,
  type IconSize,
  type InsetAssignmentClass,
  type NumericAlign,
  type RadiusAssignmentClass,
  type RadiusStep,
  type ShadowAssignmentClass,
  type ShadowLayerValue,
  type ShadowStep,
  type SpaceStep,
  type SpringRole,
  type TextStep,
  type TextureSpec,
  type TypeStyle,
  type UnfilledHover,
  type ZStep,
} from './tokens'

/**
 * The token document: a resolved pairing as plain JSON, for every emitter
 * that is not CSS.
 *
 * The CSS emitter (`emit.ts`) writes strings a browser resolves: `var()`
 * references, multi-layer `box-shadow` lists, `linear-gradient(...)`, SVG data
 * URIs, and scopes the cascade selects between. A SwiftUI, Compose or Dart
 * emitter can read none of that. The document gives each of them the same
 * decisions with every value structured and every reference resolved:
 *
 * - **Keys are CSS token paths** without the `--pm-` prefix (`radius.md`,
 *   `text.md.size`), so `cssVarName(key)` is the property a browser reads.
 *   Keys that start with a digit stay as they are (`space.0`, `chart.1`);
 *   platform emitters rename them.
 * - **Scopes become sections.** `invariant` holds what no scope changes;
 *   `density`, `motion` and `mode` hold one record per value of their scope;
 *   `inverse` holds what `[data-tone="inverse"]` borrows. A reference whose
 *   target varies by scope is resolved in that scope's section: an inset
 *   (which names a space step) in each density, a shell surface and a glow
 *   (which name colour roles) in each mode.
 * - **A resolved reference keeps its name** in `ref`, beside the value.
 * - **Lengths keep their CSS unit** (`{ value: 4, unit: 'px' }`). The px is the
 *   CSS reference pixel, which is the iOS point, the Android dp and the
 *   Flutter logical pixel. Type sizes are `rem` with their `px` at the 16px
 *   base beside them. Durations are milliseconds as numbers.
 * - **Colours** are `{ hex, alpha, r, g, b }`, sRGB, channels 0–255.
 *
 * `platform` applies the platform's floors (`platforms.ts`). The hit target
 * is raised to the platform's minimum hit area (44 on iOS, 48 on Android and
 * in Flutter), and `floor.raised` records what it was raised from at each
 * density. Control heights keep the derivation's values on every platform:
 * the platforms' minimums are hit areas, not visual heights, so a member
 * extends its hit area to `hitTarget` and keeps the density's height. Their
 * floor is the web's 24, which the derivation already clears, so nothing
 * raises one. `unsupported` lists the paths the platform cannot draw, so a
 * platform emitter skips them by reading data, not by knowing the list.
 *
 * Determinism: the same theme and platform give byte-identical JSON. Every
 * key is written in its catalogue's order and exceptions in declared order.
 */

export const TOKEN_DOCUMENT_FORMAT = 'polymorph-tokens/1'

/* -------------------------------------------------------------------------- */
/* Value shapes                                                                */
/* -------------------------------------------------------------------------- */

export interface TokenColor {
  hex: string
  alpha: number
  r: number
  g: number
  b: number
}

/** A colour resolved from a role reference, naming the role. */
export interface TokenRefColor extends TokenColor {
  ref: string
}

export interface TokenPx {
  value: number
  unit: 'px'
}

/** A type size: the CSS `rem` value, and its px at the 16px base. */
export interface TokenRem {
  value: number
  unit: 'rem'
  px: number
}

export interface TokenEm {
  value: number
  unit: 'em'
}

/** A length resolved from a reference (`radius.control` → `radius.md`). */
export interface TokenRefPx extends TokenPx {
  ref: string
}

export interface TokenShadowLayer {
  x: number
  y: number
  blur: number
  spread: number
  color: TokenColor | TokenRefColor
  inset: boolean
}

/** A `box-shadow` as layers, in px. An empty list is `none`. */
export interface TokenShadow {
  layers: TokenShadowLayer[]
}

export interface TokenRefShadow extends TokenShadow {
  ref: string
}

/** A type step's family: the font slot it references, and that slot's family. */
export interface TokenFamilyRef {
  ref: `font.${FontRole}`
  family: string
}

/** `font-variant-numeric` as OpenType feature tags. */
export interface TokenNumeric {
  features: ('tnum' | 'zero')[]
}

export interface TokenSpring {
  stiffness: number
  damping: number
  mass: number
  /**
   * `damping / (2 * sqrt(stiffness * mass))`, unrounded like every other number
   * here: below 1 overshoots, 1 and above does not.
   */
  dampingRatio: number
}

export interface TokenGradient {
  solid: boolean
  /** Degrees, CSS convention: 0 points up, 90 right. */
  angle: number
  from: TokenColor
  to: TokenColor
  stops: { color: TokenColor; at: number }[]
}

export type TokenTexture =
  | { kind: 'none' }
  | { kind: 'grain'; alpha: number; tile: number; baseFrequency: number; octaves: number }
  | { kind: 'grid'; alpha: number; tile: number; stroke: TokenColor; strokeWidth: number }

/** A space reference resolved per density (an inset exception names a space step). */
export interface TokenDensityRef {
  ref: string
  density: Record<Density, TokenPx>
}

export interface TokenFont {
  /** The family name without Fontsource's ` Variable` suffix. */
  family: string
  /** Whether the system seeds the variable build of the family. */
  variable: boolean
  fallback: FallbackClass
  style: 'normal' | 'italic'
  /** Every weight a type step sets in this slot, ascending. */
  weights: number[]
  /** The display slot only: every optical size a display step requests, ascending. */
  opsz?: number[]
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

type TypeKey = `text.${TextStep}` | `display.${DisplayStep}`

export type InvariantTokens = {
  'font.numeric': TokenNumeric
  'numeric.align': NumericAlign
} & Record<`text.${TextStep}.size` | `display.${DisplayStep}.size`, TokenRem> &
  Record<`${TypeKey}.lineHeight` | `${TypeKey}.weight` | `display.${DisplayStep}.opsz`, number> &
  Record<`${TypeKey}.family`, TokenFamilyRef> &
  Record<`${TypeKey}.tracking`, TokenEm> &
  Record<`display.${DisplayStep}.style`, 'normal' | 'italic'> &
  Record<`radius.${RadiusStep}`, TokenPx> &
  Record<`radius.${RadiusAssignmentClass}`, TokenRefPx> &
  Record<`shadow.${ShadowAssignmentClass}`, TokenRefShadow> &
  Record<`shadow.${ShadowStep}` | 'shadow.insetTop', TokenShadow> &
  Record<'material.blur' | 'focus.width' | 'focus.offset' | `icon.size.${IconSize}`, TokenPx> &
  Record<'material.saturate' | `icon.stroke.${IconSize}` | `z.${ZStep}`, number> &
  Record<'focus.place', FocusPlace> &
  Record<'focus.field', FieldFocusStyle> &
  Record<'hover.unfilled', UnfilledHover>

export type DensityTokens = Record<
  `space.${SpaceStep}` | `controlHeight.${ControlSize}` | 'hitTarget',
  TokenPx
> &
  Record<`inset.${InsetAssignmentClass}`, TokenRefPx>

export type MotionTokenSet = Record<
  | `motion.duration.${DurationRole}`
  | `motion.ambient.${AmbientRole}`
  | 'motion.pressScale'
  | 'motion.stagger.step'
  | 'motion.stagger.max',
  number
> &
  Record<`motion.easing.${EasingRole}`, CubicBezier> &
  Record<`motion.spring.${SpringRole}`, TokenSpring>

const SHELL_PATHS = {
  topbarBg: 'shell.topbar.bg',
  railBg: 'shell.rail.bg',
  topbarBorder: 'shell.topbar.border',
  railBorder: 'shell.rail.border',
} as const
type ShellPath = (typeof SHELL_PATHS)[keyof typeof SHELL_PATHS]

export interface ModeTokens {
  color: Record<ColorRole, TokenColor>
  gradient: Record<GradientRole, TokenGradient>
  chart: Record<ChartRole, TokenColor>
  /** Halos take their colour from a role, so they resolve per mode. */
  glow: Record<`glow.${GlowStep}`, TokenShadow>
  /** The shell's region surfaces, resolved from the roles they reference. */
  shell: Record<ShellPath, TokenRefColor>
  /** `texture.page` as parameters. */
  texture: TokenTexture
  /** `material.surface`: the glass pane's fill. */
  materialSurface: TokenColor
}

/** What `[data-tone="inverse"]` borrows from the opposite mode: the roles that differ. */
export interface InverseTokens {
  color: Partial<Record<ColorRole, TokenColor>>
  chart: Partial<Record<ChartRole, TokenColor>>
}

type ControlSize = 'sm' | 'md' | 'lg'
const CONTROL_SIZES = ['sm', 'md', 'lg'] as const satisfies readonly ControlSize[]

/**
 * A token the platform's floor raised, at one density. On every house pairing
 * that is the hit target alone: control heights clear their floor of 24 as
 * derived.
 */
export interface RaisedToken {
  density: Density
  token: `controlHeight.${ControlSize}` | 'hitTarget'
  from: number
  to: number
}

export interface DocumentException {
  /** The member's slug, as `data-member` carries it. */
  member: string
  /** The class token the exception re-points (`radius.control`). */
  token: string
  value: TokenRefPx | TokenRefShadow | TokenDensityRef
}

export interface TokenDocument {
  format: typeof TOKEN_DOCUMENT_FORMAT
  platform: Platform
  pairing: {
    name: string
    system: string
    palette: string
    kind: ThemeKind
    axes: Axes
    defaultMode: ModePreference
    /** `chart.cap`: the any-neighbour series cap, the same in both modes. */
    chartCap: number
  }
  /** `font.body`, `font.display`, `font.mono`. */
  fonts: Record<FontRole, TokenFont>
  floor: { controlHeight: number; hitTarget: number; raised: RaisedToken[] }
  invariant: InvariantTokens
  density: Record<Density, DensityTokens>
  motion: Record<MotionTemperament, MotionTokenSet>
  mode: Record<Mode, ModeTokens>
  inverse: Record<Mode, InverseTokens>
  exceptions: DocumentException[]
  /** Token paths the platform cannot draw. They stay in the document. */
  unsupported: string[]
}

/**
 * What each platform cannot draw. The page texture is an SVG data URI with
 * an `feTurbulence` filter, which no native UI toolkit renders, so native
 * platforms get its parameters and no obligation to draw them.
 */
const UNSUPPORTED: Record<Platform, readonly string[]> = {
  web: [],
  ios: ['texture.page'],
  android: ['texture.page'],
  dart: ['texture.page'],
}

/* -------------------------------------------------------------------------- */
/* Reading the engine's values                                                 */
/* -------------------------------------------------------------------------- */

/*
 * The engine writes two colour forms (`toCssColor`) and a handful of length
 * forms. These read exactly those forms and throw on anything else, so a new
 * form fails here instead of reaching a platform as a wrong value.
 */

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/
const RGBA = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (\d*\.?\d+)\)$/
const NUMBER = /^-?\d*\.?\d+$/
const LENGTH = /^(-?\d*\.?\d+)(px|rem|em|ms|s)$/

const channelHex = (channel: number) => channel.toString(16).padStart(2, '0')

function readColor(css: string): TokenColor {
  const hex = HEX.exec(css)
  if (hex) {
    const [r, g, b] = [hex[1], hex[2], hex[3]].map((pair) => parseInt(pair ?? '', 16))
    return { hex: css, alpha: 1, r: r ?? 0, g: g ?? 0, b: b ?? 0 }
  }
  const rgba = RGBA.exec(css)
  if (rgba) {
    const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number) as [number, number, number]
    return {
      hex: `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`,
      alpha: Number(rgba[4]),
      r,
      g,
      b,
    }
  }
  throw new Error(`emitTokenDocument: unrecognised colour "${css}"`)
}

function readNumber(css: string): number {
  if (!NUMBER.test(css)) throw new Error(`emitTokenDocument: expected a number, got "${css}"`)
  return Number(css)
}

function readLength(css: string, unit: string): number {
  if (css === '0') return 0
  const match = LENGTH.exec(css)
  if (!match || match[2] !== unit) {
    throw new Error(`emitTokenDocument: expected a ${unit} length, got "${css}"`)
  }
  return Number(match[1])
}

const px = (css: string): TokenPx => ({ value: readLength(css, 'px'), unit: 'px' })
const em = (css: string): TokenEm => ({ value: readLength(css, 'em'), unit: 'em' })

function rem(css: string): TokenRem {
  const value = readLength(css, 'rem')
  return { value, unit: 'rem', px: value * TYPE_BASE_PX }
}

/** `140ms`, `0s` and `1.6s` to milliseconds. */
function ms(css: string): number {
  if (css === '0s' || css === '0') return 0
  const match = LENGTH.exec(css)
  if (match?.[2] === 'ms') return Number(match[1])
  if (match?.[2] === 's') return Math.round(Number(match[1]) * 1000)
  throw new Error(`emitTokenDocument: expected a duration, got "${css}"`)
}

const ascending = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b)

/** A layer whose colour references a role resolves it against one mode's colours. */
function layer(value: ShadowLayerValue, colors?: ColorRoleValues): TokenShadowLayer {
  let color: TokenColor | TokenRefColor
  if (value.colorRef === undefined) {
    color = readColor(value.color)
  } else {
    if (!colors) {
      throw new Error(
        `emitTokenDocument: ${value.colorRef} varies by mode, so it resolves in a mode`,
      )
    }
    color = { ref: value.colorRef, ...readColor(colors[value.colorRef]) }
  }
  return {
    x: value.x,
    y: value.y,
    blur: value.blur,
    spread: value.spread,
    color,
    inset: value.inset,
  }
}

function texture(spec: TextureSpec): TokenTexture {
  if (spec.kind !== 'grid') return { ...spec }
  const { r, g, b } = spec.stroke
  return {
    kind: 'grid',
    alpha: spec.alpha,
    tile: spec.tile,
    stroke: { hex: `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`, alpha: 1, r, g, b },
    strokeWidth: spec.strokeWidth,
  }
}

const NUMERIC_FEATURES = { 'tabular-nums': 'tnum', 'slashed-zero': 'zero' } as const

/* -------------------------------------------------------------------------- */
/* The document                                                                */
/* -------------------------------------------------------------------------- */

export interface TokenDocumentOptions {
  /** Which floors apply and what is unsupported. The web when omitted. */
  platform?: Platform
}

export function emitTokenDocument(
  theme: ResolvedTheme,
  options: TokenDocumentOptions = {},
): TokenDocument {
  const platform = options.platform ?? 'web'
  const floor = PLATFORM_FLOORS[platform]
  const tokens = theme.tokens

  /* fonts ------------------------------------------------------------------ */

  const styles: TypeStyle[] = [
    ...TEXT_STEPS.map((step) => tokens.text[step]),
    ...DISPLAY_STEPS.map((step) => tokens.display[step]),
  ]
  const weightsOf = (role: FontRole): number[] =>
    // No step names the mono slot. Recipes set it at the text steps (code,
    // kbd, JSON), so it needs the text steps' weights.
    role === 'mono'
      ? ascending(TEXT_STEPS.map((step) => tokens.text[step].weight))
      : ascending(styles.filter((style) => style.family === role).map((style) => style.weight))

  const fonts = Object.fromEntries(
    FONT_ROLES.map((role) => {
      const seeded = theme.seeds.fonts[role].family
      const font: TokenFont = {
        family: seeded.replace(/\s+Variable$/, ''),
        variable: /\s+Variable$/.test(seeded),
        fallback: fontFallbackClass(theme.axes, theme.seeds, role),
        // Only the display derivation reads a seeded style.
        style: role === 'display' ? tokens.display.md.style : 'normal',
        weights: weightsOf(role),
        ...(role === 'display'
          ? { opsz: ascending(DISPLAY_STEPS.map((step) => tokens.display[step].opsz)) }
          : {}),
      }
      return [role, font] as const
    }),
  ) as Record<FontRole, TokenFont>

  /* invariant -------------------------------------------------------------- */

  const typeEntries = (prefix: string, style: TypeStyle) => [
    [`${prefix}.size`, rem(style.size)],
    [`${prefix}.lineHeight`, style.lineHeight],
    [`${prefix}.weight`, style.weight],
    [
      `${prefix}.family`,
      { ref: `font.${style.family}`, family: fonts[style.family].family } as TokenFamilyRef,
    ],
    [`${prefix}.tracking`, em(style.tracking)],
  ]

  const invariant = Object.fromEntries([
    [
      'font.numeric',
      { features: tokens.numericVariants.map((variant) => NUMERIC_FEATURES[variant]) },
    ],
    // A choice every platform's tables read: which side a numeric column's figures sit on.
    ['numeric.align', tokens.numericAlign],
    ...TEXT_STEPS.flatMap((step) => typeEntries(`text.${step}`, tokens.text[step])),
    ...DISPLAY_STEPS.flatMap((step) => [
      ...typeEntries(`display.${step}`, tokens.display[step]),
      [`display.${step}.opsz`, tokens.display[step].opsz],
      [`display.${step}.style`, tokens.display[step].style],
    ]),
    ...RADIUS_STEPS.map((step) => [`radius.${step}`, px(tokens.radius[step])]),
    ...RADIUS_ASSIGNMENT_CLASSES.map((cls) => {
      const ref = tokens.radiusAssignRef[cls]
      return [`radius.${cls}`, { ref, ...px(tokens.radius[stepOf<RadiusStep>(ref)]) }]
    }),
    ...SHADOW_ASSIGNMENT_CLASSES.map((cls) => {
      const ref = tokens.shadowAssignRef[cls]
      const layers = tokens.shadowLayers[stepOf<ShadowStep>(ref)].map((value) => layer(value))
      return [`shadow.${cls}`, { ref, layers }]
    }),
    ...SHADOW_STEPS.map((step) => [
      `shadow.${step}`,
      { layers: tokens.shadowLayers[step].map((value) => layer(value)) },
    ]),
    [
      'shadow.insetTop',
      { layers: tokens.insetTopLayer === null ? [] : [layer(tokens.insetTopLayer)] },
    ],
    ['material.blur', px(tokens.material.blur)],
    ['material.saturate', readNumber(tokens.material.saturate)],
    ['focus.width', px(tokens.focus.width)],
    ['focus.offset', px(tokens.focus.offset)],
    // Choices, like a display step's style: the name a recipe branches on.
    ['focus.place', tokens.focus.place],
    ['focus.field', tokens.focus.field],
    ['hover.unfilled', tokens.hover.unfilled],
    ...ICON_SIZES.map((size) => [`icon.size.${size}`, px(tokens.icon.size[size])]),
    ...ICON_SIZES.map((size) => [`icon.stroke.${size}`, readNumber(tokens.icon.stroke[size])]),
    ...Z_STEPS.map((step) => [`z.${step}`, readNumber(tokens.z[step])]),
  ]) as InvariantTokens

  /* density ---------------------------------------------------------------- */

  const raised: RaisedToken[] = []
  const floored = (
    density: Density,
    token: RaisedToken['token'],
    css: string,
    minimum: number,
  ): TokenPx => {
    const value = readLength(css, 'px')
    if (value >= minimum) return { value, unit: 'px' }
    raised.push({ density, token, from: value, to: minimum })
    return { value: minimum, unit: 'px' }
  }

  const density = Object.fromEntries(
    DENSITIES.map((name) => {
      const scoped = tokens.density[name]
      const entries = [
        ...SPACE_STEPS.map((step) => [`space.${step}`, px(scoped.space[step])]),
        ...CONTROL_SIZES.map((size) => [
          `controlHeight.${size}`,
          floored(name, `controlHeight.${size}`, scoped.controlHeight[size], floor.controlHeight),
        ]),
        ['hitTarget', floored(name, 'hitTarget', tokens.hitTarget, floor.hitTarget)],
        ...INSET_ASSIGNMENT_CLASSES.map((cls) => {
          const ref = tokens.insetAssignRef[cls]
          return [`inset.${cls}`, { ref, ...px(scoped.space[stepOf<SpaceStep>(ref)]) }]
        }),
      ]
      return [name, Object.fromEntries(entries) as DensityTokens] as const
    }),
  ) as Record<Density, DensityTokens>

  /* motion ----------------------------------------------------------------- */

  const motion = Object.fromEntries(
    MOTION_TEMPERAMENTS.map((temperament) => {
      const set = tokens.motion[temperament]
      const entries = [
        ...DURATION_ROLES.map((role) => [`motion.duration.${role}`, ms(set.duration[role])]),
        ...EASING_ROLES.map((role) => [`motion.easing.${role}`, { ...set.easingCurve[role] }]),
        ...SPRING_ROLES.map((role) => {
          const { stiffness, damping, mass } = set.spring[role]
          const spring: TokenSpring = {
            stiffness,
            damping,
            mass,
            dampingRatio: damping / (2 * Math.sqrt(stiffness * mass)),
          }
          return [`motion.spring.${role}`, spring]
        }),
        ['motion.pressScale', readNumber(set.pressScale)],
        ...AMBIENT_ROLES.map((role) => [`motion.ambient.${role}`, ms(set.ambient[role])]),
        ['motion.stagger.step', ms(set.stagger.step)],
        ['motion.stagger.max', ms(set.stagger.max)],
      ]
      return [temperament, Object.fromEntries(entries) as MotionTokenSet] as const
    }),
  ) as Record<MotionTemperament, MotionTokenSet>

  /* mode ------------------------------------------------------------------- */

  const mode = Object.fromEntries(
    MODES.map((name) => {
      const colors = theme.color[name]
      const tokensFor: ModeTokens = {
        color: Object.fromEntries(
          COLOR_ROLES.map((role) => [role, readColor(colors[role])]),
        ) as ModeTokens['color'],
        gradient: Object.fromEntries(
          GRADIENT_ROLES.map((role) => {
            const value = theme.gradient[name][role]
            const gradient: TokenGradient = {
              solid: value.solid,
              angle: value.angle,
              from: readColor(value.from),
              to: readColor(value.to),
              stops: value.stops.map((stop) => ({ color: readColor(stop.color), at: stop.at })),
            }
            return [role, gradient]
          }),
        ) as ModeTokens['gradient'],
        chart: Object.fromEntries(
          CHART_ROLES.map((role) => [role, readColor(theme.chart[name][role])]),
        ) as ModeTokens['chart'],
        glow: Object.fromEntries(
          GLOW_STEPS.map((step) => [
            `glow.${step}`,
            { layers: tokens.glowLayers[step].map((value) => layer(value, colors)) },
          ]),
        ) as ModeTokens['glow'],
        shell: Object.fromEntries(
          (Object.keys(SHELL_PATHS) as (keyof typeof SHELL_PATHS)[]).map((key) => {
            const role = tokens.shellRef[key]
            return [SHELL_PATHS[key], { ref: role, ...readColor(colors[role]) }]
          }),
        ) as ModeTokens['shell'],
        texture: texture(tokens.textureSpec.page[name]),
        materialSurface: readColor(theme.materialSurface[name]),
      }
      return [name, tokensFor] as const
    }),
  ) as Record<Mode, ModeTokens>

  /* inverse ---------------------------------------------------------------- */

  // The same comparison as the CSS inverse blocks: the opposite mode's value
  // for every role whose emitted value differs between modes.
  const inverse = Object.fromEntries(
    MODES.map((name) => {
      const opposite: Mode = name === 'light' ? 'dark' : 'light'
      const borrowed: InverseTokens = {
        color: Object.fromEntries(
          COLOR_ROLES.filter((role) => theme.color[name][role] !== theme.color[opposite][role]).map(
            (role) => [role, readColor(theme.color[opposite][role])],
          ),
        ),
        chart: Object.fromEntries(
          CHART_ROLES.filter((role) => theme.chart[name][role] !== theme.chart[opposite][role]).map(
            (role) => [role, readColor(theme.chart[opposite][role])],
          ),
        ),
      }
      return [name, borrowed] as const
    }),
  ) as Record<Mode, InverseTokens>

  /* exceptions ------------------------------------------------------------- */

  const exceptions = theme.exceptions.map((exception): DocumentException => {
    const token = `${exception.family}.${exception.class}`
    if (exception.family === 'radius') {
      const ref = `radius.${exception.step}`
      return {
        member: exception.component,
        token,
        value: { ref, ...px(tokens.radius[exception.step]) },
      }
    }
    if (exception.family === 'shadow') {
      const ref = `shadow.${exception.step}`
      const layers = tokens.shadowLayers[exception.step].map((value) => layer(value))
      return { member: exception.component, token, value: { ref, layers } }
    }
    // An inset names a space step, so it resolves at every density.
    const step = exception.step as SpaceStep
    return {
      member: exception.component,
      token,
      value: {
        ref: `space.${step}`,
        density: Object.fromEntries(
          DENSITIES.map((name) => [name, px(tokens.density[name].space[step])]),
        ) as Record<Density, TokenPx>,
      },
    }
  })

  return {
    format: TOKEN_DOCUMENT_FORMAT,
    platform,
    pairing: {
      name: theme.name,
      system: theme.system,
      palette: theme.palette,
      kind: theme.kind,
      axes: Object.fromEntries(AXIS_NAMES.map((axis) => [axis, theme.axes[axis]])) as Axes,
      defaultMode: theme.defaultMode,
      chartCap: theme.chartCap,
    },
    fonts,
    floor: { controlHeight: floor.controlHeight, hitTarget: floor.hitTarget, raised },
    invariant,
    density,
    motion,
    mode,
    inverse,
    exceptions,
    unsupported: [...UNSUPPORTED[platform]],
  }
}

/** The document as JSON, two-space indented with a final newline. */
export function emitTokenDocumentJSON(
  theme: ResolvedTheme,
  options: TokenDocumentOptions = {},
): string {
  return `${JSON.stringify(emitTokenDocument(theme, options), null, 2)}\n`
}

/** `radius.md` → `md`, `space.6` → `6`: the step a reference path names. */
function stepOf<Step extends string | number>(path: string): Step {
  const step = path.slice(path.indexOf('.') + 1)
  return (/^\d+$/.test(step) ? Number(step) : step) as Step
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The document's schema, with every key named, so the exported JSON Schema
 * tells a platform emitter exactly which tokens exist. Built from the same
 * catalogues the document is, so the two list the same keys.
 */
function buildSchema() {
  const exact = (entries: readonly (readonly [string, z.ZodType])[]) =>
    z.strictObject(Object.fromEntries(entries))
  const optional = (entries: readonly (readonly [string, z.ZodType])[]) =>
    z.strictObject(Object.fromEntries(entries.map(([key, schema]) => [key, schema.optional()])))

  const channel = z.number().int().min(0).max(255)
  const colorShape = {
    hex: z.string().regex(/^#[0-9a-f]{6}$/),
    alpha: z.number().min(0).max(1),
    r: channel,
    g: channel,
    b: channel,
  }
  const color = z.strictObject(colorShape)
  const refColor = z.strictObject({ ...colorShape, ref: z.string() })
  const pxValue = z.strictObject({ value: z.number(), unit: z.literal('px') })
  const refPx = z.strictObject({ value: z.number(), unit: z.literal('px'), ref: z.string() })
  const remValue = z.strictObject({ value: z.number(), unit: z.literal('rem'), px: z.number() })
  const emValue = z.strictObject({ value: z.number(), unit: z.literal('em') })
  const shadowLayer = z.strictObject({
    x: z.number(),
    y: z.number(),
    blur: z.number().min(0),
    spread: z.number(),
    color: z.union([refColor, color]),
    inset: z.boolean(),
  })
  const shadow = z.strictObject({ layers: z.array(shadowLayer) })
  const refShadow = z.strictObject({ ref: z.string(), layers: z.array(shadowLayer) })
  const cubic = z.strictObject({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() })
  const spring = z.strictObject({
    stiffness: z.number().positive(),
    damping: z.number().positive(),
    mass: z.number().positive(),
    dampingRatio: z.number().positive(),
  })
  const gradient = z.strictObject({
    solid: z.boolean(),
    angle: z.number(),
    from: color,
    to: color,
    stops: z.array(z.strictObject({ color, at: z.number().min(0).max(1) })),
  })
  const textureSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({
      kind: z.literal('grain'),
      alpha: z.number(),
      tile: z.number(),
      baseFrequency: z.number(),
      octaves: z.number().int(),
    }),
    z.strictObject({
      kind: z.literal('grid'),
      alpha: z.number(),
      tile: z.number(),
      stroke: color,
      strokeWidth: z.number(),
    }),
  ])
  const fontStyle = z.enum(['normal', 'italic'])
  const font = z.strictObject({
    family: z.string().min(1),
    variable: z.boolean(),
    fallback: z.enum(FALLBACK_CLASSES),
    style: fontStyle,
    weights: z.array(z.number().int().min(1).max(1000)),
    opsz: z.array(z.number()).optional(),
  })

  const typeSchema = (prefix: string) =>
    [
      [`${prefix}.size`, remValue],
      [`${prefix}.lineHeight`, z.number().positive()],
      [`${prefix}.weight`, z.number().int().min(1).max(1000)],
      [
        `${prefix}.family`,
        z.strictObject({
          ref: z.enum(FONT_ROLES.map((role) => `font.${role}` as const)),
          family: z.string(),
        }),
      ],
      [`${prefix}.tracking`, emValue],
    ] as const

  const invariant = exact([
    ['font.numeric', z.strictObject({ features: z.array(z.enum(['tnum', 'zero'])) })],
    ['numeric.align', z.enum(NUMERIC_ALIGNS)],
    ...TEXT_STEPS.flatMap((step) => typeSchema(`text.${step}`)),
    ...DISPLAY_STEPS.flatMap((step) => [
      ...typeSchema(`display.${step}`),
      [`display.${step}.opsz`, z.number().positive()] as const,
      [`display.${step}.style`, fontStyle] as const,
    ]),
    ...RADIUS_STEPS.map((step) => [`radius.${step}`, pxValue] as const),
    ...RADIUS_ASSIGNMENT_CLASSES.map((cls) => [`radius.${cls}`, refPx] as const),
    ...SHADOW_ASSIGNMENT_CLASSES.map((cls) => [`shadow.${cls}`, refShadow] as const),
    ...SHADOW_STEPS.map((step) => [`shadow.${step}`, shadow] as const),
    ['shadow.insetTop', shadow],
    ['material.blur', pxValue],
    ['material.saturate', z.number()],
    ['focus.width', pxValue],
    ['focus.offset', pxValue],
    ['focus.place', z.enum(FOCUS_PLACES)],
    ['focus.field', z.enum(FIELD_FOCUS_STYLES)],
    ['hover.unfilled', z.enum(UNFILLED_HOVERS)],
    ...ICON_SIZES.map((size) => [`icon.size.${size}`, pxValue] as const),
    ...ICON_SIZES.map((size) => [`icon.stroke.${size}`, z.number().positive()] as const),
    ...Z_STEPS.map((step) => [`z.${step}`, z.number().int()] as const),
  ])

  const densitySchema = exact([
    ...SPACE_STEPS.map((step) => [`space.${step}`, pxValue] as const),
    ...CONTROL_SIZES.map((size) => [`controlHeight.${size}`, pxValue] as const),
    ['hitTarget', pxValue],
    ...INSET_ASSIGNMENT_CLASSES.map((cls) => [`inset.${cls}`, refPx] as const),
  ])

  const duration = z.number().min(0)
  const motionSchema = exact([
    ...DURATION_ROLES.map((role) => [`motion.duration.${role}`, duration] as const),
    ...EASING_ROLES.map((role) => [`motion.easing.${role}`, cubic] as const),
    ...SPRING_ROLES.map((role) => [`motion.spring.${role}`, spring] as const),
    ['motion.pressScale', z.number().positive().max(1)],
    ...AMBIENT_ROLES.map((role) => [`motion.ambient.${role}`, duration] as const),
    ['motion.stagger.step', duration],
    ['motion.stagger.max', duration],
  ])

  const modeSchema = z.strictObject({
    color: exact(COLOR_ROLES.map((role) => [role, color] as const)),
    gradient: exact(GRADIENT_ROLES.map((role) => [role, gradient] as const)),
    chart: exact(CHART_ROLES.map((role) => [role, color] as const)),
    glow: exact(GLOW_STEPS.map((step) => [`glow.${step}`, shadow] as const)),
    shell: exact(Object.values(SHELL_PATHS).map((path) => [path, refColor] as const)),
    texture: textureSchema,
    materialSurface: color,
  })

  const inverseSchema = z.strictObject({
    color: optional(COLOR_ROLES.map((role) => [role, color] as const)),
    chart: optional(CHART_ROLES.map((role) => [role, color] as const)),
  })

  const perDensityPx = exact(DENSITIES.map((name) => [name, pxValue] as const))

  return z.strictObject({
    format: z.literal(TOKEN_DOCUMENT_FORMAT),
    platform: z.enum(PLATFORMS),
    pairing: z.strictObject({
      name: z.string(),
      system: z.string(),
      palette: z.string(),
      kind: z.enum(THEME_KINDS),
      axes: axesSchema,
      defaultMode: z.enum(MODE_PREFERENCES),
      chartCap: z.number().int().min(0),
    }),
    fonts: exact(FONT_ROLES.map((role) => [role, font] as const)),
    floor: z.strictObject({
      controlHeight: z.number().positive(),
      hitTarget: z.number().positive(),
      raised: z.array(
        z.strictObject({
          density: z.enum(DENSITIES),
          token: z.enum([
            ...CONTROL_SIZES.map((size) => `controlHeight.${size}` as const),
            'hitTarget',
          ]),
          from: z.number(),
          to: z.number(),
        }),
      ),
    }),
    invariant,
    density: exact(DENSITIES.map((name) => [name, densitySchema] as const)),
    motion: exact(MOTION_TEMPERAMENTS.map((name) => [name, motionSchema] as const)),
    mode: exact(MODES.map((name) => [name, modeSchema] as const)),
    inverse: exact(MODES.map((name) => [name, inverseSchema] as const)),
    exceptions: z.array(
      z.strictObject({
        member: z.string(),
        token: z.string(),
        value: z.union([
          refPx,
          refShadow,
          z.strictObject({ ref: z.string(), density: perDensityPx }),
        ]),
      }),
    ),
    unsupported: z.array(z.string()),
  })
}

/**
 * The zod schema a token document satisfies. Built once, on import; the pure
 * annotation lets a consumer's bundler drop it when nothing reads it.
 */
export const TOKEN_DOCUMENT_SCHEMA = /* @__PURE__ */ buildSchema()

/**
 * The JSON Schema for the document, for a platform emitter's tooling. Shapes
 * used more than once (a colour, a length, a shadow layer) are written once
 * under `$defs` and referenced.
 */
export function tokenDocumentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TOKEN_DOCUMENT_SCHEMA, { reused: 'ref' }) as Record<string, unknown>
}
