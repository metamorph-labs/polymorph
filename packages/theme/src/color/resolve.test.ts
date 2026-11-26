import { converter } from 'culori'
import { describe, expect, it } from 'vitest'

import { CONTRAST_TEMPERAMENTS, COLOR_STRATEGIES, DEPTHS, type Axes } from '../axes'
import { exampleInkTheme, exampleQuietTheme, exampleStarkTheme } from '../examples'
import { pairingId } from '../pairings'
import { COLOR_ROLES, type ColorRole } from '../roles'
import { CHROMA_BUDGETS, type Seeds } from '../seeds'
import { MODES, type Mode, type Theme } from '../theme'
import { composite, quantize } from './contrast'
import { generateRamp, toHex } from './ramp'
import {
  auditPairings,
  ContrastLawError,
  oklchOf,
  resolveColors,
  resolveModeColors,
} from './resolve'
import { SOLID_LADDER } from './role-map'

const toOklch = converter('oklch')

function lightness(css: string): number {
  const parsed = toOklch(css)
  if (!parsed) throw new Error(`unparseable: ${css}`)
  return parsed.l
}

/**
 * A role's lightness as drawn on a surface. Dark borders are white at 6-15%
 * alpha, so their emitted lightness is always 1; the hierarchy is in the alpha.
 */
function paintedOn(css: string, surface: string): number {
  const parsed = toOklch(css)
  if (!parsed) throw new Error(`unparseable: ${css}`)
  const under = toOklch(surface)
  if (!under) throw new Error(`unparseable: ${surface}`)
  return composite(
    { l: parsed.l, c: parsed.c, h: parsed.h ?? 0, alpha: parsed.alpha ?? 1 },
    { l: under.l, c: under.c, h: under.h ?? 0 },
  ).l
}

function axesWith(overrides: Partial<Axes>): Axes {
  return { ...exampleQuietTheme.axes, ...overrides }
}

function themeWith(axes: Axes, seeds: Seeds, name = 'probe'): Theme {
  // Both halves share a throwaway name: this tests derivation, not catalogue.
  return { name, system: name, palette: name, axes, seeds, defaultMode: 'light', kind: 'designed' }
}

