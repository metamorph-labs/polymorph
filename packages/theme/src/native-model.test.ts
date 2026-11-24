import { describe, expect, it } from 'vitest'

import { emitTokenDocument, type TokenDocument } from './emit-tokens'
import { EXAMPLE_THEMES, exampleProbeTheme, exampleQuietTheme } from './examples'
import {
  fixedNumber,
  nativeClasses,
  nativeName,
  nativeNames,
  nativePairingNames,
  nativeTheme,
  printNative,
  type NativeSyntax,
  type NativeValue,
} from './native-model'
import { resolveTheme } from './resolve-theme'
import { CHART_ROLES, COLOR_ROLES } from './roles'
import { MODES } from './theme'

/** Every kind of value the tree carries, exceptions included: the engine's shared probe. */
const probe = resolveTheme(exampleProbeTheme)
const themes = [...EXAMPLE_THEMES.map(resolveTheme), probe]
const quiet = resolveTheme(exampleQuietTheme)

describe('nativeName: one rule for every property a token path becomes', () => {
  it.each([
    ['accent.bgHover', '', 'accentBgHover'],
    ['border.focusSolid', '', 'borderFocusSolid'],
    ['chart.1', 'chart', 'chart1'],
    ['chart.seq.1', 'chart', 'seq1'],
    ['chart.other', 'chart', 'other'],
    ['text.2xl', 'text', 'text2xl'],
    ['shell.topbar.bg', 'shell', 'topbarBg'],
    ['motion.duration.controlExit', 'motion.duration', 'controlExit'],
    ['motion.spring.default', 'motion.spring', 'base'],
    ['glow.focus', 'glow', 'focus'],
  ])('%s in %j is %s', (path, family, name) => {
    expect(nativeName(path, family)).toBe(name)
  })

  it('refuses a digit-leading name with no family to prefix', () => {
    expect(() => nativeName('2xl')).toThrow(/starts with a digit/)
  })

  it('renames through one table, and refuses a Kotlin or Dart keyword it has no name for', () => {
    expect(nativeName('motion.spring.default', 'motion.spring')).toBe('base')
    // Kotlin's hard keywords, then Dart's reserved words.
    for (const keyword of [
      'fun',
      'object',
      'when',
      'typeof',
      'val',
      'final',
      'new',
      'void',
      'with',
    ]) {
      expect(() => nativeName(`radius.${keyword}`, 'radius'), keyword).toThrow(
        `"${keyword}", a Kotlin or Dart keyword with no rename`,
      )
    }
    // A soft keyword or a built-in identifier is a lawful property name in both.
    expect(nativeName('radius.data', 'radius')).toBe('data')
    expect(nativeName('radius.get', 'radius')).toBe('get')
  })

  it('refuses a name that is not an identifier in both languages', () => {
    expect(() => nativeName('radius.a-b', 'radius')).toThrow(
      /"a-b", which is not a Kotlin or Dart name/,
    )
    expect(() => nativeName('radius.a$b', 'radius')).toThrow(/not a Kotlin or Dart name/)
  })

  it('refuses two paths that would share a property in one class', () => {
    expect(nativeNames(['chart.1', 'chart.seq.1'], 'chart')).toEqual(['chart1', 'seq1'])
    expect(() => nativeNames(['chart.1', 'chart.chart1'], 'chart')).toThrow(
      /"chart\.1" and "chart\.chart1" are both "chart1"/,
    )
    expect(() => nativeNames(['accent.bg', 'accentBg'])).toThrow(/both "accentBg"/)
  })

  it('gives every colour and chart role a distinct name', () => {
    expect(new Set(COLOR_ROLES.map((role) => nativeName(role))).size).toBe(COLOR_ROLES.length)
    expect(new Set(CHART_ROLES.map((role) => nativeName(role, 'chart'))).size).toBe(
      CHART_ROLES.length,
    )
  })
})

describe('nativePairingNames', () => {
  it('marks the boundary between system and palette with an underscore', () => {
    expect(nativePairingNames([{ system: 'acme-corp', palette: 'deep-sea' }])).toEqual([
      { member: 'acmeCorp_deepSea', type: 'AcmeCorp_DeepSea', snake: 'acme_corp_deep_sea' },
    ])
  })

  it('refuses two pairings that would share a name', () => {
    expect(() =>
      nativePairingNames([
        { system: 'a-1', palette: 'x' },
        { system: 'a1', palette: 'x' },
      ]),
    ).toThrow(/a-1\/x and a1\/x are both "a1_x"/)
    expect(() =>
      nativePairingNames([
        { system: 'a-b', palette: 'c' },
        { system: 'a', palette: 'b-c' },
      ]),
    ).toThrow(/"a_b_c"/)
  })
})

