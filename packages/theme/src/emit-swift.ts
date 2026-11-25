import { AXIS_NAMES, DENSITIES, MOTION_TEMPERAMENTS } from './axes'
import {
  emitTokenDocument,
  type TokenColor,
  type TokenDocument,
  type TokenGradient,
  type TokenShadow,
  type TokenShadowLayer,
} from './emit-tokens'
import { fixedNumber, KEYWORD_RENAMES, OMITTED } from './native-model'
import { CHART_ROLES, COLOR_ROLES, GRADIENT_ROLES } from './roles'
import { FONT_ROLES } from './seeds'
import type { ResolvedTheme } from './theme'
import {
  AMBIENT_ROLES,
  DISPLAY_STEPS,
  DURATION_ROLES,
  EASING_ROLES,
  GLOW_STEPS,
  ICON_SIZES,
  INSET_ASSIGNMENT_CLASSES,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
  Z_STEPS,
} from './tokens'

/**
 * The Swift emitter: a resolved pairing as one Swift source file that declares
 * a `PMTheme` value, for the `PolymorphTokens` package in `platforms/ios`.
 *
 * It reads the token document for iOS (`emit-tokens.ts`), so every reference
 * is already resolved and the hit target already meets the 44-point floor;
 * control heights are the density's, as on the web, and a member extends its
 * hit area to `hitTarget`. The types the values are built from live in the
 * hand-written `platforms/ios/Sources/PolymorphTokens/PMTheme.swift`; this
 * module writes only values. `emit-swift.test.ts` checks that every
 * initialiser it writes has exactly the labels that file declares.
 *
 * - **Lengths are points.** The document's px is the CSS reference pixel,
 *   which is the iOS point. Type sizes are their rem × 16, tracking is its em
 *   × the step's size, durations are seconds.
 * - **Colours are dynamic.** Each role is one `PMDynamicColor` holding its
 *   light and dark sRGB channels, exactly as the document gives them. A glow
 *   and a gradient keep one geometry and take a dynamic colour per layer or
 *   stop, so they too draw correctly in either mode.
 * - **Names** follow `swiftMember`, and two tokens that would share a member
 *   name in one struct are refused.
 * - **Not emitted**, each for a reason a law in `emit-swift.test.ts` states:
 *   it reads which document paths the expression uses and fails on any other
 *   it leaves behind.
 *   - What `unsupported` lists (the page texture), which is copied into the
 *     value as data. The expression refuses a document that does not list
 *     it, so a platform that could draw it gets a field rather than a silent
 *     drop.
 *   - The `inverse` table. On the web, `[data-tone="inverse"]` swaps the
 *     colour and chart roles alone; gradients, glows, shell surfaces and the
 *     glass surface keep the outer scope's value. A SwiftUI subtree under the
 *     opposite colour scheme swaps every dynamic value, so a renderer that
 *     draws the web's inverse tone resolves the colour and chart roles in the
 *     opposite scheme and nothing else. `inverse` lists them.
 *   - `floor`: the values already meet it, and `raised` is the document's
 *     audit trail rather than a token.
 *
 * Determinism: the same theme gives byte-identical source. Numbers are written
 * by `fixedNumber` (`native-model.ts`, as in Kotlin and Dart), with at most
 * four decimals and no trailing zeros, and every key in its catalogue's order.
 * An alpha is written exactly, because the stylesheet ships it as written: one
 * with more decimals throws. The keyword renames and the paths `PMTheme` has
 * no field for are the native model's too, so the three platforms decide them
 * once.
 */

/** The command a generated file names as its generator, unless told otherwise. */
export const SWIFT_GENERATOR = 'pnpm emit:native'

export interface SwiftOptions {
  /** The command the header names as the file's generator. */
  generator?: string
  /**
   * The pairing `emitSwiftFiles` declares as `PMTheme.default`: the web's
   * default, `design/defaults.json`'s system with its default palette, which
   * `pnpm emit:native` passes. It must be one of the pairings given; without
   * it, the first of them is the default.
   */
  defaultPairing?: { system: string; palette: string }
}

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

