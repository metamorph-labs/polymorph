import { converter } from 'culori'
import { describe, expect, it } from 'vitest'

import { admitTheme, auditResolvedTheme, paletteJsonSchema, systemJsonSchema } from './admit'
import { contrast } from './color/contrast'
import { emitDart } from './emit-dart'
import { emitKotlin } from './emit-kotlin'
import { emitSwift } from './emit-swift'
import { emitTokenDocument } from './emit-tokens'
import { MAX_NEUTRAL_TINT } from './seeds'
import { resolveTheme } from './resolve-theme'
import { exampleQuietTheme } from './examples'
import { composeTheme, parsePalette, parseSystem } from './systems'
import { MODES, type Mode, type ResolvedTheme } from './theme'

const toOklch = converter('oklch')

/** A colour the stylesheet writes, as OKLCH, for measuring. */
function oklch(value: string): { l: number; c: number; h: number } {
  const parsed = toOklch(value)
  if (!parsed) throw new Error(`cannot parse ${value}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0 }
}

/**
 * Admission: the law suite for guest pairings.
 *
 * The claim: **a design system this repository does not know gets everything a
 * shipped pairing gets, without this file using the catalogue.** Every
 * document is defined here with names no shipped file uses. If admission ever
 * needed a `design/` entry, a catalogue JSON import here would show it.
 */

/** A guest pairing that is not in any catalogue. */
const GUEST_SYSTEM = {
  name: 'meridian-desk',
  axes: {
    geometry: 'soft',
    depth: 'elevated',
    density: 'comfortable',
    contrastTemperament: 'soft',
    typePersonality: 'humanist',
    colorStrategy: 'tinted',
    motionTemperament: 'standard',
    ornament: 'minimal',
  },
  fonts: {
    body: { family: 'Public Sans Variable' },
    display: { family: 'Fraunces Variable' },
    mono: { family: 'IBM Plex Mono' },
  },
  defaultPalette: 'meridian-moss',
  defaultMode: 'light',
}

const GUEST_PALETTE = {
  name: 'meridian-moss',
  accentHue: 142,
  neutralTint: 0.012,
  chromaBudget: 'medium',
}

describe('admitting a guest pairing', () => {
  it('admits a pairing that is not in the catalogue, with every output', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: GUEST_PALETTE })
    expect(admission.lawful).toBe(true)
    if (!admission.lawful) return

    expect(admission.faults).toEqual([])
    expect(admission.theme.name).toBe('meridian-desk/meridian-moss')
    // Scoped to the guest's attributes, so it can sit beside catalogue CSS.
    expect(admission.css).toContain('[data-system="meridian-desk"][data-palette="meridian-moss"]')
    expect(admission.css).toContain('--pm-accent-bg')
    expect(admission.css).toContain('[data-mode="dark"]')
    // A guest pairing emits the whole property set, like a shipped one.
    expect(admission.resolved.chartCap).toBeGreaterThanOrEqual(2)
  })

  it('tells the guest what to install, static cuts included', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: GUEST_PALETTE })
    if (!admission.lawful) throw new Error('expected lawful')
    // The system states no heading slot, so the body family fills it.
    expect(admission.fonts).toEqual([
      {
        roles: ['body', 'heading'],
        family: 'Public Sans Variable',
        package: '@fontsource-variable/public-sans',
      },
      { roles: ['display'], family: 'Fraunces Variable', package: '@fontsource-variable/fraunces' },
      { roles: ['mono'], family: 'IBM Plex Mono', package: '@fontsource/ibm-plex-mono' },
    ])
  })

  it('tells the guest to install a heading family the system states', () => {
    const admission = admitTheme({
      system: {
        ...GUEST_SYSTEM,
        fonts: { ...GUEST_SYSTEM.fonts, heading: { family: 'Source Serif 4 Variable' } },
      },
      palette: GUEST_PALETTE,
    })
    if (!admission.lawful) throw new Error('expected lawful')
    expect(admission.fonts.map((font) => [font.family, font.roles])).toEqual([
      ['Public Sans Variable', ['body']],
      ['Fraunces Variable', ['display']],
      ['IBM Plex Mono', ['mono']],
      ['Source Serif 4 Variable', ['heading']],
    ])
    expect(admission.fonts[3]?.package).toBe('@fontsource-variable/source-serif-4')
    expect(admission.css).toContain('--pm-font-heading: "Source Serif 4 Variable", ')
    expect(admission.css).toContain('--pm-text-xl-family: var(--pm-font-heading);')
  })

  it('names the catalogue laws that deliberately do not run', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: GUEST_PALETTE })
    // Divergence and the hue band apply only to this repository's catalogue.
    // The exemption is stated so it is not mistaken for enforcement.
    expect(admission.exemptions.some((line) => line.includes('divergence'))).toBe(true)
    expect(admission.exemptions.some((line) => line.includes('hue band'))).toBe(true)
  })

  it('accepts $schema on both documents, so an editor can name the schema it uses', () => {
    const admission = admitTheme({
      system: { ...GUEST_SYSTEM, $schema: 'https://example.test/system.json' },
      palette: { ...GUEST_PALETTE, $schema: 'https://example.test/palette.json' },
    })
    expect(admission.lawful).toBe(true)
  })

  it('still refuses every other unknown key, because $schema is only for tooling', () => {
    const admission = admitTheme({
      system: { ...GUEST_SYSTEM, brandGradient: '#f00' },
      palette: GUEST_PALETTE,
    })
    expect(admission.lawful).toBe(false)
    expect(admission.faults[0]?.law).toBe('schema')
    expect(admission.faults[0]?.message).toContain('system')
  })
})

describe('refusal returns a report and never throws', () => {
  it('reports zod issues with the document and path in the message', () => {
    const admission = admitTheme({
      system: { ...GUEST_SYSTEM, axes: { ...GUEST_SYSTEM.axes, geometry: 'rounded' } },
      palette: { name: 'x', accentHue: 999 },
    })
    expect(admission.lawful).toBe(false)
    const messages = admission.faults.map((fault) => fault.message)
    expect(messages.some((message) => message.startsWith('system.axes.geometry:'))).toBe(true)
    expect(messages.some((message) => message.startsWith('palette.accentHue:'))).toBe(true)
    // A parsed document is still returned, so a report can show which passed.
    expect(admission.system).toBeUndefined()
    expect(admission.palette).toBeUndefined()
  })

  it('returns the parsed document when only the other one failed', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: { name: 'x' },
    })
    expect(admission.lawful).toBe(false)
    expect(admission.system?.name).toBe('meridian-desk')
    expect(admission.fonts?.length).toBe(3)
    expect(admission.fonts?.[0]?.roles).toEqual(['body', 'heading'])
  })

  it('checks the merged-ladder laws, so an override cannot break its scale’s order', () => {
    const admission = admitTheme({
      system: { ...GUEST_SYSTEM, overrides: { radius: { sm: 40 } } },
      palette: GUEST_PALETTE,
    })
    expect(admission.lawful).toBe(false)
    expect(admission.faults.some((fault) => fault.message.includes('monotone'))).toBe(true)
  })

  it('handles non-objects and invalid input without throwing', () => {
    for (const junk of [null, undefined, 42, 'a theme', [], { nonsense: true }]) {
      const admission = admitTheme({ system: junk, palette: junk })
      expect(admission.lawful).toBe(false)
      expect(admission.faults.length).toBeGreaterThan(0)
    }
  })
})

describe('the engine holds for arbitrary in-schema seeds', () => {
  /**
   * `resolve.test.ts`'s sweep through admission: seeds that pass the schema
   * cannot fail the laws, because the derivation adjusts towards the floors.
   * Hard cases: the tint ceiling, the achromatic budget, glass, the hue wrap at
   * 0/360.
   */
  const corners = [
    { hue: 0, tint: 0, budget: 'high', depth: 'glass', ornament: 'minimal' },
    { hue: 359.9, tint: MAX_NEUTRAL_TINT, budget: 'low', depth: 'flat', ornament: 'grid' },
    { hue: 60, tint: 0.02, budget: 'none', depth: 'borders', ornament: 'none' },
    { hue: 200, tint: 0.001, budget: 'ink', depth: 'elevated', ornament: 'grain' },
  ] as const

  for (const corner of corners) {
    it(`hue ${corner.hue}, tint ${corner.tint}, ${corner.budget} budget, ${corner.depth}`, () => {
      const admission = admitTheme({
        system: {
          ...GUEST_SYSTEM,
          name: 'corner-case',
          defaultPalette: 'corner-paint',
          axes: { ...GUEST_SYSTEM.axes, depth: corner.depth, ornament: corner.ornament },
        },
        palette: {
          name: 'corner-paint',
          accentHue: corner.hue,
          neutralTint: corner.tint,
          chromaBudget: corner.budget,
        },
      })
      expect(admission.faults).toEqual([])
      expect(admission.lawful).toBe(true)
    })
  }
})

describe('the shared audit', () => {
  it('reports no faults for a shipped example', () => {
    // The MCP verdict and the CLI call this too, and must agree with the law
    // suite on a shipped theme.
    expect(auditResolvedTheme(resolveTheme(exampleQuietTheme))).toEqual([])
  })
})

describe('the editor JSON Schemas', () => {
  it('publishes a JSON Schema for each document, with the axes as enums', () => {
    const system = systemJsonSchema()
    const properties = system['properties'] as Record<string, unknown>
    expect(Object.keys(properties)).toContain('axes')
    expect(JSON.stringify(properties['axes'])).toContain('"sharp"')
    expect(JSON.stringify(properties['axes'])).toContain('"glass"')

    const palette = paletteJsonSchema()
    const required = palette['required'] as string[]
    expect(required).toContain('accentHue')
    expect(required).toContain('chromaBudget')
    expect(required).not.toContain('$schema')
  })
})

describe('a pin is held to the floor its derived value would be', () => {
  const pinnedPalette = (pins: object) => ({ ...GUEST_PALETTE, pins })

  it('admits a pin that clears every floor, and emits it as stated', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: pinnedPalette({ light: { 'accent.bg': '#1A73E8' } }),
    })
    expect(admission.faults).toEqual([])
    expect(admission.css).toContain('--pm-accent-bg: #1a73e8;')
  })

  it('refuses a pinned label under Lc 60, with the measured value and the pin named', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: pinnedPalette({ light: { 'accent.bg': '#999999', 'accent.contrast': '#ffffff' } }),
    })
    expect(admission.lawful).toBe(false)
    const fault = admission.faults.find((entry) =>
      entry.message.includes('accent.contrast on accent.bg reached'),
    )
    expect(fault?.law).toBe('contrast')
    expect(fault?.message).toMatch(/reached Lc \d+\.\d, floor is 60\./)
    expect(fault?.message).toContain(
      'The palette pins accent.contrast and accent.bg in light mode.',
    )
  })

  it('names the pinned fill a derived label was chosen against', () => {
    // A near-white fill turns the derived label dark, which then fails on the derived hover fill.
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: pinnedPalette({ light: { 'accent.bg': '#f5f5f5' } }),
    })
    expect(admission.lawful).toBe(false)
    const fault = admission.faults.find((entry) =>
      entry.message.includes('accent.contrast on accent.bgHover'),
    )
    expect(fault?.message).toContain(
      'accent.contrast is chosen against accent.bg, which the palette pins in light mode.',
    )
  })

  it('refuses a pinned focus colour under 3:1, in the ratio its floor is stated in', () => {
    // The ring is a 2px line, so its colour is held to the WCAG ratio, and a pin is held like a
    // derived value. `#a1a1a1`, the reference's ring grey, measures 2.56:1 on white.
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: pinnedPalette({ light: { 'border.focusSolid': '#a1a1a1' } }),
    })
    expect(admission.lawful).toBe(false)
    const fault = admission.faults.find((entry) =>
      entry.message.includes('border.focusSolid on bg.surface'),
    )
    expect(fault?.message).toMatch(/reached 2\.\d{2}:1, floor is 3:1\./)
    expect(fault?.message).toContain('The palette pins border.focusSolid in light mode.')
  })
})

