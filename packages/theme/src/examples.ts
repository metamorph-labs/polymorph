import { composeTheme, type Palette, type System } from './systems'
import type { Theme } from './theme'

/**
 * ENGINE FIXTURES, not design systems or palettes.
 *
 * The engine's tests need themes that do not change when a house system is
 * retuned. The two systems differ on every axis (8/8 divergence) to cover the
 * engine's range, and the palettes cover the range of colour, with
 * `example-ink` as the achromatic case. The `example-` prefix keeps them
 * distinct from the real systems in `design/systems/` and palettes in
 * `design/palettes/`.
 *
 * They are composed with `composeTheme`, like the catalogue, so no fixture is a
 * `Theme` that was never shown to be composable.
 */

export const exampleQuietSystem: System = {
  name: 'example-quiet',
  axes: {
    geometry: 'soft',
    depth: 'elevated',
    density: 'standard',
    contrastTemperament: 'standard',
    typePersonality: 'humanist',
    colorStrategy: 'quiet',
    motionTemperament: 'standard',
    ornament: 'minimal',
  },
  fonts: {
    body: { family: 'Inter' },
    display: { family: 'Inter' },
    mono: { family: 'JetBrains Mono' },
  },
  defaultPalette: 'example-violet',
  defaultMode: 'light',
  kind: 'designed',
}

export const exampleVioletPalette: Palette = {
  name: 'example-violet',
  accentHue: 255,
  neutralTint: 0.008,
  chromaBudget: 'medium',
}

export const exampleStarkSystem: System = {
  name: 'example-stark',
  axes: {
    geometry: 'sharp',
    depth: 'flat',
    density: 'compact',
    contrastTemperament: 'stark',
    typePersonality: 'grotesque',
    colorStrategy: 'tinted',
    motionTemperament: 'subtle',
    ornament: 'none',
  },
  fonts: {
    body: { family: 'Archivo' },
    display: { family: 'Archivo' },
    mono: { family: 'IBM Plex Mono' },
  },
  defaultPalette: 'example-jade',
  defaultMode: 'dark',
  kind: 'designed',
}

export const exampleJadePalette: Palette = {
  name: 'example-jade',
  accentHue: 145,
  neutralTint: 0.004,
  chromaBudget: 'high',
}

/**
 * The achromatic fixture: the ink budget and nothing else unusual.
 *
 * `chromaBudget: 'none'` is the only budget that is not a scaled version of the
 * others: the accent family derives from the neutral ramp. The laws need a
 * strictly achromatic fixture, so `neutralTint` is 0 too, otherwise "every ramp
 * chroma is 0" would only hold for the accent. `accentHue` is 0 and unused, and
 * the laws check that nothing uses it.
 *
 * A palette, not a system, because the budget is a colour setting. It reuses an
 * example system instead of adding a third set of axes.
 */
export const exampleInkPalette: Palette = {
  name: 'example-ink',
  accentHue: 0,
  neutralTint: 0,
  chromaBudget: 'none',
}

export const exampleQuietTheme: Theme = composeTheme(exampleQuietSystem, exampleVioletPalette)
export const exampleStarkTheme: Theme = composeTheme(exampleStarkSystem, exampleJadePalette)
export const exampleInkTheme: Theme = composeTheme(exampleQuietSystem, exampleInkPalette)

/**
 * The probe: one pairing that holds every kind of value the native emitters
 * write and no house pairing does. A tenant, an italic display face, glass, a
 * grid texture, a gradient partner, and a member exception of each family
 * (radius, shadow, inset). The Swift, Kotlin and Dart emitters' tests, the
 * native tree's test and the iOS loader's fixtures
 * (`platforms/ios/Tests/fixtures/token-documents.mjs`) all read this one, so a
 * value one of them covers, all of them cover.
 *
 * Not in `EXAMPLE_SYSTEMS` or `EXAMPLE_THEMES`: the laws sweep those, and the
 * probe's exceptions are declared deviations, not a design.
 */
export const exampleProbeSystem: System = {
  ...exampleQuietSystem,
  name: 'example-probe',
  kind: 'tenant',
  axes: { ...exampleQuietSystem.axes, depth: 'glass', ornament: 'grid', typePersonality: 'mono' },
  fonts: {
    body: { family: 'Public Sans Variable' },
    display: { family: 'Fraunces Variable', fallback: 'serif', style: 'italic' },
    mono: { family: 'IBM Plex Mono' },
  },
  overrides: {
    exceptions: [
      { component: 'button', family: 'radius', class: 'control', step: 'sm', because: 'A probe.' },
      {
        component: 'card',
        family: 'shadow',
        class: 'resting',
        step: 'overlay',
        because: 'A probe.',
      },
      { component: 'menu', family: 'inset', class: 'list', step: 4, because: 'A probe.' },
    ],
  },
}

/** The probe's palette: the violet example with a gradient partner hue. */
export const exampleDuskPalette: Palette = {
  ...exampleVioletPalette,
  name: 'example-dusk',
  gradientHue: 200,
}

export const exampleProbeTheme: Theme = /* @__PURE__ */ composeTheme(
  exampleProbeSystem,
  exampleDuskPalette,
)

export const EXAMPLE_SYSTEMS: readonly System[] = [exampleQuietSystem, exampleStarkSystem]
export const EXAMPLE_PALETTES: readonly Palette[] = [
  exampleVioletPalette,
  exampleJadePalette,
  exampleInkPalette,
]
export const EXAMPLE_THEMES: readonly Theme[] = [
  exampleQuietTheme,
  exampleStarkTheme,
  exampleInkTheme,
]
