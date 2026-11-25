import { DENSITIES, MOTION_TEMPERAMENTS } from './axes'
import type {
  DocumentException,
  TokenColor,
  TokenDocument,
  TokenGradient,
  TokenShadow,
} from './emit-tokens'
import { CHART_ROLES, COLOR_ROLES, GRADIENT_ROLES } from './roles'
import { FONT_ROLES } from './seeds'
import { MODES } from './theme'
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
 * The value tree the Kotlin and Dart emitters print: one `PMTheme` built from a
 * token document, as typed constructor calls.
 *
 * Both packages declare the same classes (`platforms/android/.../PMTheme.kt`,
 * `platforms/dart/lib/src/pm_theme.dart`), so one tree serves both and each
 * emitter only knows its language's literals. The classes have the tree's
 * names, except where Kotlin renames one (`KOTLIN_TYPE_NAMES` in
 * `emit-kotlin.ts`: the icon sizes are `PMIconScale` there). The tree is built from the
 * token document and nothing else, so a native package holds exactly the
 * decisions the web holds:
 *
 * - **Modes fold into dynamic values.** Every colour, chart colour, gradient,
 *   glow, shell surface and the glass surface is a `light`/`dark` pair, so an
 *   app resolves a role once per mode instead of choosing between two themes.
 * - **The inverse tone is a swap of the colour and chart roles.** On the web,
 *   `[data-tone="inverse"]` borrows the opposite mode's value for each colour
 *   and chart role that differs, which is the same as swapping the pair, so
 *   the classes give `inverse` on the dynamic colour and carry no separate
 *   section (`native-model.test.ts` holds the two equal). Gradients, glows,
 *   shell surfaces and the glass surface keep the outer scope's value there,
 *   so a renderer that draws the web's inverse tone swaps the colour and
 *   chart roles and nothing else; the document's `inverse` table lists them.
 *   The record of which values the floor raised is kept (`floor.raised`).
 * - **References arrive resolved.** A class token (`radius.control`) is its
 *   value; only a member exception keeps the path it names.
 * - **Units are the platform's.** A CSS px is a dp and a Flutter logical pixel,
 *   so lengths are plain numbers; type sizes are `rem × 16` (sp); tracking
 *   stays in em; durations are whole milliseconds.
 * - **What the platform cannot draw is listed, not emitted.** The page
 *   texture has no field; the tree refuses a token document that does not list
 *   it as unsupported, so the texture cannot become drawable on a platform
 *   and be dropped here without a decision. A law in the test reads which
 *   document paths the tree uses and fails on any other it leaves behind.
 */

export type NativeValue =
  | { kind: 'int'; value: number }
  /** `exact`: the value is printed as written or refused, never rounded (an alpha). */
  | { kind: 'float'; value: number; exact?: true }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'list'; items: NativeValue[] }
  | NativeObject

export interface NativeObject {
  kind: 'object'
  /** The class name, as Dart writes it; Kotlin renames some (`KOTLIN_TYPE_NAMES`). */
  type: string
  /** Constructor arguments, in declaration order. */
  fields: [name: string, value: NativeValue][]
}

/** Classes whose constructor arguments are positional in both languages. */
export const POSITIONAL_TYPES: ReadonlySet<string> = /* @__PURE__ */ new Set(['PMRgba'])

/**
 * The paths the native classes have no field for, in Kotlin, Dart and Swift.
 * Each must be listed as unsupported.
 */
export const OMITTED = ['texture.page'] as const

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The words a property may not be named in either language: Kotlin's hard
 * keywords and Dart's reserved words. Kotlin's soft and modifier keywords and
 * Dart's built-in identifiers are lawful property names, so they are not
 * here. Annotated pure, so a bundle that never emits Kotlin or Dart drops it.
 */
const KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  // Kotlin's hard keywords.
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
  // Dart's reserved words, beyond those.
  'assert',
  'case',
  'catch',
  'const',
  'default',
  'enum',
  'extends',
  'final',
  'finally',
  'new',
  'rethrow',
  'switch',
  'void',
  'with',
])