describe('a pinned gradient stop', () => {
  /**
   * A cream primary button on a palette with a partner hue: amethyst's seeds,
   * written out so this file reads no catalogue document. The fills and their
   * label are pinned as a brand states them, the same in both modes.
   */
  const CREAM = {
    'accent.bg': '#f3e7cf',
    'accent.bgHover': '#ecdcbd',
    'accent.bgActive': '#e4d0aa',
    'accent.contrast': '#3b2a12',
  }
  const creamPalette = (stop?: string) => {
    const mode = stop === undefined ? CREAM : { ...CREAM, 'accent.gradientTo': stop }
    return {
      name: 'meridian-cream',
      accentHue: 298,
      gradientHue: 265,
      neutralTint: 0.02,
      chromaBudget: 'medium',
      pins: { light: mode, dark: mode },
    }
  }

  /** The label's |Lc| on each stop of the accent gradient, as the stylesheet writes them. */
  const lcOnStops = (resolved: ResolvedTheme, mode: Mode) => {
    const label = oklch(resolved.color[mode]['accent.contrast'])
    const { from, to } = resolved.gradient[mode]['accent.gradient']
    return [from, to].map((stop) => contrast({ ...label, alpha: 1 }, oklch(stop)))
  }

  it('is refused without the pin, at the stop the partner hue derives', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette() })
    expect(admission.lawful).toBe(false)
    expect(admission.faults.map((fault) => fault.law)).toEqual(['gradient', 'gradient'])
    expect(admission.faults[0]?.message).toMatch(
      /accent\.contrast on accent\.gradient reached Lc \d+\.\d at its 'to' stop, floor is 60\./,
    )
  })

  it('admits a cream button whose gradient runs to a pinned tan, with two different stops', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette('#E2C79A') })
    expect(admission.faults).toEqual([])
    if (!admission.lawful) return
    for (const mode of MODES) {
      const gradient = admission.resolved.gradient[mode]['accent.gradient']
      expect(gradient.from, mode).toBe('#f3e7cf')
      expect(gradient.to, mode).toBe('#e2c79a')
      expect(gradient.solid, mode).toBe(false)
      expect(
        gradient.stops.map((stop) => stop.color),
        mode,
      ).toEqual(['#f3e7cf', '#e2c79a'])
      // The label is measured on both stops at the floor a derived stop has.
      for (const lc of lcOnStops(admission.resolved, mode)) expect(lc).toBeGreaterThanOrEqual(60)
    }
    // The stylesheet writes the stop as stated, in lower case, under the gradient's own name.
    expect(admission.css).toContain(
      '--pm-accent-gradient: linear-gradient(135deg, #f3e7cf, #e2c79a);',
    )
    expect(admission.css).toContain('--pm-accent-gradient-to: #e2c79a;')
  })

  it('leaves the page wash as the partner hue makes it', () => {
    const pinned = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette('#e2c79a') })
    const unpinned = admitTheme({
      system: GUEST_SYSTEM,
      palette: { ...creamPalette(), name: 'meridian-plain', pins: undefined },
    })
    if (!pinned.lawful || !unpinned.lawful) throw new Error('expected both to be lawful')
    for (const mode of MODES) {
      expect(pinned.resolved.gradient[mode]['bg.wash']).toEqual(
        unpinned.resolved.gradient[mode]['bg.wash'],
      )
    }
  })

  it('refuses a pinned stop the label fails on, naming the stop and the pin', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette('#a07a46') })
    expect(admission.lawful).toBe(false)
    const fault = admission.faults.find((entry) => entry.message.includes('(light)'))
    expect(fault?.law).toBe('gradient')
    expect(fault?.message).toMatch(
      /accent\.contrast on accent\.gradient reached Lc \d+\.\d at its 'to' stop, floor is 60\./,
    )
    expect(fault?.message).toContain(
      "The 'to' stop is accent.gradientTo, which the palette pins in light mode.",
    )
  })

  it('carries the pinned stop to the token document and the SwiftUI, Compose and Flutter sources', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette('#e2c79a') })
    if (!admission.lawful) throw new Error('expected lawful')
    const theme = admission.resolved
    const tan = { r: 226, g: 199, b: 154 }
    const doc = emitTokenDocument(theme, { platform: 'ios' })
    for (const mode of MODES) {
      expect(doc.mode[mode].gradient['accent.gradient'].to).toMatchObject(tan)
      expect(doc.mode[mode].gradient['accent.gradient'].stops[1]?.color).toMatchObject(tan)
    }
    // Each source between its accent gradient and its page wash.
    const section = (source: string, start: string, end: string) =>
      source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
    expect(section(emitSwift(theme), 'accentGradient:', 'bgWash:')).toContain(
      'PMRGBA(226, 199, 154)',
    )
    expect(section(emitKotlin(theme), 'accentGradient =', 'bgWash =')).toContain(
      'PMRgba(226, 199, 154, 1f)',
    )
    expect(section(emitDart(theme), 'accentGradient:', 'bgWash:')).toContain(
      'PMRgba(226, 199, 154, 1.0)',
    )
  })

  it('takes the stop as an opaque #rrggbb only', () => {
    for (const stop of ['rgb(226 199 154 / 0.5)', '#e2c79a80', 'tan']) {
      const admission = admitTheme({ system: GUEST_SYSTEM, palette: creamPalette(stop) })
      expect(admission.lawful, stop).toBe(false)
      expect(admission.faults[0]?.message, stop).toMatch(
        /^palette\.pins\.light\.accent\.gradientTo: a pinned fill or label is an opaque #rrggbb/,
      )
    }
  })

  it('is in the JSON Schema a guest author’s editor reads, beside the fill pins', () => {
    const properties = paletteJsonSchema()['properties'] as Record<string, unknown>
    const pins = properties['pins'] as { properties: Record<string, { properties: object }> }
    for (const mode of MODES) {
      const keys = Object.keys(pins.properties[mode]?.properties ?? {})
      expect(keys).toContain('accent.bg')
      expect(keys).toContain('accent.gradientTo')
    }
  })

  it('makes the accent gradient real without a partner hue, and leaves the page wash solid', () => {
    // The palette states both colours, so the gradient needs no partner hue. Under `none` too:
    // the pinned fill and stop replace the ink fill and the absent stop.
    for (const chromaBudget of ['medium', 'none']) {
      const palette = {
        ...GUEST_PALETTE,
        chromaBudget,
        pins: {
          light: { ...CREAM, 'accent.gradientTo': '#e2c79a' },
          dark: { ...CREAM, 'accent.gradientTo': '#e2c79a' },
        },
      }
      const admission = admitTheme({ system: GUEST_SYSTEM, palette })
      expect(admission.faults, chromaBudget).toEqual([])
      if (!admission.lawful) continue
      for (const mode of MODES) {
        const accent = admission.resolved.gradient[mode]['accent.gradient']
        const wash = admission.resolved.gradient[mode]['bg.wash']
        expect([accent.solid, accent.from, accent.to], chromaBudget).toEqual([
          false,
          '#f3e7cf',
          '#e2c79a',
        ])
        expect([wash.solid, wash.css], chromaBudget).toEqual([true, wash.from])
      }
    }
  })

  it('keeps the derived stop in a mode that pins none, when the palette has a partner hue', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: { ...creamPalette(), pins: { light: { ...CREAM, 'accent.gradientTo': '#e2c79a' } } },
    })
    if (!admission.resolved) throw new Error('expected a resolved theme')
    const derived = admitTheme({
      system: GUEST_SYSTEM,
      palette: { ...creamPalette(), name: 'meridian-plain', pins: undefined },
    })
    if (!derived.resolved) throw new Error('expected a resolved theme')
    expect(admission.resolved.gradient.light['accent.gradient'].to).toBe('#e2c79a')
    expect(admission.resolved.gradient.dark['accent.gradient'].to).toBe(
      derived.resolved.gradient.dark['accent.gradient'].to,
    )
    expect(admission.resolved.gradient.dark['accent.gradient'].solid).toBe(false)
  })

  it('refuses a stop pinned in one mode only when the palette has no partner hue', () => {
    // A gradient has one shape in both modes, and without a partner hue the other mode has no
    // stop to run to.
    const oneMode = { light: { 'accent.gradientTo': '#e2c79a' } }
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: { ...GUEST_PALETTE, pins: oneMode },
    })
    expect(admission.faults).toEqual([
      {
        law: 'schema',
        message:
          'palette.pins: accent.gradientTo is pinned in light mode only and the palette seeds no ' +
          'gradientHue, so dark mode would draw a solid where light mode draws a gradient — a ' +
          'gradient has one shape in both modes: pin accent.gradientTo in dark mode too, or seed ' +
          'gradientHue',
      },
    ])
    const ink = admitTheme({
      system: GUEST_SYSTEM,
      palette: { ...GUEST_PALETTE, chromaBudget: 'none', gradientHue: 200, pins: oneMode },
    })
    expect(ink.faults[0]?.message).toContain(
      'chromaBudget none derives no gradient stop, so dark mode would draw a solid',
    )
    expect(ink.faults[0]?.message).toMatch(/pin accent\.gradientTo in dark mode too$/)
  })

  it('throws on such seeds built in code, which the palette schema never sees', () => {
    const theme = composeTheme(parseSystem(GUEST_SYSTEM), parsePalette(GUEST_PALETTE))
    const seeds = { ...theme.seeds, pins: { dark: { 'accent.gradientTo': '#e2c79a' } } }
    expect(() => resolveTheme({ ...theme, seeds })).toThrow(
      'accent.gradientTo is pinned in dark mode only',
    )
  })
})