describe('resolveColors', () => {
  it('produces a value for every role in the catalogue, in both modes', () => {
    const resolved = resolveColors(exampleQuietTheme)
    for (const mode of MODES) {
      for (const role of COLOR_ROLES) {
        expect(resolved[mode][role], `${mode} ${role}`).toMatch(/^(#[0-9a-f]{6}|rgb\()/)
      }
      expect(Object.keys(resolved[mode]).sort()).toEqual([...COLOR_ROLES].sort())
    }
  })

  it('emits alpha only where translucency is intended', () => {
    // The scrim covers the page, and glows must let the surface show through.
    // The focus ring is a half-alpha halo, and dark borders are white with
    // alpha. Nothing else is translucent, because a sometimes-transparent role
    // could not be measured. The law measures the composite, so these are.
    const resolved = resolveColors(exampleQuietTheme)
    const translucent = (mode: 'light' | 'dark') =>
      (Object.entries(resolved[mode]) as [ColorRole, string][])
        .filter(([, value]) => value.startsWith('rgb('))
        .map(([role]) => role)
        .sort()

    expect(translucent('light')).toEqual([
      'accent.glow',
      'accent.underline',
      'bg.scrim',
      'border.focus',
      'danger.glow',
      'info.glow',
      'success.glow',
      'warning.glow',
    ])
    expect(translucent('dark')).toEqual([
      'accent.glow',
      'accent.underline',
      'bg.scrim',
      'border.default',
      'border.field',
      'border.focus',
      'border.strong',
      'border.subtle',
      'danger.glow',
      'info.glow',
      'success.glow',
      'warning.glow',
    ])
  })

  it('derives dark rather than inverting light', () => {
    const { light, dark } = resolveColors(exampleQuietTheme)
    // An inversion would mirror light's app background. A derivation lands in
    // the dark ladder's compressed range.
    expect(lightness(dark['bg.app'])).toBeLessThan(0.2)
    expect(lightness(light['bg.app'])).toBeGreaterThan(0.9)
    expect(lightness(dark['bg.app'])).not.toBeCloseTo(1 - lightness(light['bg.app']), 2)
  })

  it('keeps solid brand fills identical across modes', () => {
    const { light, dark } = resolveColors(exampleQuietTheme)
    for (const role of [
      'accent.bg',
      'accent.bgHover',
      'accent.bgActive',
      'border.focus',
      'danger.solid',
      'warning.solid',
      'success.solid',
      'info.solid',
    ] as const) {
      expect(dark[role], role).toBe(light[role])
    }
    expect(SOLID_LADDER).toBe('light')
  })

  it('inverts the accent fill under the ink budget, and only the accent fill', () => {
    // The one exception to the pin: `chromaBudget: 'none'` has no hue, and its
    // ink fill is a foreground colour, so it inverts. Asserted next to the rule
    // so readers see it.
    const { light, dark } = resolveColors(exampleInkTheme)
    for (const role of ['accent.bg', 'accent.bgHover', 'accent.bgActive'] as const) {
      expect(dark[role], role).not.toBe(light[role])
      expect(lightness(dark[role]), role).toBeGreaterThan(lightness(light[role]))
    }
    // Status colours still have hues, so they stay pinned.
    for (const role of ['danger.solid', 'warning.solid', 'success.solid', 'info.solid'] as const) {
      expect(dark[role], role).toBe(light[role])
    }
  })

  it('raises surfaces above the page in dark and keeps them distinct', () => {
    const { dark } = resolveColors(exampleQuietTheme)
    const ladder = ['bg.app', 'bg.subtle', 'bg.surface', 'bg.raised', 'bg.overlay'] as const
    for (let i = 1; i < ladder.length; i += 1) {
      const previous = lightness(dark[ladder[i - 1] ?? 'bg.app'])
      const current = lightness(dark[ladder[i] ?? 'bg.app'])
      expect(current, `${ladder[i]} vs ${ladder[i - 1]}`).toBeGreaterThan(previous)
    }
  })

  it('never puts the page above the card in light mode, and drops the wash below both', () => {
    // The light page matches the card, because depth separates panels, not a
    // grey page. Equal is the default, below comes from a stark `bgSpread`, and
    // above would be an inversion.
    const { light } = resolveColors(exampleQuietTheme)
    expect(lightness(light['bg.app'])).toBeLessThanOrEqual(lightness(light['bg.surface']))
    expect(lightness(light['bg.app'])).toBeGreaterThan(lightness(light['bg.subtle']))

    const stark = resolveColors(exampleStarkTheme).light
    expect(lightness(stark['bg.app'])).toBeLessThan(lightness(stark['bg.surface']))
  })

  it('keeps the border hierarchy ordered after nudging', () => {
    for (const theme of [exampleQuietTheme, exampleStarkTheme]) {
      const resolved = resolveColors(theme)
      for (const mode of MODES) {
        const colors = resolved[mode]
        const weight = (role: ColorRole) =>
          Math.abs(paintedOn(colors[role], colors['bg.surface']) - lightness(colors['bg.surface']))
        expect(weight('border.subtle'), `${theme.name}/${mode} subtle<default`).toBeLessThan(
          weight('border.default'),
        )
        expect(weight('border.default'), `${theme.name}/${mode} default<strong`).toBeLessThan(
          weight('border.strong'),
        )
      }
    }
  })

  it('orders the text hierarchy primary > secondary > muted > disabled', () => {
    for (const theme of [exampleQuietTheme, exampleStarkTheme]) {
      for (const mode of MODES) {
        const audit = resolveModeColors(theme, mode)
        const weight = (role: ColorRole) =>
          Math.abs(lightness(audit[role]) - lightness(audit['bg.surface']))
        expect(weight('text.primary')).toBeGreaterThan(weight('text.secondary'))
        expect(weight('text.secondary')).toBeGreaterThan(weight('text.muted'))
        expect(weight('text.muted')).toBeGreaterThan(weight('text.disabled'))
      }
    }
  })

  it('tints surfaces only under the tinted strategy, and only faintly', () => {
    const seeds = exampleQuietTheme.seeds
    const quiet = resolveModeColors(themeWith(axesWith({ colorStrategy: 'quiet' }), seeds), 'light')
    const tinted = resolveModeColors(
      themeWith(axesWith({ colorStrategy: 'tinted' }), seeds),
      'light',
    )
    const chroma = (css: string) => toOklch(css)?.c ?? 0
    expect(chroma(tinted['bg.subtle'])).toBeGreaterThan(chroma(quiet['bg.subtle']))
    expect(chroma(tinted['bg.surface'])).toBeGreaterThan(chroma(quiet['bg.surface']))
    // A tinted surface must still look neutral, not like pale brand colour.
    for (const role of ['bg.app', 'bg.subtle', 'bg.surface'] as const) {
      expect(chroma(tinted[role]), role).toBeLessThan(0.03)
    }
  })
})

describe('auditPairings', () => {
  it('passes every lawful pairing for the example themes, in both modes', () => {
    for (const theme of [exampleQuietTheme, exampleStarkTheme]) {
      for (const mode of MODES) {
        const failures = auditPairings(resolveModeColors(theme, mode)).filter((r) => !r.passes)
        expect(
          failures.map((f) => `${pairingId(f.pairing)} = ${f.lc.toFixed(1)}/${f.pairing.minLc}`),
          `${theme.name}/${mode}`,
        ).toEqual([])
      }
    }
  })

  it('measures from the emitted strings, so it audits what ships', () => {
    const colors = resolveModeColors(exampleQuietTheme, 'light')
    const results = auditPairings(colors)
    expect(results.length).toBeGreaterThan(20)
    expect(results.every((r) => Number.isFinite(r.lc))).toBe(true)
  })
})

describe('contrast enforcement', () => {
  it('throws a named error when a pairing cannot be rescued', () => {
    // A background one step from the foreground leaves the nudge loop no room.
    const colors = resolveModeColors(exampleQuietTheme, 'light')
    const impossible = { ...colors, 'text.primary': colors['bg.app'] }
    const broken = auditPairings(impossible).filter((r) => !r.passes)
    expect(broken.length).toBeGreaterThan(0)
  })

  it('reports the offending pairing by name', () => {
    const error = new ContrastLawError(
      { foreground: 'text.primary', background: 'bg.app', minLc: 75, kind: 'text', reason: 'x' },
      42,
      'demo',
      'light',
    )
    expect(error.message).toContain('text.primary on bg.app')
    expect(error.message).toContain('75')
    expect(error.name).toBe('ContrastLawError')
  })
})

/**
 * The tenant test (`docs/verification.md`), automated: arbitrary brand seeds
 * in, a lawful theme out. 36 hues x every chroma budget, rotated across every
 * contrast/strategy/depth combination.
 */
describe('property: any valid seed resolves lawfully', () => {
  const combos: Axes[] = CONTRAST_TEMPERAMENTS.flatMap((contrastTemperament) =>
    COLOR_STRATEGIES.flatMap((colorStrategy) =>
      DEPTHS.map((depth) => axesWith({ contrastTemperament, colorStrategy, depth })),
    ),
  )

  const cases: { hue: number; budget: (typeof CHROMA_BUDGETS)[number]; axes: Axes }[] = []
  let index = 0
  for (let hue = 0; hue < 360; hue += 10) {
    for (const budget of CHROMA_BUDGETS) {
      cases.push({ hue, budget, axes: combos[index % combos.length] ?? combos[0]! })
      index += 1
    }
  }

  // Derived from the enums, so a new value widens the sweep.
  const COMBO_COUNT = CONTRAST_TEMPERAMENTS.length * COLOR_STRATEGIES.length * DEPTHS.length

  it('covers 36 hues x every budget across every temperament/strategy/depth combo', () => {
    expect(cases).toHaveLength(36 * CHROMA_BUDGETS.length)
    expect(combos).toHaveLength(COMBO_COUNT)
    expect(new Set(cases.map((c) => c.axes)).size).toBe(COMBO_COUNT)
    // An enum-derived count would miss one budget skipped and another doubled,
    // so each budget's hue count is checked by name.
    for (const budget of CHROMA_BUDGETS) {
      expect(
        cases.filter((c) => c.budget === budget),
        budget,
      ).toHaveLength(36)
    }
  })

  it.each(MODES)('resolves every case with zero pairing failures in %s mode', (mode: Mode) => {
    const failures: string[] = []
    for (const { hue, budget, axes } of cases) {
      const seeds: Seeds = {
        accentHue: hue,
        neutralTint: 0.008,
        chromaBudget: budget,
        fonts: exampleQuietTheme.seeds.fonts,
      }
      const theme = themeWith(axes, seeds, `probe-${hue}-${budget}`)
      try {
        const colors = resolveModeColors(theme, mode)
        for (const result of auditPairings(colors)) {
          if (!result.passes) {
            failures.push(
              `${theme.name} ${axes.contrastTemperament}/${axes.colorStrategy}/${axes.depth}: ` +
                `${pairingId(result.pairing)} = ${result.lc.toFixed(1)}/${result.pairing.minLc}`,
            )
          }
        }
      } catch (error) {
        failures.push(`${theme.name}: ${(error as Error).message}`)
      }
    }
    expect(failures.slice(0, 10)).toEqual([])
  })

  it('never inverts the border hierarchy, at any hue', () => {
    const inversions: string[] = []
    for (const { hue, budget, axes } of cases) {
      const theme = themeWith(
        axes,
        {
          accentHue: hue,
          neutralTint: 0.008,
          chromaBudget: budget,
          fonts: exampleQuietTheme.seeds.fonts,
        },
        `probe-${hue}-${budget}`,
      )
      for (const mode of MODES) {
        const colors = resolveModeColors(theme, mode)
        const weight = (role: ColorRole) =>
          Math.abs(paintedOn(colors[role], colors['bg.surface']) - lightness(colors['bg.surface']))
        if (
          weight('border.subtle') >= weight('border.default') ||
          weight('border.default') >= weight('border.strong')
        ) {
          inversions.push(`${theme.name}/${mode}`)
        }
      }
    }
    expect(inversions.slice(0, 10)).toEqual([])
  })

  it('never puts a scrim brighter than what it covers, in either mode', () => {
    // A scrim dims: the bottom of the light ladder, the top of the dark one.
    // Step 12 in both would give dark themes a near-white scrim.
    //
    // Equal is allowed, as dark mode gives against `bg.app`: the page is already
    // darkest, and the dimming comes from covering its content.
    const brighter: string[] = []
    for (const { hue, budget, axes } of cases) {
      const theme = themeWith(
        axes,
        {
          accentHue: hue,
          neutralTint: 0.008,
          chromaBudget: budget,
          fonts: exampleQuietTheme.seeds.fonts,
        },
        `scrim-${hue}-${budget}`,
      )
      for (const mode of MODES) {
        const colors = resolveModeColors(theme, mode)
        const covered: ColorRole[] = ['bg.app', 'bg.subtle', 'bg.surface', 'bg.raised']
        for (const role of covered) {
          if (lightness(colors['bg.scrim']) > lightness(colors[role])) {
            brighter.push(`${theme.name}/${mode}/${role}`)
          }
        }
      }
    }
    expect(brighter.slice(0, 10)).toEqual([])
  })
})

describe('pins', () => {
  const withPins = (pins: NonNullable<Seeds['pins']>): Theme => ({
    ...exampleQuietTheme,
    seeds: { ...exampleQuietTheme.seeds, pins },
  })

  it('writes a pinned role exactly as the palette states it, in its mode only', () => {
    const derived = resolveColors(exampleQuietTheme)
    const pinned = resolveColors(
      withPins({
        light: { 'accent.bg': '#1A73E8' },
        dark: { 'border.focus': 'rgb(138 180 248 / .5)' },
      }),
    )
    // Lower-case hex and the engine's own translucent form, so the emitted string is the pin.
    expect(pinned.light['accent.bg']).toBe('#1a73e8')
    expect(pinned.dark['border.focus']).toBe('rgb(138 180 248 / 0.5)')
    // The other mode and every unpinned role keep their derived values.
    expect(pinned.dark['accent.bg']).toBe(derived.dark['accent.bg'])
    expect(pinned.light['border.focus']).toBe(derived.light['border.focus'])
    expect(pinned.light['accent.bgHover']).toBe(derived.light['accent.bgHover'])
  })

  it('chooses a derived label against the pinned fill it sits on', () => {
    // A near-white fill takes the dark pole, which the derived fill never does.
    const colors = resolveModeColors(withPins({ light: { 'accent.bg': '#f5f5f5' } }), 'light')
    expect(lightness(colors['accent.contrast'])).toBeLessThan(0.3)
  })

  it('never moves a pin, and leaves an unrepairable mode to the audit instead of throwing', () => {
    // White on a mid grey sits just under Lc 60. A derived label would be nudged; a pinned one
    // stays, and the failure reaches the audit with its measured value.
    const theme = withPins({ light: { 'accent.bg': '#999999', 'accent.contrast': '#ffffff' } })
    const colors = resolveModeColors(theme, 'light')
    expect(colors['accent.contrast']).toBe('#ffffff')
    const failing = auditPairings(colors).filter((result) => !result.passes)
    expect(failing.map((result) => pairingId(result.pairing))).toContain(
      'accent.contrast on accent.bg',
    )
    // A pin can leave a derived neighbour unrepairable: the dark label chosen for a light pinned
    // fill fails on the derived hover fill. That mode does not throw either.
    expect(() =>
      resolveModeColors(withPins({ light: { 'accent.bg': '#f5f5f5' } }), 'light'),
    ).not.toThrow()
  })
})

describe('oklchOf', () => {
  it('reads a colour as a palette writes one, as the engine measures it', () => {
    // A hex the engine wrote reads back as the colour drawn: the same channels, through the same
    // reading the contrast law measures (`quantize`).
    for (const step of [3, 9, 12] as const) {
      const color = generateRamp(264, 0.21, 'light')[step]
      const drawn = quantize(color)
      expect(oklchOf(toHex(color)), `step ${step}`).toEqual({ ...drawn, alpha: 1 })
    }
    expect(oklchOf('#1F4FD8')).toMatchObject({ h: expect.closeTo(264.52, 2), alpha: 1 })
    expect(oklchOf('#1f4fd8')).toEqual(oklchOf('#1F4FD8'))
    // The ring's translucent form, which a palette may also write.
    expect(oklchOf('rgb(31 79 216 / 0.5)')).toMatchObject({
      h: expect.closeTo(264.52, 2),
      alpha: 0.5,
    })
  })

  it('gives a grey no hue', () => {
    for (const grey of ['#000000', '#808080', '#ffffff']) {
      expect(oklchOf(grey), grey).toMatchObject({ c: 0, h: null })
    }
  })

  it('reads nothing that a palette does not write', () => {
    for (const text of ['#123', '#12345g', 'blue', 'oklch(0.5 0.1 200)', 'rgb(31, 79, 216)', '']) {
      expect(oklchOf(text), text).toBeNull()
    }
  })
})