/**
 * The one table of renames: a token name that is a keyword in Kotlin, Dart or
 * Swift, and the name all three packages give it instead (`emit-swift.ts`
 * reads it too). `default` is reserved in Dart and Swift, so the spring role
 * is `base`. A keyword with no entry here throws, so a new collision is
 * decided here rather than escaped differently in each language.
 */
export const KEYWORD_RENAMES: Readonly<Record<string, string>> = { default: 'base' }

/** A name both languages accept as a property: letters, digits and `_`, not starting with a digit. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * The property a token path takes in its class: the path below its family,
 * camel-cased at each dot. A name that would start with a digit takes the
 * family's last segment in front, and a keyword takes its rename:
 *
 * - `accent.bgHover` → `accentBgHover` (colours have no family)
 * - `chart.1` → `chart1`, `chart.seq.1` → `seq1` (family `chart`)
 * - `text.2xl` → `text2xl` (family `text`)
 * - `shell.topbar.bg` → `topbarBg` (family `shell`)
 * - `motion.spring.default` → `base` (family `motion.spring`)
 *
 * A keyword `KEYWORD_RENAMES` has no entry for, and a name that is not an
 * identifier in both languages (`radius.a-b`), throw.
 */
export function nativeName(path: string, family = ''): string {
  const below =
    family !== '' && path.startsWith(`${family}.`) ? path.slice(family.length + 1) : path
  const camel = below
    .split('.')
    .map((segment, index) => (index === 0 ? segment : capital(segment)))
    .join('')
  let name = camel
  if (/^\d/.test(name)) {
    const prefix = family.split('.').at(-1)
    if (!prefix) throw new Error(`nativeName: "${path}" starts with a digit and has no family`)
    name = `${prefix}${name}`
  }
  if (KEYWORDS.has(name)) {
    const renamed = KEYWORD_RENAMES[name]
    if (renamed === undefined) {
      throw new Error(
        `nativeName: "${path}" is "${name}", a Kotlin or Dart keyword with no rename in KEYWORD_RENAMES`,
      )
    }
    name = renamed
  }
  if (!IDENTIFIER.test(name)) {
    throw new Error(`nativeName: "${path}" gives "${name}", which is not a Kotlin or Dart name`)
  }
  return name
}

/**
 * The properties a list of token paths takes in one class, by `nativeName`,
 * refusing two paths that would share a name: the second would overwrite the
 * first, or the class would not compile.
 */
export function nativeNames(paths: readonly string[], family = ''): string[] {
  const seen = new Map<string, string>()
  return paths.map((path) => {
    const name = nativeName(path, family)
    const earlier = seen.get(name)
    if (earlier !== undefined) {
      throw new Error(`nativeNames: "${earlier}" and "${path}" are both "${name}"`)
    }
    seen.set(name, path)
    return name
  })
}

/** `acme-corp` → `acmeCorp`. */
const camelSlug = (slug: string) =>
  slug
    .split('-')
    .map((part, index) => (index === 0 ? part : capital(part)))
    .join('')

/** The names one pairing takes in a native package. */
export interface NativePairingNames {
  /** `plain_neutral`, `acmeCorp_deepSea`: the property in `PMThemes`, as in the Swift package. */
  member: string
  /** `Plain_Neutral`: the Kotlin object and file. */
  type: string
  /** `plain_neutral`, `acme_corp_deep_sea`: the Dart library file and import prefix. */
  snake: string
}

/**
 * The names each pairing of a set takes. The underscore marks where the
 * system ends and the palette begins. Two pairings that would share a name
 * (`a-1` and `a1` camel-case alike) are refused rather than overwritten.
 */
