import { describe, expect, it } from 'vitest'

import { admitTheme, auditResolvedTheme, paletteJsonSchema, systemJsonSchema } from './admit'
import { MAX_NEUTRAL_TINT } from './seeds'
import { resolveTheme } from './resolve-theme'
import { exampleQuietTheme } from './examples'

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
    expect(admission.fonts).toEqual([
      {
        roles: ['body'],
        family: 'Public Sans Variable',
        package: '@fontsource-variable/public-sans',
      },
      { roles: ['display'], family: 'Fraunces Variable', package: '@fontsource-variable/fraunces' },
      { roles: ['mono'], family: 'IBM Plex Mono', package: '@fontsource/ibm-plex-mono' },
    ])
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

  it('refuses a pinned focus colour that does not stand out, in the ΔL its floor is stated in', () => {
    const admission = admitTheme({
      system: GUEST_SYSTEM,
      palette: pinnedPalette({ light: { 'border.focusSolid': '#fafafa' } }),
    })
    expect(admission.lawful).toBe(false)
    const fault = admission.faults.find((entry) =>
      entry.message.includes('border.focusSolid on bg.surface'),
    )
    expect(fault?.message).toMatch(/reached ΔL 0\.\d{3}, floor is 0\.08\./)
    expect(fault?.message).toContain('The palette pins border.focusSolid in light mode.')
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