describe('a palette’s more-contrast partner', () => {
  const STRONG = { ...GUEST_PALETTE, name: 'meridian-moss-strong', chromaBudget: 'high' }
  const NAMING = { ...GUEST_PALETTE, moreContrast: 'meridian-moss-strong' }

  it('is admitted with the palette, and its colours ride in the block under the media query', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: NAMING, moreContrast: STRONG })
    expect(admission.faults).toEqual([])
    if (!admission.lawful) return
    const strong = admitTheme({ system: GUEST_SYSTEM, palette: STRONG })
    if (!strong.lawful) throw new Error('expected the partner to be lawful alone')
    const query = admission.css.indexOf(
      '@media (prefers-contrast: more), (forced-colors: active) {',
    )
    expect(query).toBeGreaterThan(0)
    // Under the query, the partner's value with this pairing's selector.
    const below = admission.css.slice(query)
    expect(below).toContain('[data-system="meridian-desk"][data-palette="meridian-moss"]')
    expect(below).toContain(`--pm-accent-bg: ${strong.resolved.color.light['accent.bg']};`)
    expect(below).not.toContain('data-palette="meridian-moss-strong"')
  })

  it('refuses a palette whose partner is not given, and writes no sheet without the query', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: NAMING })
    expect(admission.lawful).toBe(false)
    expect(admission.faults).toEqual([
      {
        law: 'schema',
        message:
          'moreContrast: "meridian-moss" names "meridian-moss-strong" as its more-contrast ' +
          'palette, and admission was not given that palette, so the block would have no ' +
          'more-contrast query',
      },
    ])
    expect(admission.css).toBeUndefined()
  })

  it('writes no query for a palette that names no partner', () => {
    const admission = admitTheme({ system: GUEST_SYSTEM, palette: GUEST_PALETTE })
    expect(admission.lawful).toBe(true)
    expect(admission.css).not.toContain('prefers-contrast')
  })

  it('refuses a partner the palette does not name', () => {
    const elsewhere = admitTheme({
      system: GUEST_SYSTEM,
      palette: NAMING,
      moreContrast: { ...STRONG, name: 'meridian-moss-loud' },
    })
    expect(elsewhere.lawful).toBe(false)
    expect(elsewhere.faults[0]?.message).toContain('names "meridian-moss-strong"')

    const unnamed = admitTheme({
      system: GUEST_SYSTEM,
      palette: GUEST_PALETTE,
      moreContrast: STRONG,
    })
    expect(unnamed.lawful).toBe(false)
    expect(unnamed.faults[0]?.message).toContain('names no more-contrast partner')
  })

  it('holds the partner to every colour law, under its own pairing name', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: NAMING,
      moreContrast: {
        ...STRONG,
        pins: { light: { 'accent.bg': '#999999', 'accent.contrast': '#ffffff' } },
      },
    })
    expect(admission.lawful).toBe(false)
    expect(
      admission.faults.some((fault) =>
        fault.message.startsWith('meridian-desk/meridian-moss-strong'),
      ),
    ).toBe(true)
  })
})