/** The prefix a digit-leading name takes when it is not its group's name. */
const DIGIT_PREFIXES: Record<string, string> = { space: 's' }

/**
 * The keywords a member name is checked against. Annotated pure, so a bundle
 * that never emits Swift drops it.
 */
const SWIFT_KEYWORDS = /* @__PURE__ */ new Set([
  'Any',
  'Self',
  'Type',
  'as',
  'associatedtype',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'continue',
  'default',
  'defer',
  'deinit',
  'do',
  'else',
  'enum',
  'extension',
  'fallthrough',
  'false',
  'fileprivate',
  'for',
  'func',
  'guard',
  'if',
  'import',
  'in',
  'init',
  'inout',
  'internal',
  'is',
  'let',
  'nil',
  'open',
  'operator',
  'precedencegroup',
  'private',
  'protocol',
  'public',
  'repeat',
  'rethrows',
  'return',
  'self',
  'static',
  'struct',
  'subscript',
  'super',
  'switch',
  'throw',
  'throws',
  'true',
  'try',
  'typealias',
  'var',
  'where',
  'while',
])

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const startsWithDigit = (name: string) => /^\d/.test(name)

/**
 * The Swift member a token path becomes, inside the struct for `group`.
 *
 * - The path is taken relative to `group` and camelCased: `accent.bgHover`
 *   is `accentBgHover`, `shell.topbar.bg` in `shell` is `topbarBg`.
 * - A name that would start with a digit takes a prefix: the group's name, or
 *   `s` for the space ladder. `chart.1` in `chart` is `chart1`, `text.2xl` in
 *   `text` is `text2xl`, `space.0` in `space` is `s0`.
 * - A Swift keyword is renamed: the `default` spring is `base`. A keyword with
 *   no rename throws, so a new collision is decided here rather than escaped.
 */
export function swiftMember(path: string, group?: string): string {
  const relative =
    group !== undefined && path.startsWith(`${group}.`) ? path.slice(group.length + 1) : path
  const camel = relative
    .split('.')
    .map((segment, index) =>
      index === 0 || startsWithDigit(segment)
        ? segment
        : `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`,
    )
    .join('')
  let name = camel
  if (startsWithDigit(name)) {
    if (group === undefined) {
      throw new Error(`swiftMember: "${path}" starts with a digit and names no group to prefix`)
    }
    name = `${DIGIT_PREFIXES[group] ?? swiftMember(group)}${name}`
  }
  if (SWIFT_KEYWORDS.has(name)) {
    const renamed = KEYWORD_RENAMES[name]
    if (renamed === undefined) {
      throw new Error(`swiftMember: "${path}" is the Swift keyword "${name}", which has no rename`)
    }
    name = renamed
  }
  if (!IDENTIFIER.test(name)) {
    throw new Error(`swiftMember: "${path}" gives "${name}", which is not a Swift identifier`)
  }
  return name
}

/**
 * The members a list of token paths takes in one struct, by `swiftMember`,
 * refusing two paths that would share a name: Swift rejects a duplicate
 * label, and the second value would be lost.
 */
export function swiftMembers(paths: readonly string[], group?: string): string[] {
  const seen = new Map<string, string>()
  return paths.map((path) => {
    const name = swiftMember(path, group)
    const earlier = seen.get(name)
    if (earlier !== undefined) {
      throw new Error(`swiftMembers: "${earlier}" and "${path}" are both "${name}"`)
    }
    seen.set(name, path)
    return name
  })
}

/** `acme-corp` → `acmeCorp`. */
const camelSlug = (slug: string) =>
  slug.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase())

const pascalSlug = (slug: string) => {
  const camel = camelSlug(slug)
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
}

/** The static a pairing is declared as: `plain_neutral`, `acmeCorp_deepSea`. */
export function swiftThemeName(theme: Pick<ResolvedTheme, 'system' | 'palette'>): string {
  return `${camelSlug(theme.system)}_${camelSlug(theme.palette)}`
}

