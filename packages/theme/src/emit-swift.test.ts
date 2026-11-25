import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DENSITIES, MOTION_TEMPERAMENTS } from './axes'
import { emitTokenDocument, type TokenColor, type TokenDocument } from './emit-tokens'
import {
  emitSwift,
  emitSwiftFiles,
  SWIFT_CATALOGUE_FILE,
  swiftDocumentExpression,
  swiftFileName,
  swiftMember,
  swiftMembers,
  swiftThemeExpression,
  swiftThemeName,
  type SwiftExpr,
} from './emit-swift'
import { EXAMPLE_THEMES, exampleProbeTheme, exampleQuietTheme } from './examples'
import { PLATFORM_FLOORS } from './platforms'
import { resolveTheme } from './resolve-theme'
import { CHART_ROLES, COLOR_ROLES, GRADIENT_ROLES } from './roles'
import { FALLBACK_CLASSES } from './seeds'
import { MODE_PREFERENCES, MODES, THEME_KINDS } from './theme'
import {
  DURATION_ROLES,
  GLOW_STEPS,
  NUMERIC_ALIGNS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
} from './tokens'

const quiet = resolveTheme(exampleQuietTheme)
const examples = EXAMPLE_THEMES.map(resolveTheme)

/** Every kind of value the emitter writes, exceptions included: the engine's shared probe. */
const probe = resolveTheme(exampleProbeTheme)
const themes = [...examples, probe]

const ROOT = resolve(process.cwd())
const TYPE_FILE = resolve(ROOT, 'platforms/ios/Sources/PolymorphTokens/PMTheme.swift')
const GENERATED = resolve(ROOT, 'platforms/ios/Sources/PolymorphTokens/Generated')

/* -------------------------------------------------------------------------- */
/* Reading the expression back                                                 */
/* -------------------------------------------------------------------------- */

type Call = Extract<SwiftExpr, { kind: 'call' }>

function asCall(expr: SwiftExpr | undefined, callee?: string): Call {
  if (expr?.kind !== 'call') throw new Error(`expected a call, got ${JSON.stringify(expr)}`)
  if (callee !== undefined && expr.callee !== callee) {
    throw new Error(`expected ${callee}(…), got ${expr.callee}(…)`)
  }
  return expr
}

const arg = (expr: SwiftExpr | undefined, label: string): SwiftExpr => {
  const found = asCall(expr).args.find((entry) => entry.label === label)
  if (!found) throw new Error(`no argument ${label}`)
  return found.value
}

const labels = (expr: SwiftExpr | undefined) => asCall(expr).args.map((entry) => entry.label)

const code = (expr: SwiftExpr | undefined) => {
  if (expr?.kind !== 'literal') throw new Error(`expected a literal, got ${JSON.stringify(expr)}`)
  return expr.code
}

const number = (expr: SwiftExpr | undefined) => Number(code(expr))

const items = (expr: SwiftExpr | undefined) => {
  if (expr?.kind !== 'array') throw new Error(`expected an array, got ${JSON.stringify(expr)}`)
  return expr.items
}

/** `PMRGBA(r, g, b[, alpha])` back to channels. */
function channels(expr: SwiftExpr | undefined): Omit<TokenColor, 'hex'> {
  const [r, g, b, alpha] = asCall(expr, 'PMRGBA').args.map((entry) => number(entry.value))
  return { r: r!, g: g!, b: b!, alpha: alpha ?? 1 }
}

/** A `PMDynamicColor` back to its two modes. */
function modes(expr: SwiftExpr | undefined) {
  const call = asCall(expr, 'PMDynamicColor')
  if (call.args.length === 1) {
    const both = channels(call.args[0]?.value)
    return { light: both, dark: both }
  }
  return { light: channels(arg(call, 'light')), dark: channels(arg(call, 'dark')) }
}

const exact = ({ r, g, b, alpha }: TokenColor) => ({ r, g, b, alpha })