export function nativePairingNames(
  pairings: readonly { system: string; palette: string }[],
): NativePairingNames[] {
  const names = pairings.map(({ system, palette }) => ({
    member: `${camelSlug(system)}_${camelSlug(palette)}`,
    type: `${capital(camelSlug(system))}_${capital(camelSlug(palette))}`,
    snake: `${system}_${palette}`.replace(/-/g, '_'),
  }))
  for (const key of ['member', 'type', 'snake'] as const) {
    const seen = new Map<string, number>()
    names.forEach((entry, index) => {
      const earlier = seen.get(entry[key])
      if (earlier !== undefined) {
        const [a, b] = [pairings[earlier], pairings[index]]
        throw new Error(
          `nativePairingNames: ${a?.system}/${a?.palette} and ${b?.system}/${b?.palette} are both "${entry[key]}"`,
        )
      }
      seen.set(entry[key], index)
    })
  }
  return names
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

const int = (value: number): NativeValue => {
  if (!Number.isInteger(value))
    throw new Error(`nativeTheme: expected a whole number, got ${value}`)
  return { kind: 'int', value }
}
const float = (value: number): NativeValue => ({ kind: 'float', value })
/** A float the stylesheet ships as written, an alpha: printed exactly or refused. */
const exactFloat = (value: number): NativeValue => ({ kind: 'float', value, exact: true })
const string = (value: string): NativeValue => ({ kind: 'string', value })
const bool = (value: boolean): NativeValue => ({ kind: 'bool', value })
const list = (items: NativeValue[]): NativeValue => ({ kind: 'list', items })

function object(type: string, fields: Record<string, NativeValue>): NativeObject {
  return { kind: 'object', type, fields: Object.entries(fields) }
}

/** An object whose fields are named by `nativeNames`, which refuses two paths that share a name. */
function named<Key extends string>(
  type: string,
  keys: readonly Key[],
  family: string,
  value: (key: Key) => NativeValue,
): NativeObject {
  const names = nativeNames(keys, family)
  return {
    kind: 'object',
    type,
    fields: keys.map((key, index) => [names[index] as string, value(key)]),
  }
}

const rgba = (color: TokenColor) =>
  object('PMRgba', {
    r: int(color.r),
    g: int(color.g),
    b: int(color.b),
    a: exactFloat(color.alpha),
  })

const shadow = (value: TokenShadow) =>
  object('PMShadow', {
    layers: list(
      value.layers.map((layer) =>
        object('PMShadowLayer', {
          x: float(layer.x),
          y: float(layer.y),
          blur: float(layer.blur),
          spread: float(layer.spread),
          color: rgba(layer.color),
          inset: bool(layer.inset),
        }),
      ),
    ),
  })

const gradient = (value: TokenGradient) =>
  object('PMGradient', {
    solid: bool(value.solid),
    angle: float(value.angle),
    stops: list(
      value.stops.map((stop) =>
        object('PMGradientStop', { color: rgba(stop.color), at: float(stop.at) }),
      ),
    ),
  })

/* -------------------------------------------------------------------------- */
/* The theme                                                                   */
/* -------------------------------------------------------------------------- */

/** The `PMTheme` constructor call for one token document. */
export function nativeTheme(doc: TokenDocument): NativeObject {
  for (const path of OMITTED) {
    if (!doc.unsupported.includes(path)) {
      throw new Error(
        `nativeTheme: ${doc.platform} draws ${path}, but PMTheme has no field for it — add one`,
      )
    }
  }

  const { invariant, mode } = doc
  const perMode = <Value>(
    type: string,
    read: (section: TokenDocument['mode']['light']) => Value,
    build: (value: Value) => NativeValue,
  ) => object(type, Object.fromEntries(MODES.map((name) => [name, build(read(mode[name]))])))

  const dynamicColor = (read: (section: TokenDocument['mode']['light']) => TokenColor) =>
    perMode('PMDynamicColor', read, rgba)

  const typeStyle = (prefix: `text.${string}` | `display.${string}`) => {
    const key = prefix as 'text.md'
    const fields: Record<string, NativeValue> = {
      size: float(invariant[`${key}.size`].px),
      lineHeight: float(invariant[`${key}.lineHeight`]),
      weight: int(invariant[`${key}.weight`]),
      tracking: float(invariant[`${key}.tracking`].value),
      family: string(invariant[`${key}.family`].family),
      slot: string(invariant[`${key}.family`].ref.slice('font.'.length)),
    }
    if (prefix.startsWith('display.')) {
      const display = prefix as 'display.md'
      fields['opsz'] = float(invariant[`${display}.opsz`])
      fields['style'] = string(invariant[`${display}.style`])
      return object('PMDisplayStyle', fields)
    }
    return object('PMTextStyle', fields)
  }

  const exception = (entry: DocumentException): NativeValue => {
    const head = {
      member: string(entry.member),
      token: string(entry.token),
      ref: string(entry.value.ref),
    }
    const { value } = entry
    if ('density' in value) {
      return object('PMInsetException', {
        ...head,
        inset: named('PMPerDensity', DENSITIES, '', (name) => float(value.density[name].value)),
      })
    }
    if ('layers' in value) return object('PMShadowException', { ...head, shadow: shadow(value) })
    return object('PMRadiusException', { ...head, radius: float(value.value) })
  }

  return object('PMTheme', {
    pairing: object('PMPairing', {
      name: string(doc.pairing.name),
      system: string(doc.pairing.system),
      palette: string(doc.pairing.palette),
      kind: string(doc.pairing.kind),
      axes: object(
        'PMAxes',
        Object.fromEntries(
          Object.entries(doc.pairing.axes).map(([axis, value]) => [axis, string(value)]),
        ),
      ),
      defaultMode: string(doc.pairing.defaultMode),
      chartCap: int(doc.pairing.chartCap),
    }),
    fonts: named('PMFonts', FONT_ROLES, '', (role) => {
      const font = doc.fonts[role]
      return object('PMFont', {
        family: string(font.family),
        variable: bool(font.variable),
        fallback: string(font.fallback),
        style: string(font.style),
        weights: list(font.weights.map(int)),
        opsz: list((font.opsz ?? []).map(float)),
      })
    }),
    numeric: list(invariant['font.numeric'].features.map(string)),
    numericAlign: string(invariant['numeric.align']),
    floor: object('PMFloor', {
      controlHeight: float(doc.floor.controlHeight),
      hitTarget: float(doc.floor.hitTarget),
      raised: list(
        doc.floor.raised.map((entry) =>
          object('PMRaised', {
            density: string(entry.density),
            token: string(entry.token),
            from: float(entry.from),
            to: float(entry.to),
          }),
        ),
      ),
    }),
    text: named('PMTextScale', TEXT_STEPS, 'text', (step) => typeStyle(`text.${step}`)),
    display: named('PMDisplayScale', DISPLAY_STEPS, 'display', (step) =>
      typeStyle(`display.${step}`),
    ),
    radius: named(
      'PMRadius',
      [...RADIUS_STEPS, ...RADIUS_ASSIGNMENT_CLASSES].map((step) => `radius.${step}` as const),
      'radius',
      (path) => float(invariant[path].value),
    ),
    shadows: named(
      'PMShadows',
      [
        ...SHADOW_ASSIGNMENT_CLASSES.map((cls) => `shadow.${cls}` as const),
        ...SHADOW_STEPS.map((step) => `shadow.${step}` as const),
        'shadow.insetTop' as const,
      ],
      'shadow',
      (path) => shadow(invariant[path]),
    ),
    material: object('PMMaterial', {
      blur: float(invariant['material.blur'].value),
      saturate: float(invariant['material.saturate']),
      surface: dynamicColor((section) => section.materialSurface),
    }),
    focus: object('PMFocus', {
      width: float(invariant['focus.width'].value),
      offset: float(invariant['focus.offset'].value),
    }),
    icon: named('PMIcons', ICON_SIZES, '', (size) =>
      object('PMIcon', {
        size: float(invariant[`icon.size.${size}`].value),
        stroke: float(invariant[`icon.stroke.${size}`]),
      }),
    ),
    z: named('PMZ', Z_STEPS, '', (step) => int(invariant[`z.${step}`])),
    density: named('PMDensities', DENSITIES, '', (name) => {
      const scoped = doc.density[name]
      return object('PMDensity', {
        space: list(SPACE_STEPS.map((step) => float(scoped[`space.${step}`].value))),
        controlHeight: named('PMControlHeights', ['sm', 'md', 'lg'] as const, '', (size) =>
          float(scoped[`controlHeight.${size}`].value),
        ),
        hitTarget: float(scoped.hitTarget.value),
        inset: named('PMInsets', INSET_ASSIGNMENT_CLASSES, '', (cls) =>
          float(scoped[`inset.${cls}`].value),
        ),
      })
    }),
    motion: named('PMMotions', MOTION_TEMPERAMENTS, '', (temperament) => {
      const set = doc.motion[temperament]
      return object('PMMotion', {
        duration: named(
          'PMDurations',
          DURATION_ROLES.map((role) => `motion.duration.${role}` as const),
          'motion.duration',
          (path) => int(set[path]),
        ),
        easing: named(
          'PMEasings',
          EASING_ROLES.map((role) => `motion.easing.${role}` as const),
          'motion.easing',
          (path) => {
            const { x1, y1, x2, y2 } = set[path]
            return object('PMEasing', {
              x1: float(x1),
              y1: float(y1),
              x2: float(x2),
              y2: float(y2),
            })
          },
        ),
        spring: named(
          'PMSprings',
          SPRING_ROLES.map((role) => `motion.spring.${role}` as const),
          'motion.spring',
          (path) => {
            const { stiffness, damping, mass, dampingRatio } = set[path]
            return object('PMSpring', {
              stiffness: float(stiffness),
              damping: float(damping),
              mass: float(mass),
              dampingRatio: float(dampingRatio),
            })
          },
        ),
        pressScale: float(set['motion.pressScale']),
        ambient: named(
          'PMAmbient',
          AMBIENT_ROLES.map((role) => `motion.ambient.${role}` as const),
          'motion.ambient',
          (path) => int(set[path]),
        ),
        stagger: object('PMStagger', {
          step: int(set['motion.stagger.step']),
          max: int(set['motion.stagger.max']),
        }),
      })
    }),
    colors: named('PMColors', COLOR_ROLES, '', (role) =>
      dynamicColor((section) => section.color[role]),
    ),
    chart: named('PMChartColors', CHART_ROLES, 'chart', (role) =>
      dynamicColor((section) => section.chart[role]),
    ),
    gradients: named('PMGradients', GRADIENT_ROLES, '', (role) =>
      perMode('PMDynamicGradient', (section) => section.gradient[role], gradient),
    ),
    glow: named(
      'PMGlows',
      GLOW_STEPS.map((step) => `glow.${step}` as const),
      'glow',
      (path) => perMode('PMDynamicShadow', (section) => section.glow[path], shadow),
    ),
    shell: named(
      'PMShell',
      ['shell.topbar.bg', 'shell.rail.bg', 'shell.topbar.border', 'shell.rail.border'] as const,
      'shell',
      (path) => dynamicColor((section) => section.shell[path]),
    ),
    exceptions: list(doc.exceptions.map(exception)),
    unsupported: list(doc.unsupported.map(string)),
  })
}

/**
 * Every class the tree constructs, with its fields in order: what the
 * hand-written type files must declare. Read from trees, so it lists exactly
 * what an emitter writes.
 */
export function nativeClasses(trees: readonly NativeValue[]): Map<string, string[]> {
  const classes = new Map<string, string[]>()
  const visit = (value: NativeValue) => {
    if (value.kind === 'list') value.items.forEach(visit)
    if (value.kind !== 'object') return
    const names = value.fields.map(([name]) => name)
    const known = classes.get(value.type)
    if (known && known.join() !== names.join()) {
      throw new Error(`nativeClasses: ${value.type} is built with two field lists`)
    }
    classes.set(value.type, names)
    value.fields.forEach(([, inner]) => visit(inner))
  }
  trees.forEach(visit)
  return classes
}

/* -------------------------------------------------------------------------- */
/* Printing                                                                    */
/* -------------------------------------------------------------------------- */

/** A language's literals; the layout is shared. */
export interface NativeSyntax {
  indent: string
  int: (value: number) => string
  /** `exact` is set for a value that must print as written: pass it to `fixedNumber`. */
  float: (value: number, exact?: boolean) => string
  string: (value: string) => string
  bool: (value: boolean) => string
  listOpen: string
  listClose: string
  /** `name = ` in Kotlin, `name: ` in Dart. */
  argument: (name: string) => string
}

/**
 * A string's characters inside a Kotlin or Dart literal delimited by `quote`:
 * that quote, `\` and `$` escaped (`$` starts a template in both languages),
 * and every control character written as `\uXXXX`, which both languages read
 * and neither allows raw in a one-line literal. Swift's printer escapes the
 * same characters in its own syntax.
 */
export function escapeNativeString(value: string, quote: '"' | "'"): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (char === quote || char === '\\' || char === '$') out += `\\${char}`
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, '0')}`
    else out += char
  }
  return out
}

/** The widest line the printer writes before breaking a call over lines. */
const WIDTH = 100

/**
 * A number with at most four decimals, no trailing zeros and no negative
 * zero, so the same value always prints the same way and float noise from
 * arithmetic upstream never reaches a source file.
 *
 * An `exact` value is one the stylesheet ships as written, an alpha: it throws
 * when it has more than four decimals, rather than printing another colour
 * than the web's.
 */
export function fixedNumber(value: number, options: { exact?: boolean } = {}): string {
  if (!Number.isFinite(value)) throw new Error(`fixedNumber: ${value} is not finite`)
  const rounded = Number(value.toFixed(4))
  if (options.exact && rounded !== value) {
    throw new Error(`fixedNumber: ${value} has more than four decimals, so it cannot print exactly`)
  }
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/**
 * The value as source: on one line when it fits in the width after `lead`
 * characters, otherwise one argument per line with a trailing comma.
 */
export function printNative(value: NativeValue, syntax: NativeSyntax, depth = 0, lead = 0): string {
  const flat = printFlat(value, syntax)
  const pad = syntax.indent.repeat(depth)
  if (pad.length + lead + flat.length + 1 <= WIDTH) return flat
  if (value.kind === 'list') {
    if (value.items.length === 0) return flat
    const inner = syntax.indent.repeat(depth + 1)
    const items = value.items.map((item) => `${inner}${printNative(item, syntax, depth + 1)},\n`)
    return `${syntax.listOpen}\n${items.join('')}${pad}${syntax.listClose}`
  }
  if (value.kind === 'object') {
    const inner = syntax.indent.repeat(depth + 1)
    const positional = POSITIONAL_TYPES.has(value.type)
    const args = value.fields.map(([name, field]) => {
      const label = positional ? '' : syntax.argument(name)
      return `${inner}${label}${printNative(field, syntax, depth + 1, label.length)},\n`
    })
    return `${value.type}(\n${args.join('')}${pad})`
  }
  return flat
}

function printFlat(value: NativeValue, syntax: NativeSyntax): string {
  switch (value.kind) {
    case 'int':
      return syntax.int(value.value)
    case 'float':
      return syntax.float(value.value, value.exact === true)
    case 'string':
      return syntax.string(value.value)
    case 'bool':
      return syntax.bool(value.value)
    case 'list':
      return `${syntax.listOpen}${value.items.map((item) => printFlat(item, syntax)).join(', ')}${syntax.listClose}`
    case 'object': {
      const positional = POSITIONAL_TYPES.has(value.type)
      const args = value.fields.map(
        ([name, field]) => `${positional ? '' : syntax.argument(name)}${printFlat(field, syntax)}`,
      )
      return `${value.type}(${args.join(', ')})`
    }
  }
}