/** The file a pairing is written to: `Plain_Neutral.swift`. */
export function swiftFileName(theme: Pick<ResolvedTheme, 'system' | 'palette'>): string {
  return `${pascalSlug(theme.system)}_${pascalSlug(theme.palette)}.swift`
}

/** The generated file that lists every pairing. */
export const SWIFT_CATALOGUE_FILE = 'Catalogue.swift'

/* -------------------------------------------------------------------------- */
/* Expressions                                                                 */
/* -------------------------------------------------------------------------- */

/** A Swift expression: a literal, a call (an initialiser or enum case), or an array. */
export type SwiftExpr =
  | { kind: 'literal'; code: string }
  | { kind: 'call'; callee: string; args: SwiftArg[] }
  | { kind: 'array'; items: SwiftExpr[] }

export interface SwiftArg {
  label: string | null
  value: SwiftExpr
}

const literal = (code: string): SwiftExpr => ({ kind: 'literal', code })

/** A call with labelled arguments, in order: an initialiser the type file declares. */
const init = (callee: string, entries: readonly (readonly [string, SwiftExpr])[]): SwiftExpr => ({
  kind: 'call',
  callee,
  args: entries.map(([label, value]) => ({ label, value })),
})

/** A call with unlabelled arguments: `PMRGBA(…)`, `.radius(…)`. */
const positional = (callee: string, values: readonly SwiftExpr[]): SwiftExpr => ({
  kind: 'call',
  callee,
  args: values.map((value) => ({ label: null, value })),
})

const array = (items: readonly SwiftExpr[]): SwiftExpr => ({ kind: 'array', items: [...items] })

/**
 * The number the Swift emitter writes: the native model's `fixedNumber`, under
 * the name the iOS loader's fixtures read (`platforms/ios/Tests/fixtures`).
 */
export const swiftNumber = fixedNumber

const num = (value: number) => literal(fixedNumber(value))
const bool = (value: boolean) => literal(String(value))
const enumCase = (name: string) => literal(`.${name}`)

function swiftString(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\\' || char === '"') out += `\\${char}`
    else if (code < 0x20 || code === 0x7f) out += `\\u{${code.toString(16)}}`
    else out += char
  }
  return `"${out}"`
}

const str = (value: string) => literal(swiftString(value))

/** The column a line may reach before an expression breaks over several lines. */
const WIDTH = 100

function inline(expr: SwiftExpr): string {
  if (expr.kind === 'literal') return expr.code
  if (expr.kind === 'array') return `[${expr.items.map(inline).join(', ')}]`
  const args = expr.args.map((arg) =>
    arg.label === null ? inline(arg.value) : `${arg.label}: ${inline(arg.value)}`,
  )
  return `${expr.callee}(${args.join(', ')})`
}

/**
 * An expression at `indent`, on a line where `lead` characters precede it and
 * `trail` follow. It stays on one line when that line fits in `WIDTH`, and
 * otherwise puts each argument or item on its own line.
 */