/** Every labelled initialiser in an expression, by type: the labels it passes. */
function initialisers(expr: SwiftExpr, into = new Map<string, Set<string>>()) {
  if (expr.kind === 'array') for (const item of expr.items) initialisers(item, into)
  if (expr.kind !== 'call') return into
  if (expr.args.length > 0 && expr.args.every((entry) => entry.label !== null)) {
    const set = into.get(expr.callee) ?? new Set<string>()
    set.add(expr.args.map((entry) => entry.label).join(','))
    into.set(expr.callee, set)
  }
  for (const entry of expr.args) initialisers(entry.value, into)
  return into
}

/** `public struct Name` → its stored properties in order, from the type file. */
function declaredStructs(source: string): Map<string, string[]> {
  const structs = new Map<string, string[]>()
  for (const match of source.matchAll(/^public struct (\w+)[^{]*\{\n([\s\S]*?)^\}/gm)) {
    const body = match[2] ?? ''
    structs.set(
      match[1]!,
      [...body.matchAll(/^ {2}public let (\w+):/gm)].map((field) => field[1]!),
    )
  }
  return structs
}

function declaredEnum(source: string, name: string): string[] {
  const body = new RegExp(`^public enum ${name}\\b[^{]*\\{\\n([\\s\\S]*?)^\\}`, 'm').exec(source)
  const cases = /^ {2}case ([\w, ]+)$/m.exec(body?.[1] ?? '')
  return (cases?.[1] ?? '').split(',').map((entry) => entry.trim())
}

/* -------------------------------------------------------------------------- */
/* The laws                                                                    */
/* -------------------------------------------------------------------------- */

describe('emitSwift', () => {
  const source = emitSwift(quiet)

  it('is deterministic: the same theme gives the same bytes', () => {
    expect(emitSwift(resolveTheme(exampleQuietTheme))).toBe(source)
    expect(emitSwiftFiles(themes)).toEqual(
      emitSwiftFiles([...EXAMPLE_THEMES.map(resolveTheme), probe]),
    )
  })

  it('declares one static theme value, named after the pairing', () => {
    expect(source).toContain(
      'extension PMTheme {\n  public static let exampleQuiet_exampleViolet = PMTheme(',
    )
    expect(source.match(/public static let/g)).toHaveLength(1)
    expect(source.endsWith('\n  )\n}\n')).toBe(true)
  })

  it('names its generator and its pairing in a header, and says it is never hand-edited', () => {
    const [first, second, third] = source.split('\n')
    expect(first).toBe(
      '// Generated by `pnpm emit:native` from the pairing example-quiet/example-violet: the system',
    )
    expect(second).toContain('Never edit it by hand')
    expect(third).toContain('run `pnpm emit:native` again')
    expect(emitSwift(quiet, { generator: 'polymorph emit swift' })).toContain(
      '// Generated by `polymorph emit swift` from the pairing',
    )
  })

  it('writes every colour and chart role in both modes, with the channels the document gives', () => {
    for (const theme of themes) {
      const doc = emitTokenDocument(theme, { platform: 'ios' })
      const expr = swiftThemeExpression(theme)
      const colors = arg(expr, 'colors')
      expect(labels(colors)).toEqual(COLOR_ROLES.map((role) => swiftMember(role)))
      for (const role of COLOR_ROLES) {
        const value = modes(arg(colors, swiftMember(role)))
        for (const mode of MODES) {
          expect(value[mode], `${theme.name} ${mode} ${role}`).toEqual(
            exact(doc.mode[mode].color[role]),
          )
        }
      }
      const chart = arg(expr, 'chart')
      expect(labels(chart)).toEqual(CHART_ROLES.map((role) => swiftMember(role, 'chart')))
      for (const role of CHART_ROLES) {
        const value = modes(arg(chart, swiftMember(role, 'chart')))
        for (const mode of MODES) {
          expect(value[mode], `${theme.name} ${mode} ${role}`).toEqual(
            exact(doc.mode[mode].chart[role]),
          )
        }
      }
    }
  })

  it('writes one value once when both modes agree, and both when they differ', () => {
    const colors = arg(swiftThemeExpression(quiet), 'colors')
    const doc = emitTokenDocument(quiet, { platform: 'ios' })
    for (const role of COLOR_ROLES) {
      const same =
        JSON.stringify(exact(doc.mode.light.color[role])) ===
        JSON.stringify(exact(doc.mode.dark.color[role]))
      expect(labels(arg(colors, swiftMember(role))), role).toEqual(
        same ? [null] : ['light', 'dark'],
      )
    }
  })

  it('emits all three densities and all four temperaments, whatever the axes select', () => {
    const doc = emitTokenDocument(quiet, { platform: 'ios' })
    const expr = swiftThemeExpression(quiet)
    expect(labels(arg(expr, 'density'))).toEqual([...DENSITIES])
    expect(labels(arg(expr, 'motion'))).toEqual([...MOTION_TEMPERAMENTS])
    for (const name of DENSITIES) {
      const density = arg(arg(expr, 'density'), name)
      const space = arg(density, 'space')
      expect(labels(space)).toEqual(SPACE_STEPS.map((step) => `s${step}`))
      for (const step of SPACE_STEPS) {
        expect(number(arg(space, `s${step}`))).toBe(doc.density[name][`space.${step}`].value)
      }
      // The hit target is iOS's 44; a control's height is the density's, as on the web.
      expect(number(arg(density, 'hitTarget'))).toBe(PLATFORM_FLOORS.ios.hitTarget)
      for (const size of ['sm', 'md', 'lg'] as const) {
        const height = number(arg(arg(density, 'controlHeight'), size))
        expect(height).toBe(parseFloat(quiet.tokens.density[name].controlHeight[size]))
        expect(height).toBeGreaterThanOrEqual(PLATFORM_FLOORS.ios.controlHeight)
      }
    }
    for (const name of MOTION_TEMPERAMENTS) {
      const motion = arg(arg(expr, 'motion'), name)
      for (const role of DURATION_ROLES) {
        // Seconds, from the document's milliseconds.
        expect(number(arg(arg(motion, 'duration'), role))).toBe(
          doc.motion[name][`motion.duration.${role}`] / 1000,
        )
      }
      // `default` is a Swift keyword, so the default spring is `base`.
      expect(labels(arg(motion, 'spring'))).toEqual(['base', 'snappy', 'gentle'])
      for (const role of SPRING_ROLES) {
        const spring = arg(arg(motion, 'spring'), swiftMember(role))
        expect(number(arg(spring, 'stiffness'))).toBe(
          doc.motion[name][`motion.spring.${role}`].stiffness,
        )
      }
      const easing = arg(arg(motion, 'easing'), 'enter')
      expect(labels(easing)).toEqual(['x1', 'y1', 'x2', 'y2'])
    }
  })

  it('writes type in points: rem × 16, tracking as em × size', () => {
    const doc = emitTokenDocument(quiet, { platform: 'ios' })
    const text = arg(swiftThemeExpression(quiet), 'text')
    expect(labels(text)).toEqual(TEXT_STEPS.map((step) => swiftMember(`text.${step}`, 'text')))
    for (const step of TEXT_STEPS) {
      const style = arg(text, swiftMember(`text.${step}`, 'text'))
      const size = doc.invariant[`text.${step}.size`]
      expect(number(arg(style, 'size'))).toBe(size.value * 16)
      expect(number(arg(style, 'tracking'))).toBeCloseTo(
        doc.invariant[`text.${step}.tracking`].value * size.px,
        4,
      )
      expect(code(arg(style, 'opsz'))).toBe('nil')
    }
  })

  it('gives a glow and a gradient one shape, with a dynamic colour per layer and stop', () => {
    const doc = emitTokenDocument(probe, { platform: 'ios' })
    const expr = swiftThemeExpression(probe)
    for (const step of GLOW_STEPS) {
      const layers = items(arg(arg(arg(expr, 'glow'), step), 'layers'))
      expect(layers).toHaveLength(doc.mode.light.glow[`glow.${step}`].layers.length)
      layers.forEach((layer, index) => {
        const color = modes(arg(layer, 'color'))
        for (const mode of MODES) {
          expect(color[mode]).toEqual(
            exact(doc.mode[mode].glow[`glow.${step}`].layers[index]!.color),
          )
        }
      })
    }
    for (const role of GRADIENT_ROLES) {
      const gradient = arg(arg(expr, 'gradients'), swiftMember(role))
      expect(number(arg(gradient, 'angle'))).toBe(doc.mode.light.gradient[role].angle)
      items(arg(gradient, 'stops')).forEach((stop, index) => {
        const color = modes(arg(stop, 'color'))
        for (const mode of MODES) {
          expect(color[mode]).toEqual(exact(doc.mode[mode].gradient[role].stops[index]!.color))
        }
      })
    }
  })

  it('resolves each declared exception into its own case', () => {
    const exceptions = items(arg(swiftThemeExpression(probe), 'exceptions'))
    expect(exceptions.map((entry) => code(arg(entry, 'token')))).toEqual([
      '"radius.control"',
      '"shadow.resting"',
      '"inset.list"',
    ])
    expect(exceptions.map((entry) => asCall(arg(entry, 'value')).callee)).toEqual([
      '.radius',
      '.shadow',
      '.inset',
    ])
    expect(items(arg(swiftThemeExpression(quiet), 'exceptions'))).toEqual([])
  })

  it('lists the page texture as unsupported and does not emit it', () => {
    const expr = swiftThemeExpression(probe)
    expect(items(arg(expr, 'unsupported')).map(code)).toEqual(['"texture.page"'])
    const swift = emitSwift(probe)
    expect(swift.match(/texture/g)).toHaveLength(1)
    expect(swift).not.toMatch(/grain|baseFrequency|strokeWidth/)
  })

  it('refuses a document that does not list the texture, or is resolved for another platform', () => {
    const doc = emitTokenDocument(probe, { platform: 'ios' })
    expect(() => swiftDocumentExpression({ ...doc, unsupported: [] })).toThrow(
      /ios draws texture\.page, but PMTheme has no field for it/,
    )
    expect(() =>
      swiftDocumentExpression(emitTokenDocument(probe, { platform: 'android' })),
    ).toThrow(/tokens are resolved for android, not ios/)
  })

  it('writes an alpha exactly, and refuses one with more decimals than it can carry', () => {
    const doc = emitTokenDocument(quiet, { platform: 'ios' })
    const color = { ...doc.mode.light.color['bg.scrim'], alpha: 0.123456 }
    const broken: TokenDocument = {
      ...doc,
      mode: {
        ...doc.mode,
        light: { ...doc.mode.light, color: { ...doc.mode.light.color, 'bg.scrim': color } },
      },
    }
    expect(() => swiftDocumentExpression(broken)).toThrow(/0\.123456 has more than four decimals/)
  })

  it('reads every path of the document, and leaves only what is listed here', () => {
    // Each leaf the expression does not read, and why. Anything else unread fails.
    const notRead: [RegExp, string][] = [
      [/^format$/, 'the expression reads documents the engine emits, always this format'],
      [/\/hex$/, 'PMRGBA derives it from the channels'],
      [/\/unit$/, 'every length is in points'],
      [/^invariant\/(text|display)\.\w+\.size\/value$/, 'a type size is read as its px (rem × 16)'],
      [/\/ref$/, 'references arrive resolved; only an exception keeps its ref'],
      [/^mode\/(light|dark)\/gradient\/[^/]+\/(from|to)\//, 'the first and last stop'],
      [/^mode\/(light|dark)\/texture\//, 'texture.page is unsupported on iOS'],
      [
        /^inverse\//,
        "the web's inverse tone swaps the colour and chart roles: a renderer resolves them in the opposite scheme",
      ],
      [/^floor\//, 'the values already meet the floors; raised is the audit trail'],
      [
        /^invariant\/(focus\.field|hover\.unfilled)$/,
        'choices only the web recipes read: the SwiftUI fields draw the ring and the SwiftUI Button washes on hover, whatever they say',
      ],
      [
        /^invariant\/focus\.place$/,
        'a flag the web recipes branch on; PMFocusRing reads where the mark sits from focus.offset',
      ],
    ]
    for (const theme of themes) {
      const doc = emitTokenDocument(theme, { platform: 'ios' })
      const read = new Set<string>()
      swiftDocumentExpression(recording(doc, '', read))
      const unread = leaves(doc).filter(
        (path) => !read.has(path) && !notRead.some(([pattern]) => pattern.test(path)),
      )
      expect(unread, theme.name).toEqual([])
      // An exception keeps the path it names.
      if (doc.exceptions.length > 0) expect(read.has('exceptions/#/value/ref')).toBe(true)
    }
  })

  it('matches its snapshot for the quiet example', () => {
    expect(source).toMatchSnapshot()
  })
})

describe('emitSwiftFiles', () => {
  it('writes one file per pairing and a catalogue listing them in order', () => {
    const files = emitSwiftFiles(examples)
    expect(Object.keys(files)).toEqual([...examples.map(swiftFileName), SWIFT_CATALOGUE_FILE])
    const catalogue = files[SWIFT_CATALOGUE_FILE]!
    const listed = [...catalogue.matchAll(/^ {4}\.(\w+),?$/gm)].map((match) => match[1])
    expect(listed).toEqual(examples.map(swiftThemeName))
    expect(catalogue).toContain('public static func named(system: String, palette: String)')
  })

  it('refuses two pairings that would share a file', () => {
    expect(() => emitSwiftFiles([quiet, quiet])).toThrow(/both written to/)
  })

  it('names the default pairing it is given as PMTheme.default, or else the first', () => {
    const declared = (files: Record<string, string>) =>
      /^ {2}public static let `default`: PMTheme = \.(\w+)$/m.exec(
        files[SWIFT_CATALOGUE_FILE]!,
      )?.[1]
    expect(declared(emitSwiftFiles(examples))).toBe(swiftThemeName(examples[0]!))
    const second = examples[1]!
    expect(
      declared(
        emitSwiftFiles(examples, {
          defaultPairing: { system: second.system, palette: second.palette },
        }),
      ),
    ).toBe(swiftThemeName(second))
    expect(() =>
      emitSwiftFiles(examples, { defaultPairing: { system: 'nowhere', palette: 'none' } }),
    ).toThrow(/default pairing nowhere\/none is not among the pairings/)
    expect(emitSwiftFiles([])[SWIFT_CATALOGUE_FILE]).not.toContain('`default`')
  })
})

describe('the names', () => {
  it('camelCases a role path and keeps it whole', () => {
    expect(swiftMember('accent.bgHover')).toBe('accentBgHover')
    expect(swiftMember('border.focusSolid')).toBe('borderFocusSolid')
    expect(swiftMember('accent.gradient')).toBe('accentGradient')
  })

  it('takes a member relative to its group', () => {
    expect(swiftMember('shell.topbar.bg', 'shell')).toBe('topbarBg')
    expect(swiftMember('radius.control', 'radius')).toBe('control')
    expect(swiftMember('motion.duration.controlExit', 'motion.duration')).toBe('controlExit')
    expect(swiftMember('chart.seq.1', 'chart')).toBe('seq1')
  })

  it('prefixes a name that would start with a digit: the group, or `s` for space', () => {
    expect(swiftMember('chart.1', 'chart')).toBe('chart1')
    expect(swiftMember('text.2xl', 'text')).toBe('text2xl')
    expect(swiftMember('space.0', 'space')).toBe('s0')
    expect(swiftMember('space.10', 'space')).toBe('s10')
    expect(() => swiftMember('2xl')).toThrow(/starts with a digit/)
  })

  it('renames a Swift keyword, and refuses one it has no name for', () => {
    expect(swiftMember('motion.spring.default', 'motion.spring')).toBe('base')
    for (const keyword of ['class', 'await', 'Type', 'precedencegroup']) {
      expect(() => swiftMember(`radius.${keyword}`, 'radius')).toThrow(`keyword "${keyword}"`)
    }
    expect(() => swiftMember('radius.a-b', 'radius')).toThrow(/not a Swift identifier/)
  })

  it('refuses two paths that would share a member in one struct', () => {
    expect(swiftMembers(['chart.1', 'chart.seq.1'], 'chart')).toEqual(['chart1', 'seq1'])
    expect(() => swiftMembers(['chart.1', 'chart.chart1'], 'chart')).toThrow(
      /"chart\.1" and "chart\.chart1" are both "chart1"/,
    )
    expect(() => swiftMembers(['accent.bg', 'accentBg'])).toThrow(/both "accentBg"/)
  })

  it('names a pairing after its system and palette, camelCasing kebab names', () => {
    expect(swiftThemeName({ system: 'plain', palette: 'neutral' })).toBe('plain_neutral')
    expect(swiftThemeName({ system: 'acme-corp', palette: 'deep-sea' })).toBe('acmeCorp_deepSea')
    expect(swiftFileName({ system: 'acme-corp', palette: 'deep-sea' })).toBe(
      'AcmeCorp_DeepSea.swift',
    )
  })
})

describe('the type file', () => {
  const source = readFileSync(TYPE_FILE, 'utf8')
  const structs = declaredStructs(source)

  it('declares every initialiser the emitter writes, with the same labels in order', () => {
    const written = new Map<string, Set<string>>()
    for (const theme of themes) initialisers(swiftThemeExpression(theme), written)
    for (const [type, signatures] of written) {
      for (const signature of signatures) {
        expect(structs.get(type)?.join(','), `${type}(${signature})`).toBe(signature)
      }
    }
    // And every struct it declares is written somewhere, except the colour
    // primitives, whose initialisers are written positionally.
    const unwritten = [...structs.keys()].filter((type) => !written.has(type))
    expect(unwritten.sort()).toEqual(['PMRGBA'])
  })

  it('declares the enum cases the emitter writes', () => {
    expect(declaredEnum(source, 'PMThemeKind')).toEqual([...THEME_KINDS])
    expect(declaredEnum(source, 'PMModePreference')).toEqual([...MODE_PREFERENCES])
    expect(declaredEnum(source, 'PMDensityName')).toEqual([...DENSITIES])
    expect(declaredEnum(source, 'PMMotionTemperament')).toEqual([...MOTION_TEMPERAMENTS])
    expect(declaredEnum(source, 'PMFontFallback')).toEqual([...FALLBACK_CLASSES])
    expect(declaredEnum(source, 'PMNumericAlign')).toEqual([...NUMERIC_ALIGNS])
  })
})

describe('the generated files', () => {
  const files = readdirSync(GENERATED).filter((file) => file.endsWith('.swift'))

  it('exist, so the checks below read something', () => {
    expect(files).toContain(SWIFT_CATALOGUE_FILE)
    expect(files.length).toBeGreaterThan(1)
  })

  it("name the web's default pairing as PMTheme.default: design/defaults.json's system with its palette", () => {
    const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
    const { system } = readJson('design/defaults.json') as { system: string }
    const { defaultPalette } = readJson(`design/systems/${system}.json`) as {
      defaultPalette: string
    }
    const catalogue = readFileSync(resolve(GENERATED, SWIFT_CATALOGUE_FILE), 'utf8')
    expect(catalogue).toContain(
      `  public static let \`default\`: PMTheme = .${swiftThemeName({ system, palette: defaultPalette })}\n`,
    )
  })

  it('contain no CSS: no var(), no cubic-bezier(), no px, rem, em or ms literal', () => {
    const css = /var\(|cubic-bezier\(|\d(?:px|rem|em|ms)\b|\b(?:px|rem)\b/
    for (const file of files) {
      expect(readFileSync(resolve(GENERATED, file), 'utf8'), file).not.toMatch(css)
    }
    for (const swift of Object.values(emitSwiftFiles(themes))) expect(swift).not.toMatch(css)
  })
})

/* -------------------------------------------------------------------------- */

/** Every leaf path of a JSON value, with list indices written `#`. */
function leaves(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [path]
  const entries = Array.isArray(value)
    ? value.map((item) => ['#', item] as const)
    : Object.entries(value)
  const join = (key: string) => (path === '' ? key : `${path}/${key}`)
  return [...new Set(entries.flatMap(([key, inner]) => leaves(inner, join(key))))]
}

/** `value`, recording the path of every property read from it, indices as `#`. */
function recording<T extends object>(value: T, path: string, read: Set<string>): T {
  return new Proxy(value, {
    get(target, key, receiver) {
      const result: unknown = Reflect.get(target, key, receiver)
      if (typeof key !== 'string' || (Array.isArray(target) && !/^\d+$/.test(key))) return result
      const next = `${path === '' ? '' : `${path}/`}${/^\d+$/.test(key) && Array.isArray(target) ? '#' : key}`
      read.add(next)
      return result !== null && typeof result === 'object' ? recording(result, next, read) : result
    },
  })
}