describe('fixedNumber', () => {
  it('prints at most four decimals, without float noise or negative zero', () => {
    expect(fixedNumber(0.1 + 0.2)).toBe('0.3')
    expect(fixedNumber(1 / 3)).toBe('0.3333')
    expect(fixedNumber(12.5)).toBe('12.5')
    expect(fixedNumber(9999)).toBe('9999')
    expect(fixedNumber(-0.00001)).toBe('0')
    expect(fixedNumber(-0.011)).toBe('-0.011')
  })

  it('refuses a value that is not finite', () => {
    expect(() => fixedNumber(Number.NaN)).toThrow(/not finite/)
  })

  it('prints an exact value as given, and refuses one it would have to round', () => {
    expect(fixedNumber(0.12, { exact: true })).toBe('0.12')
    expect(fixedNumber(0.0825, { exact: true })).toBe('0.0825')
    expect(() => fixedNumber(0.12345, { exact: true })).toThrow(/more than four decimals/)
  })
})

describe('nativeTheme', () => {
  it('refuses a platform that draws the page texture, since no class has a field for it', () => {
    expect(() => nativeTheme(emitTokenDocument(quiet, { platform: 'web' }))).toThrow(
      /web draws texture\.page, but PMTheme has no field for it/,
    )
  })

  it('builds every class with one field list, whatever the pairing', () => {
    const trees = themes.map((theme) => nativeTheme(emitTokenDocument(theme, { platform: 'dart' })))
    const classes = nativeClasses(trees)
    expect(classes.get('PMSprings')).toEqual(['base', 'snappy', 'gentle'])
    expect(classes.get('PMRgba')).toEqual(['r', 'g', 'b', 'a'])
    // The probe declares one exception of each kind.
    for (const type of ['PMRadiusException', 'PMShadowException', 'PMInsetException']) {
      expect(classes.has(type), type).toBe(true)
    }
    const clash: NativeValue = {
      kind: 'list',
      items: [
        { kind: 'object', type: 'PMFocus', fields: [['width', { kind: 'float', value: 1 }]] },
        { kind: 'object', type: 'PMFocus', fields: [['offset', { kind: 'float', value: 1 }]] },
      ],
    }
    expect(() => nativeClasses([clash])).toThrow(/PMFocus is built with two field lists/)
  })

  it('marks every alpha exact, so a printer refuses one it would have to round', () => {
    const doc = emitTokenDocument(quiet, { platform: 'dart' })
    const color = { ...doc.mode.light.color['bg.scrim'], alpha: 0.123456 }
    const broken: TokenDocument = {
      ...doc,
      mode: {
        ...doc.mode,
        light: { ...doc.mode.light, color: { ...doc.mode.light.color, 'bg.scrim': color } },
      },
    }
    const syntax: NativeSyntax = {
      indent: '  ',
      int: String,
      float: (value, exact) => fixedNumber(value, { exact }),
      string: (value) => `'${value}'`,
      bool: String,
      listOpen: '[',
      listClose: ']',
      argument: (name) => `${name}: `,
    }
    expect(() => printNative(nativeTheme(broken), syntax)).toThrow(
      /0\.123456 has more than four decimals/,
    )
  })

  it('refuses a whole number that is not whole', () => {
    const doc = emitTokenDocument(quiet, { platform: 'android' })
    const broken: TokenDocument = { ...doc, pairing: { ...doc.pairing, chartCap: 2.5 } }
    expect(() => nativeTheme(broken)).toThrow(/expected a whole number, got 2.5/)
  })

  it('carries every token in the token tree, and drops only what is listed here', () => {
    // Each leaf the tree does not read, and why. Anything else unread fails.
    const notCarried: [RegExp, string][] = [
      [/^(format|platform)$/, 'each package is built for one format and one platform'],
      [/\/hex$/, 'PMRgba derives it from the channels'],
      [/\/unit$/, 'every length is in the platform unit'],
      [/^invariant\/(text|display)\.\w+\.size\/value$/, 'a type size is read as its px (rem × 16)'],
      [/\/ref$/, 'references arrive resolved; only an exception keeps its ref'],
      [/^mode\/(light|dark)\/gradient\/[^/]+\/(from|to)\//, 'the first and last stop'],
      [/^mode\/(light|dark)\/texture\//, 'texture.page is unsupported on native platforms'],
      [/^inverse\//, 'the inverse tone is the colour and chart roles swapped (tested below)'],
      [
        /^invariant\/(focus\.field|hover\.unfilled)$/,
        'choices only the web recipes read: the Compose fields draw the ring and the Compose Button washes on hover, whatever they say',
      ],
      [
        /^invariant\/focus\.place$/,
        'a flag the web recipes branch on; pmFocusRing reads where the mark sits from focus.offset',
      ],
    ]
    for (const theme of themes) {
      const doc = emitTokenDocument(theme, { platform: 'android' })
      const read = new Set<string>()
      nativeTheme(recording(doc, '', read))
      const unread = leaves(doc).filter(
        (path) => !read.has(path) && !notCarried.some(([pattern]) => pattern.test(path)),
      )
      expect(unread, theme.name).toEqual([])
      // An exception keeps the path it names.
      if (doc.exceptions.length > 0) expect(read.has('exceptions/#/value/ref')).toBe(true)
    }
  })

  it("gives the inverse tone by swapping light and dark, which is the token tree's inverse", () => {
    for (const theme of themes) {
      const doc = emitTokenDocument(theme, { platform: 'android' })
      for (const mode of MODES) {
        const opposite = mode === 'light' ? 'dark' : 'light'
        for (const [section, roles] of [
          ['color', COLOR_ROLES],
          ['chart', CHART_ROLES],
        ] as const) {
          for (const role of roles) {
            const borrowed = (doc.inverse[mode][section] as Record<string, unknown>)[role]
            const own = (doc.mode[mode][section] as Record<string, unknown>)[role]
            const swapped = (doc.mode[opposite][section] as Record<string, unknown>)[role]
            // Borrowed or not, the inverse region shows the opposite mode's value.
            expect(borrowed ?? own, `${theme.name} ${mode} ${role}`).toEqual(swapped)
          }
        }
      }
    }
  })
})

describe('printNative', () => {
  const syntax: NativeSyntax = {
    indent: '  ',
    int: String,
    float: (value) => `${value}.f`,
    string: (value) => `'${value}'`,
    bool: String,
    listOpen: '[',
    listClose: ']',
    argument: (name) => `${name}: `,
  }
  const color: NativeValue = {
    kind: 'object',
    type: 'PMRgba',
    fields: [
      ['r', { kind: 'int', value: 1 }],
      ['g', { kind: 'int', value: 2 }],
      ['b', { kind: 'int', value: 3 }],
      ['a', { kind: 'float', value: 1 }],
    ],
  }

  it('writes a call on one line when it fits, with positional colours', () => {
    expect(printNative(color, syntax)).toBe('PMRgba(1, 2, 3, 1.f)')
    expect(printNative({ kind: 'list', items: [] }, syntax, 0, 200)).toBe('[]')
  })

  it('breaks a call that does not fit into one argument per line, with trailing commas', () => {
    const wide: NativeValue = {
      kind: 'object',
      type: 'PMWide',
      fields: [
        ['label', { kind: 'string', value: 'x'.repeat(80) }],
        ['colors', { kind: 'list', items: [color, color, color, color] }],
        ['flag', { kind: 'bool', value: true }],
      ],
    }
    expect(printNative(wide, syntax)).toBe(
      [
        'PMWide(',
        `  label: '${'x'.repeat(80)}',`,
        '  colors: [PMRgba(1, 2, 3, 1.f), PMRgba(1, 2, 3, 1.f), PMRgba(1, 2, 3, 1.f), PMRgba(1, 2, 3, 1.f)],',
        '  flag: true,',
        ')',
      ].join('\n'),
    )
    const long = 'x'.repeat(120)
    expect(printNative({ kind: 'string', value: long }, syntax)).toBe(`'${long}'`)
    const many: NativeValue = { kind: 'list', items: Array.from({ length: 6 }, () => color) }
    expect(printNative(many, syntax, 0, 'colors: '.length).split('\n')).toHaveLength(8)
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