function render(expr: SwiftExpr, indent: string, lead: number, trail: number): string {
  const one = inline(expr)
  if (expr.kind === 'literal' || indent.length + lead + one.length + trail <= WIDTH) return one
  const inner = `${indent}  `
  if (expr.kind === 'array') {
    const lines = expr.items.map((item, index) => {
      const comma = index < expr.items.length - 1 ? ',' : ''
      return `${inner}${render(item, inner, 0, comma.length)}${comma}`
    })
    return `[\n${lines.join('\n')}\n${indent}]`
  }
  const lines = expr.args.map((arg, index) => {
    const label = arg.label === null ? '' : `${arg.label}: `
    const comma = index < expr.args.length - 1 ? ',' : ''
    return `${inner}${label}${render(arg.value, inner, label.length, comma.length)}${comma}`
  })
  return `${expr.callee}(\n${lines.join('\n')}\n${indent})`
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

const sameColor = (a: TokenColor, b: TokenColor) =>
  a.r === b.r && a.g === b.g && a.b === b.b && a.alpha === b.alpha

const rgba = ({ r, g, b, alpha }: TokenColor) =>
  positional('PMRGBA', [
    literal(String(r)),
    literal(String(g)),
    literal(String(b)),
    ...(alpha === 1 ? [] : [literal(fixedNumber(alpha, { exact: true }))]),
  ])

/** One value in both modes is written once. */
const dynamic = (light: TokenColor, dark: TokenColor) =>
  sameColor(light, dark)
    ? positional('PMDynamicColor', [rgba(light)])
    : init('PMDynamicColor', [
        ['light', rgba(light)],
        ['dark', rgba(dark)],
      ])

const shadowLayer = (layer: TokenShadowLayer, color: SwiftExpr) =>
  init('PMShadowLayer', [
    ['x', num(layer.x)],
    ['y', num(layer.y)],
    ['blur', num(layer.blur)],
    ['spread', num(layer.spread)],
    ['color', color],
    ['inset', bool(layer.inset)],
  ])

/** A shadow no mode changes. */
const shadow = ({ layers }: TokenShadow) =>
  init('PMShadow', [
    ['layers', array(layers.map((layer) => shadowLayer(layer, dynamic(layer.color, layer.color))))],
  ])

const sameGeometry = (a: TokenShadowLayer, b: TokenShadowLayer) =>
  a.x === b.x && a.y === b.y && a.blur === b.blur && a.spread === b.spread && a.inset === b.inset

/** A shadow whose colours come from a role: one geometry, a dynamic colour per layer. */
function modalShadow(path: string, light: TokenShadow, dark: TokenShadow): SwiftExpr {
  const sameShape =
    light.layers.length === dark.layers.length &&
    light.layers.every((layer, index) => sameGeometry(layer, dark.layers[index]!))
  if (!sameShape) throw new Error(`emitSwift: ${path} has a different shape in each mode`)
  const layers = light.layers.map((layer, index) =>
    shadowLayer(layer, dynamic(layer.color, dark.layers[index]!.color)),
  )
  return init('PMShadow', [['layers', array(layers)]])
}

/** A gradient: one angle and stop positions, a dynamic colour per stop. */
function gradient(path: string, light: TokenGradient, dark: TokenGradient): SwiftExpr {
  const sameShape =
    light.solid === dark.solid &&
    light.angle === dark.angle &&
    light.stops.length === dark.stops.length &&
    light.stops.every((stop, index) => stop.at === dark.stops[index]?.at)
  if (!sameShape) throw new Error(`emitSwift: ${path} has a different shape in each mode`)
  return init('PMGradient', [
    ['solid', bool(light.solid)],
    ['angle', num(light.angle)],
    [
      'stops',
      array(
        light.stops.map((stop, index) =>
          init('PMGradientStop', [
            ['color', dynamic(stop.color, dark.stops[index]!.color)],
            ['at', num(stop.at)],
          ]),
        ),
      ),
    ],
  ])
}

/** A struct whose members are steps of one group. */
function steps<Step extends string | number>(
  callee: string,
  group: string,
  list: readonly Step[],
  value: (step: Step) => SwiftExpr,
): SwiftExpr {
  const names = swiftMembers(
    list.map((step) => `${group}.${step}`),
    group,
  )
  return init(
    callee,
    list.map((step, index) => [names[index] as string, value(step)] as const),
  )
}

/** A struct whose members are roles, named relative to `group` when it has one. */
function roles<Role extends string>(
  callee: string,
  group: string | undefined,
  list: readonly Role[],
  value: (role: Role) => SwiftExpr,
): SwiftExpr {
  const names = swiftMembers(list, group)
  return init(
    callee,
    list.map((role, index) => [names[index] as string, value(role)] as const),
  )
}

/** The Swift expression of one pairing's `PMTheme`, from its iOS token document. */
export function swiftThemeExpression(theme: ResolvedTheme): SwiftExpr {
  return swiftDocumentExpression(emitTokenDocument(theme, { platform: 'ios' }))
}

/**
 * The Swift expression of the `PMTheme` a token document describes. The
 * document must be resolved for iOS, whose floors and unsupported list the
 * package's values carry, and must list every path `PMTheme` has no field for
 * as unsupported.
 */
export function swiftDocumentExpression(doc: TokenDocument): SwiftExpr {
  if (doc.platform !== 'ios') {
    throw new Error(`emitSwift: these tokens are resolved for ${doc.platform}, not ios`)
  }
  for (const path of OMITTED) {
    if (!doc.unsupported.includes(path)) {
      throw new Error(`emitSwift: ios draws ${path}, but PMTheme has no field for it — add one`)
    }
  }
  const { invariant, mode } = doc
  const { light, dark } = mode

  const typeStyle = (prefix: `text.${string}` | `display.${string}`, display: boolean) => {
    const key = <Suffix extends string>(suffix: Suffix) =>
      `${prefix}.${suffix}` as keyof typeof invariant
    const size = (invariant[key('size')] as { px: number }).px
    const family = invariant[key('family')] as { ref: string; family: string }
    const role = family.ref.slice('font.'.length) as (typeof FONT_ROLES)[number]
    const tracking = (invariant[key('tracking')] as { value: number }).value * size
    return init('PMTextStyle', [
      ['size', num(size)],
      ['lineHeight', num(invariant[key('lineHeight')] as number)],
      ['wght', num(invariant[key('weight')] as number)],
      ['tracking', num(tracking)],
      ['family', str(family.family)],
      ['fallback', enumCase(doc.fonts[role].fallback)],
      ['italic', bool(display && invariant[key('style')] === 'italic')],
      ['opsz', display ? num(invariant[key('opsz')] as number) : literal('nil')],
    ])
  }

  const sizeSteps = (value: (size: (typeof ICON_SIZES)[number]) => number) =>
    init(
      'PMSizeSteps',
      ICON_SIZES.map((size) => [size, num(value(size))] as const),
    )

  const exceptions = doc.exceptions.map((exception) => {
    const { value } = exception
    let swiftValue: SwiftExpr
    if ('density' in value) {
      swiftValue = positional('.inset', [
        init(
          'PMDensityLengths',
          DENSITIES.map((name) => [name, num(value.density[name].value)] as const),
        ),
      ])
    } else if ('layers' in value) {
      swiftValue = positional('.shadow', [shadow(value)])
    } else {
      swiftValue = positional('.radius', [num(value.value)])
    }
    return init('PMException', [
      ['member', str(exception.member)],
      ['token', str(exception.token)],
      ['ref', str(value.ref)],
      ['value', swiftValue],
    ])
  })

  return init('PMTheme', [
    ['name', str(doc.pairing.name)],
    ['system', str(doc.pairing.system)],
    ['palette', str(doc.pairing.palette)],
    ['kind', enumCase(doc.pairing.kind)],
    [
      'axes',
      init(
        'PMAxes',
        AXIS_NAMES.map((axis) => {
          const value = doc.pairing.axes[axis]
          const typed = axis === 'density' || axis === 'motionTemperament'
          return [axis, typed ? enumCase(value) : str(value)] as const
        }),
      ),
    ],
    ['defaultMode', enumCase(doc.pairing.defaultMode)],
    ['chartCap', num(doc.pairing.chartCap)],
    [
      'fonts',
      init(
        'PMFonts',
        FONT_ROLES.map((role) => {
          const font = doc.fonts[role]
          return [
            role,
            init('PMFont', [
              ['family', str(font.family)],
              ['variable', bool(font.variable)],
              ['fallback', enumCase(font.fallback)],
              ['italic', bool(font.style === 'italic')],
              ['weights', array(font.weights.map(num))],
              ['opsz', array((font.opsz ?? []).map(num))],
            ]),
          ] as const
        }),
      ),
    ],
    [
      'numeric',
      init('PMNumeric', [
        ['tabular', bool(invariant['font.numeric'].features.includes('tnum'))],
        ['slashedZero', bool(invariant['font.numeric'].features.includes('zero'))],
        ['align', enumCase(invariant['numeric.align'])],
      ]),
    ],
    ['text', steps('PMTextStyles', 'text', TEXT_STEPS, (step) => typeStyle(`text.${step}`, false))],
    [
      'display',
      steps('PMDisplayStyles', 'display', DISPLAY_STEPS, (step) =>
        typeStyle(`display.${step}`, true),
      ),
    ],
    [
      'radius',
      steps('PMRadius', 'radius', [...RADIUS_STEPS, ...RADIUS_ASSIGNMENT_CLASSES], (step) =>
        num(invariant[`radius.${step}`].value),
      ),
    ],
    [
      'shadows',
      steps('PMShadows', 'shadow', [...SHADOW_STEPS, ...SHADOW_ASSIGNMENT_CLASSES], (step) =>
        shadow(invariant[`shadow.${step}`]),
      ),
    ],
    ['insetTop', shadow(invariant['shadow.insetTop'])],
    [
      'glow',
      steps('PMGlow', 'glow', GLOW_STEPS, (step) =>
        modalShadow(`glow.${step}`, light.glow[`glow.${step}`], dark.glow[`glow.${step}`]),
      ),
    ],
    [
      'material',
      init('PMMaterial', [
        ['blur', num(invariant['material.blur'].value)],
        ['saturate', num(invariant['material.saturate'])],
        ['surface', dynamic(light.materialSurface, dark.materialSurface)],
      ]),
    ],
    [
      'focus',
      init('PMFocus', [
        ['width', num(invariant['focus.width'].value)],
        ['offset', num(invariant['focus.offset'].value)],
      ]),
    ],
    [
      'icon',
      init('PMIconScale', [
        ['size', sizeSteps((size) => invariant[`icon.size.${size}`].value)],
        ['stroke', sizeSteps((size) => invariant[`icon.stroke.${size}`])],
      ]),
    ],
    ['z', steps('PMZ', 'z', Z_STEPS, (step) => num(invariant[`z.${step}`]))],
    [
      'colors',
      roles('PMColors', undefined, COLOR_ROLES, (role) =>
        dynamic(light.color[role], dark.color[role]),
      ),
    ],
    [
      'chart',
      roles('PMChart', 'chart', CHART_ROLES, (role) =>
        dynamic(light.chart[role], dark.chart[role]),
      ),
    ],
    [
      'gradients',
      roles('PMGradients', undefined, GRADIENT_ROLES, (role) =>
        gradient(role, light.gradient[role], dark.gradient[role]),
      ),
    ],
    [
      'shell',
      roles('PMShell', 'shell', Object.keys(light.shell) as (keyof typeof light.shell)[], (path) =>
        dynamic(light.shell[path], dark.shell[path]),
      ),
    ],
    [
      'density',
      init(
        'PMDensities',
        DENSITIES.map((name) => {
          const set = doc.density[name]
          return [
            name,
            init('PMDensity', [
              [
                'space',
                steps('PMSpace', 'space', SPACE_STEPS, (step) => num(set[`space.${step}`].value)),
              ],
              ['controlHeight', sizeSteps((size) => set[`controlHeight.${size}`].value)],
              ['hitTarget', num(set.hitTarget.value)],
              [
                'inset',
                steps('PMInsets', 'inset', INSET_ASSIGNMENT_CLASSES, (cls) =>
                  num(set[`inset.${cls}`].value),
                ),
              ],
            ]),
          ] as const
        }),
      ),
    ],
    [
      'motion',
      init(
        'PMMotions',
        MOTION_TEMPERAMENTS.map((name) => {
          const set = doc.motion[name]
          const seconds = (ms: number) => num(ms / 1000)
          return [
            name,
            init('PMMotion', [
              [
                'duration',
                steps('PMDurations', 'motion.duration', DURATION_ROLES, (role) =>
                  seconds(set[`motion.duration.${role}`]),
                ),
              ],
              [
                'easing',
                steps('PMEasings', 'motion.easing', EASING_ROLES, (role) => {
                  const { x1, y1, x2, y2 } = set[`motion.easing.${role}`]
                  return init('PMEasing', [
                    ['x1', num(x1)],
                    ['y1', num(y1)],
                    ['x2', num(x2)],
                    ['y2', num(y2)],
                  ])
                }),
              ],
              [
                'spring',
                steps('PMSprings', 'motion.spring', SPRING_ROLES, (role) => {
                  const spring = set[`motion.spring.${role}`]
                  return init('PMSpring', [
                    ['stiffness', num(spring.stiffness)],
                    ['damping', num(spring.damping)],
                    ['mass', num(spring.mass)],
                    ['dampingRatio', num(spring.dampingRatio)],
                  ])
                }),
              ],
              ['pressScale', num(set['motion.pressScale'])],
              [
                'ambient',
                steps('PMAmbient', 'motion.ambient', AMBIENT_ROLES, (role) =>
                  seconds(set[`motion.ambient.${role}`]),
                ),
              ],
              [
                'stagger',
                init('PMStagger', [
                  ['step', seconds(set['motion.stagger.step'])],
                  ['max', seconds(set['motion.stagger.max'])],
                ]),
              ],
            ]),
          ] as const
        }),
      ),
    ],
    ['exceptions', array(exceptions)],
    ['unsupported', array(doc.unsupported.map(str))],
  ])
}

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

const header = (lines: readonly string[]) => lines.map((line) => `// ${line}`.trimEnd()).join('\n')

/**
 * One pairing as a Swift source file: `extension PMTheme` declaring
 * `public static let <system>_<palette>`.
 */
export function emitSwift(theme: ResolvedTheme, options: SwiftOptions = {}): string {
  const generator = options.generator ?? SWIFT_GENERATOR
  const name = swiftThemeName(theme)
  const lead = `  public static let ${name} = `
  return `${header([
    `Generated by \`${generator}\` from the pairing ${theme.system}/${theme.palette}: the system`,
    `"${theme.system}" with the palette "${theme.palette}", resolved for iOS. Never edit it by hand;`,
    `change the system or palette and run \`${generator}\` again.`,
  ])}

extension PMTheme {
${lead}${render(swiftThemeExpression(theme), '  ', lead.length - 2, 0)}
}
`
}

/**
 * A set of pairings as the files of a `Generated/` directory: one per pairing,
 * and `Catalogue.swift`, which lists them in the order given and names the
 * default (`SwiftOptions.defaultPairing`) as `PMTheme.default`. With no
 * pairings there is no default to name.
 */
export function emitSwiftFiles(
  themes: readonly ResolvedTheme[],
  options: SwiftOptions = {},
): Record<string, string> {
  const generator = options.generator ?? SWIFT_GENERATOR
  const files: Record<string, string> = {}
  for (const theme of themes) {
    const file = swiftFileName(theme)
    if (file in files || file === SWIFT_CATALOGUE_FILE) {
      throw new Error(`emitSwiftFiles: two pairings are both written to ${file}`)
    }
    files[file] = emitSwift(theme, options)
  }
  const entries = themes.map((theme) => `    .${swiftThemeName(theme)}`).join(',\n')
  const wanted = options.defaultPairing
  const chosen =
    wanted === undefined
      ? themes[0]
      : themes.find((theme) => theme.system === wanted.system && theme.palette === wanted.palette)
  if (wanted !== undefined && chosen === undefined) {
    throw new Error(
      `emitSwiftFiles: the default pairing ${wanted.system}/${wanted.palette} is not among the pairings`,
    )
  }
  const defaultTheme =
    chosen === undefined
      ? ''
      : `
  /// The default pairing, ${chosen.system}/${chosen.palette}: the one a screen renders under until
  /// the app installs another.
  public static let \`default\`: PMTheme = .${swiftThemeName(chosen)}
`
  files[SWIFT_CATALOGUE_FILE] = `${header([
    `Generated by \`${generator}\`: the pairings this package carries. Never edit it by hand.`,
  ])}

extension PMTheme {
  /// Every pairing in \`Generated/\`, in system order.
  public static let catalogue: [PMTheme] = [${themes.length === 0 ? '' : `\n${entries}\n  `}]
${defaultTheme}
  /// The pairing of \`system\` with \`palette\`, when this package carries it.
  public static func named(system: String, palette: String) -> PMTheme? {
    catalogue.first { $0.system == system && $0.palette == palette }
  }
}
`
  return files
}
