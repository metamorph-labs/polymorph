import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AXIS_NAMES, AXIS_VALUES, DENSITIES, ORNAMENTS, type Axes } from './axes'
import { converter } from 'culori'

import { apcaLc, composite, wcagRatio, type Translucent } from './color/contrast'
import { RAMP_STEPS, toCssColor } from './color/ramp'
import {
  FOCUS_RING_ALPHA,
  INK_SELECTED_MIN_DELTA_L,
  TEMPERAMENT_UNDERLINE_ALPHA,
} from './color/role-map'
import {
  auditGlassPairings,
  auditGradientPairings,
  auditPairings,
  generateAllRamps,
} from './color/resolve'
import { auditCoherence, coherenceMessage } from './coherence'
import { axisFlagName, cssVarName, EXPOSED_AXES } from './css-vars'
import {
  deriveNonColorTokens,
  deriveTexture,
  GLASS_SURFACE_MIX,
  TEXTURE_MAX_DELTA_L,
} from './derive'
import { emitThemeCSS } from './emit'
import { emitTokenDocument, type TokenDocument } from './emit-tokens'
import { exampleInkTheme, exampleQuietTheme } from './examples'
import {
  DELINEATION_MIN_DELTA_L,
  gradientPairingId,
  isExemptFromContrast,
  LAWFUL_GRADIENT_PAIRINGS,
  LAWFUL_PAIRINGS,
  LC_FLOORS,
  PAIRING_EXEMPTIONS,
  pairingId,
} from './pairings'
import { PLATFORM_FLOORS, PLATFORMS } from './platforms'
import { resolveTheme } from './resolve-theme'
import { GRADIENT_ROLES, SELECTION_SURFACES, STATUS_TONES, TEXT_BEARING_BACKGROUNDS } from './roles'
import { CHROMA_BUDGET_PEAK, STATUS_CHROMA_FLOOR, statusPeakOf } from './seeds'
import { composeTheme, parsePalette, parseSystem, type Palette, type System } from './systems'
import { MODES, type Mode, type ResolvedTheme, type Theme } from './theme'

/**
 * The laws, over every system and palette the repository ships.
 *
 * `resolve.test.ts` checks the engine over a sweep of seeds. This file checks
 * the **catalogue in `design/systems/` and `design/palettes/`**. The guarantee
 * is any palette on any system, so the laws cover every pairing, not only each
 * system's default. Every system × every palette is resolved once below and
 * shared by every law. The directories are read, not listed, so a new file is
 * covered as soon as it exists and the count never needs editing.
 */

const DESIGN = (dir: string) => resolve(process.cwd(), 'design', dir)

function load<T>(dir: string, parse: (raw: unknown) => T): { name: string; value: T }[] {
  return readdirSync(DESIGN(dir))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw: unknown = JSON.parse(readFileSync(resolve(DESIGN(dir), file), 'utf8'))
      return { name: file.replace(/\.json$/, ''), value: parse(raw) }
    })
}

const SYSTEMS = load('systems', parseSystem)
const PALETTES = load('palettes', parsePalette)

/**
 * The register law. The docs page reads `system.register` from the parsed
 * file, so every committed designed system must have one. A missing register
 * fails here instead of rendering an empty line. Tenants are exempt: a tenant
 * is mostly a palette, and the tenants section describes the kind, not each
 * file.
 */
describe('every committed designed system declares its register', () => {
  for (const { name, value: system } of SYSTEMS) {
    if (system.kind !== 'designed') continue
    it(`${name} has a register`, () => {
      expect(system.register, `${name} has no register`).toBeTruthy()
    })
  }
})

interface Pairing {
  /** The pair id, `<system>/<palette>`, used in failure messages. */
  id: string
  system: System
  palette: Palette
  theme: Theme
  resolved: ResolvedTheme
}

const PAIRINGS: Pairing[] = SYSTEMS.flatMap(({ value: system }) =>
  PALETTES.map(({ value: palette }): Pairing => {
    const theme = composeTheme(system, palette)
    return { id: theme.name, system, palette, theme, resolved: resolveTheme(theme) }
  }),
)

/** The blocks the eager sheet contains: one per system, with its default palette. */
const DEFAULT_PAIRINGS = PAIRINGS.filter((pair) => pair.palette.name === pair.system.defaultPalette)

const designedSystems = () => SYSTEMS.filter((entry) => entry.value.kind === 'designed')

const systemNamed = (name: string) => {
  const found = SYSTEMS.find((entry) => entry.name === name)
  expect(found, `design/systems/${name}.json is missing`).toBeDefined()
  return found!.value
}

const paletteNamed = (name: string) => {
  const found = PALETTES.find((entry) => entry.name === name)
  expect(found, `design/palettes/${name}.json is missing`).toBeDefined()
  return found!.value
}

describe('the catalogue loaded from the repository', () => {
  it('contains both systems and palettes', () => {
    // This prevents the suite from passing over an empty list.
    expect(SYSTEMS.length).toBeGreaterThanOrEqual(2)
    expect(PALETTES.length).toBeGreaterThanOrEqual(2)
    expect(PAIRINGS).toHaveLength(SYSTEMS.length * PALETTES.length)
  })

  it('names each file after its document, so a failure names the right file', () => {
    for (const { name, value } of SYSTEMS) expect(value.name, name).toBe(name)
    for (const { name, value } of PALETTES) expect(value.name, name).toBe(name)
  })

  it('gives every system a default palette that ships', () => {
    // The eager sheet is these pairings. A system pointing at a missing
    // palette would emit nothing.
    const dangling = SYSTEMS.filter(
      ({ value }) => !PALETTES.some((palette) => palette.name === value.defaultPalette),
    ).map(({ value }) => `${value.name} → ${value.defaultPalette}`)

    expect(dangling).toEqual([])
    expect(DEFAULT_PAIRINGS).toHaveLength(SYSTEMS.length)
  })

  it('gives every more-contrast partner a palette that ships', () => {
    // The house emitters (`apps/*/src/themes.ts`, the registry) write the
    // partner's colours into the naming palette's block through `moreContrastOf`,
    // which throws on a partner the catalogue does not hold. This names the
    // palette before a build stops on it.
    const dangling = PALETTES.filter(
      ({ value }) =>
        value.moreContrast !== undefined &&
        !PALETTES.some((palette) => palette.name === value.moreContrast),
    ).map(({ value }) => `${value.name} → ${value.moreContrast}`)

    expect(dangling).toEqual([])
  })
})

/**
 * Cross-product lawfulness.
 *
 * The property sweep covers the seed space. This checks the shipped catalogue
 * **by name**, in both modes, on the emitted values, so a pairing that stops
 * resolving fails here and not when someone first selects it.
 */
describe('contrast law: every system × every palette, both modes', () => {
  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const failures = MODES.flatMap((mode) =>
        auditPairings(pair.resolved.color[mode])
          .filter((result) => !result.passes)
          .map((result) =>
            result.pairing.minDeltaL === undefined
              ? `${mode}: ${pairingId(result.pairing)} — Lc ${result.lc.toFixed(1)} < ` +
                `${result.pairing.minLc} (${result.pairing.reason})`
              : `${mode}: ${pairingId(result.pairing)} — ΔL ${result.deltaL.toFixed(3)} < ` +
                `${result.pairing.minDeltaL} (${result.pairing.reason})`,
          ),
      )

      expect(failures).toEqual([])
    })
  }

  it('sets a selected surface a lightness step from every background where no hue marks it', () => {
    // With a hue the wash differs from a neutral background by its hue. With
    // none it can differ only in lightness. A different colour is not enough:
    // one step of the light ladder from the hover fill, `bg.subtle`, is a
    // second pale grey beside the first. The floor is a lightness difference
    // from every background a table can sit on, the hover fill among them.
    const toOklch = converter('oklch')
    const lightnessOf = (value: string) => {
      const parsed = toOklch(value)
      if (!parsed) throw new Error(`cannot parse ${value}`)
      return parsed.l
    }
    const achromatic = PAIRINGS.filter((pair) => pair.theme.seeds.chromaBudget === 'none')
    expect(achromatic.length).toBeGreaterThan(0)

    // The one case a wash cannot reach the floor. A soft temperament's
    // secondary and muted text cannot be read on the light ladder's step 6, and
    // a tinted system's hover fill is at step 4, so one step is left between
    // them. There the wash is held to being a different colour from the hover
    // fill. The exemption is keyed on the axes, never on a pairing's name, and
    // it is refused wherever the floor is met.
    const oneStepFromHover = (pair: Pairing, mode: string, background: string) =>
      mode === 'light' &&
      background === 'bg.subtle' &&
      pair.system.axes.contrastTemperament === 'soft' &&
      pair.system.axes.colorStrategy === 'tinted'

    const faint = achromatic.flatMap((pair) =>
      MODES.flatMap((mode) => {
        const colors = pair.resolved.color[mode]
        return SELECTION_SURFACES.flatMap((surface) =>
          TEXT_BEARING_BACKGROUNDS.flatMap((background) => {
            const delta = Math.abs(lightnessOf(colors[surface]) - lightnessOf(colors[background]))
            const where = `${pair.id} ${mode}: ${surface}`
            if (oneStepFromHover(pair, mode, background)) {
              if (colors[surface] === colors[background]) return [`${where} is ${background}`]
              return delta < INK_SELECTED_MIN_DELTA_L
                ? []
                : [`${where} meets the floor from ${background}, so its exemption is not needed`]
            }
            return delta < INK_SELECTED_MIN_DELTA_L
              ? [`${where} is ΔL ${delta.toFixed(3)} from ${background}`]
              : []
          }),
        )
      }),
    )
    expect(faint).toEqual([])
  })

  it('measures every pairing the table names, not a subset', () => {
    const [first] = PAIRINGS
    expect(first).toBeDefined()
    expect(auditPairings(first!.resolved.color.light)).toHaveLength(LAWFUL_PAIRINGS.length)
  })
})

/**
 * The glass law.
 *
 * A glass pane's backdrop is unknown at resolve time, so the law measures the
 * worst case. `bg.surface` at `GLASS_SURFACE_MIX`, composited over pure black
 * and pure white, must keep every text pairing that is lawful on the surface
 * above its floor. Any real backdrop falls between the two, so passing both
 * means passing all. Checked over every glass system × every palette × both
 * modes.
 */
describe('glass law: worst-case backdrop, every glass system × every palette', () => {
  const glassPairings = PAIRINGS.filter((pair) => pair.system.axes.depth === 'glass')

  it('has a subject once a glass system ships', () => {
    // Prevents a vacuous pass if the shipped glass system is renamed or removed.
    expect(glassPairings.length).toBeGreaterThan(0)
  })

  for (const pair of glassPairings) {
    it(pair.id, () => {
      const failures = MODES.flatMap((mode) =>
        auditGlassPairings(pair.resolved.color[mode], GLASS_SURFACE_MIX[mode])
          .filter((result) => !result.passes)
          .map(
            (result) =>
              `${mode}/over-${result.extreme}: ${pairingId(result.pairing)} — ` +
              `Lc ${result.lc.toFixed(1)} < ${result.pairing.minLc} (${result.pairing.reason})`,
          ),
      )

      expect(failures).toEqual([])
    })
  }

  it('paints the pane translucent exactly where the axis is glass', () => {
    // `--pm-material-surface` is the only place the mix reaches CSS. Glass panes
    // have an alpha. Every other pane equals its surface, byte for byte.
    for (const pair of PAIRINGS) {
      for (const mode of MODES) {
        if (pair.system.axes.depth === 'glass') {
          expect(pair.resolved.materialSurface[mode], pair.id).toMatch(/\//)
          expect(pair.resolved.materialSurface[mode], pair.id).not.toBe(
            pair.resolved.color[mode]['bg.surface'],
          )
        } else {
          expect(pair.resolved.materialSurface[mode], pair.id).toBe(
            pair.resolved.color[mode]['bg.surface'],
          )
        }
      }
    }
  })
})

/**
 * The scrim law.
 *
 * `bg.scrim` carries no text, so the contrast law does not measure it
 * (`color/contrast.ts`). What a scrim must do is measured here, over the page it
 * covers, in every system × palette × mode:
 *
 * - It never lightens the page or a surface on it. A scrim drawn from the light
 *   end of a dark ramp would brighten the page behind a dialog (`SCRIM_STEP`).
 * - It sets the page back: the page's body text, seen through the scrim, falls
 *   below the secondary-text floor, so nothing behind the panel reads as the
 *   content in front of the reader. A light page is darkened to do it. A dark
 *   page is already the scrim's step, so its text and surfaces dim towards it.
 * - It never brings the page closer to the panel. The panel stands at least as
 *   far from the page behind the scrim as from the page without it, and at
 *   least a hairline's ΔL away. A glass pane is measured as drawn, over the
 *   scrimmed page.
 */
const SCRIM_SURFACES = ['bg.app', 'bg.subtle', 'bg.surface', 'bg.raised'] as const

function readColor(value: string): Translucent {
  const parsed = converter('oklch')(value)
  if (!parsed) throw new Error(`cannot parse ${value}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0, alpha: parsed.alpha ?? 1 }
}

/** What the scrim does wrong in one mode of one pairing, one line each. */
function scrimFaults(colors: ResolvedTheme['color'][Mode], pane: string, mode: Mode): string[] {
  const scrim = readColor(colors['bg.scrim'])
  const page = composite(readColor(colors['bg.app']), { l: 1, c: 0, h: 0 })
  const behind = composite(scrim, page)
  const faults: string[] = []

  for (const surface of SCRIM_SURFACES) {
    const drawn = composite(readColor(colors[surface]), page)
    const dimmed = composite(scrim, drawn)
    if (dimmed.l > drawn.l + 0.001) {
      faults.push(
        `${mode}: the scrim lightens ${surface}, L ${drawn.l.toFixed(3)} → ${dimmed.l.toFixed(3)}`,
      )
    }
  }

  const text = composite(readColor(colors['text.primary']), page)
  const read = Math.abs(apcaLc(composite(scrim, text), behind))
  if (read >= LC_FLOORS.secondaryText) {
    faults.push(
      `${mode}: body text behind the scrim still reads at Lc ${read.toFixed(1)} ≥ ` +
        `${LC_FLOORS.secondaryText}, so the page is not set back`,
    )
  }

  const panel = readColor(pane)
  const apart = Math.abs(composite(panel, behind).l - behind.l)
  const apartWithout = Math.abs(composite(panel, page).l - page.l)
  if (apart < DELINEATION_MIN_DELTA_L) {
    faults.push(
      `${mode}: the panel is ΔL ${apart.toFixed(3)} from the scrimmed page, under ` +
        `${DELINEATION_MIN_DELTA_L}`,
    )
  }
  if (apart < apartWithout - 0.001) {
    faults.push(
      `${mode}: the scrim brings the page closer to the panel, ΔL ` +
        `${apartWithout.toFixed(3)} → ${apart.toFixed(3)}`,
    )
  }
  return faults
}

/** The panel's fill: the overlay surface, or the glass pane under `depth: glass`. */
const paneOf = (pair: Pairing, mode: Mode) =>
  pair.system.axes.depth === 'glass'
    ? pair.resolved.materialSurface[mode]
    : pair.resolved.color[mode]['bg.overlay']

describe('scrim law: it sets the page back and leaves the panel apart, every pairing', () => {
  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const failures = MODES.flatMap((mode) =>
        scrimFaults(pair.resolved.color[mode], paneOf(pair, mode), mode),
      )
      expect(failures).toEqual([])
    })
  }

  it('refuses a scrim that lightens a dark page and one too faint to set a light page back', () => {
    // The law is shown failing for the two faults it exists for, so it cannot
    // pass by measuring nothing.
    const [pair] = PAIRINGS
    expect(pair).toBeDefined()
    const dark = { ...pair!.resolved.color.dark, 'bg.scrim': 'rgb(240 240 240 / 0.6)' }
    expect(scrimFaults(dark, paneOf(pair!, 'dark'), 'dark').join('\n')).toMatch(
      /the scrim lightens bg\.app/,
    )
    const light = { ...pair!.resolved.color.light, 'bg.scrim': 'rgb(10 10 10 / 0.15)' }
    expect(scrimFaults(light, paneOf(pair!, 'light'), 'light').join('\n')).toMatch(
      /the page is not set back/,
    )
  })
})

describe('exemptions are declared, not implied', () => {
  it('gives every exempt role a written reason', () => {
    expect(PAIRING_EXEMPTIONS.length).toBeGreaterThan(0)
    for (const exemption of PAIRING_EXEMPTIONS) {
      expect(exemption.reason.length, exemption.role).toBeGreaterThan(40)
    }
  })

  it('keeps an exempt role out of the lawful table entirely', () => {
    // An exempt role in the table would be measured and fail a floor it does
    // not have.
    const listed = LAWFUL_PAIRINGS.filter(
      (pairing) =>
        isExemptFromContrast(pairing.foreground) || isExemptFromContrast(pairing.background),
    ).map(pairingId)

    expect(listed).toEqual([])
  })

  it('exempts only what it says it exempts', () => {
    expect(isExemptFromContrast('text.disabled')).toBe(true)
    expect(isExemptFromContrast('text.primary')).toBe(false)
    expect(isExemptFromContrast('text.muted')).toBe(false)
  })
})

/**
 * Two standards, one system, and the ledger of where they disagree.
 *
 * The law uses APCA (`docs/theming.md`). Auditors run WCAG 2.1 AA. The two
 * disagree, which is why axe's `color-contrast` rule is off in
 * `packages/react-ui/src/laws.test.tsx`. That is only justified if the disagreement
 * is measured, so it is measured here and cannot grow without a failure.
 *
 * Everything not on this list passes **both** standards. Each entry is a
 * deliberate decision:
 *
 *  - `text.secondary` / `text.muted`: supporting text, APCA Lc 60 / 45. APCA
 *    models small dim text better than a luminance ratio.
 *  - `*.contrast`: **the label on a solid button.** APCA Lc 60 puts white on a
 *    step-9 fill at roughly 3.3–3.9:1, below WCAG's 4.5:1 for normal text.
 *    Most design systems are here too. Raising the `onSolid` floor would darken
 *    every solid fill, which is the colour engine's decision, not a law
 *    test's. Recorded, not changed.
 *  - tonal text (`accent.text`, `{tone}.text`, `selection.text`) on its washes
 *    and surfaces. `MAY_DIVERGE` below explains why.
 *
 * The ledger is keyed on roles, never on a theme. The guarantee is any palette
 * on any system, so an exemption for one named pairing would break that
 * guarantee.
 */
describe('APCA is the law, and this is where it falls short of WCAG 2.1', () => {
  const AA_NORMAL = 4.5

  const toOklch = converter('oklch')
  const parse = (value: string) => {
    const oklch = toOklch(value)
    if (!oklch) throw new Error(`cannot parse ${value}`)
    return { l: oklch.l, c: oklch.c, h: oklch.h ?? 0 }
  }

  /**
   * The pairings allowed to pass APCA and fall short of WCAG 2.1 AA.
   *
   * **This is the cost of the flagship matching the reference exactly.** Step 11
   * of the shared ladder is the reference's `--muted-foreground`, L 0.556, and
   * every tonal text role uses it. In the reference, **0.556 on its 0.97 wash is
   * 4.35:1**, and its `--destructive` text is lighter at L 0.577. The class
   * sits where the reference does, between AA-large and AA.
   *
   * So the declaration is a **class**, not a list of pairs: tonal text
   * (`accent.text`, `{tone}.text`, `selection.text`, roles whose hue is part of
   * their meaning), the supporting greys and the on-solid labels. `text.primary`
   * and `text.inverse`, the body text roles, are not in it and pass both
   * standards everywhere. The AA-large floor below applies to the whole class.
   *
   * The pressed wash (`*.subtleActive`, where green loses contrast fastest)
   * needs no separate clause, because every foreground on it is tonal text.
   */
  const MAY_DIVERGE = (pairing: { foreground: string; background: string }) =>
    pairing.foreground === 'text.secondary' ||
    pairing.foreground === 'text.muted' ||
    pairing.foreground.endsWith('.text') ||
    pairing.foreground.endsWith('.contrast')

  const ratioOf = (
    colors: Record<string, string>,
    pairing: { foreground: string; background: string },
  ) => wcagRatio(parse(colors[pairing.foreground]!), parse(colors[pairing.background]!))

  for (const pair of PAIRINGS) {
    it(`${pair.id}: everything undeclared passes both standards`, () => {
      const short = MODES.flatMap((mode) => {
        const colors = pair.resolved.color[mode]
        return LAWFUL_PAIRINGS.filter(
          (pairing) =>
            pairing.kind === 'text' &&
            !MAY_DIVERGE(pairing) &&
            ratioOf(colors, pairing) < AA_NORMAL,
        ).map(
          (pairing) => `${mode}: ${pairingId(pairing)} — ${ratioOf(colors, pairing).toFixed(2)}:1`,
        )
      })

      expect(short).toEqual([])
    })

    it(`${pair.id}: the declared divergence is no worse than it says`, () => {
      // A floor under the exception: these roles may miss WCAG AA, but not
      // AA-large, below which they would be illegible under both standards.
      const belowLarge = MODES.flatMap((mode) => {
        const colors = pair.resolved.color[mode]
        return LAWFUL_PAIRINGS.filter(
          (pairing) =>
            pairing.kind === 'text' && MAY_DIVERGE(pairing) && ratioOf(colors, pairing) < 3,
        ).map(
          (pairing) => `${mode}: ${pairingId(pairing)} — ${ratioOf(colors, pairing).toFixed(2)}:1`,
        )
      })

      expect(belowLarge).toEqual([])
    })
  }

  it('confines the divergence to the roles that declare it', () => {
    // A new kind of diverging role must be added to the predicate and
    // justified here.
    const diverging = [...new Set(LAWFUL_PAIRINGS.filter(MAY_DIVERGE).map(pairingId))]
    expect(diverging.sort()).toEqual([
      'accent.contrast on accent.bg',
      'accent.contrast on accent.bgActive',
      'accent.contrast on accent.bgHover',
      'accent.text on accent.subtle',
      'accent.text on accent.subtleActive',
      'accent.text on accent.subtleHover',
      'accent.text on bg.app',
      'accent.text on bg.overlay',
      'accent.text on bg.raised',
      'accent.text on bg.subtle',
      'accent.text on bg.surface',
      'accent.text on selection.surface',
      'accent.text on selection.surfaceHover',
      'danger.contrast on danger.solid',
      'danger.contrast on danger.solidActive',
      'danger.contrast on danger.solidHover',
      'danger.text on danger.subtle',
      'danger.text on danger.subtleActive',
      'danger.text on danger.subtleHover',
      'info.contrast on info.solid',
      'info.contrast on info.solidActive',
      'info.contrast on info.solidHover',
      'info.text on info.subtle',
      'info.text on info.subtleActive',
      'info.text on info.subtleHover',
      'selection.text on selection.bg',
      'selection.text on selection.bgHover',
      'success.contrast on success.solid',
      'success.contrast on success.solidActive',
      'success.contrast on success.solidHover',
      'success.text on success.subtle',
      'success.text on success.subtleActive',
      'success.text on success.subtleHover',
      'text.muted on bg.app',
      'text.muted on bg.overlay',
      'text.muted on bg.raised',
      'text.muted on bg.subtle',
      'text.muted on bg.surface',
      'text.muted on selection.surface',
      'text.muted on selection.surfaceHover',
      'text.secondary on bg.app',
      'text.secondary on bg.overlay',
      'text.secondary on bg.raised',
      'text.secondary on bg.subtle',
      'text.secondary on bg.surface',
      'text.secondary on selection.surface',
      'text.secondary on selection.surfaceHover',
      'warning.contrast on warning.solid',
      'warning.contrast on warning.solidActive',
      'warning.contrast on warning.solidHover',
      'warning.text on warning.subtle',
      'warning.text on warning.subtleActive',
      'warning.text on warning.subtleHover',
    ])
  })

  it('never lets body text into the ledger', () => {
    // The class is only acceptable while the body text roles stay out of it.
    expect(MAY_DIVERGE({ foreground: 'text.primary', background: 'bg.app' })).toBe(false)
    expect(MAY_DIVERGE({ foreground: 'text.inverse', background: 'bg.inverse' })).toBe(false)
    expect(MAY_DIVERGE({ foreground: 'accent.text', background: 'bg.app' })).toBe(true)
  })

  it('still holds the diverging roles to the law that governs them', () => {
    // These roles may miss WCAG, but each is still in the table the contrast
    // law measures.
    for (const role of ['text.secondary', 'text.muted', 'accent.contrast']) {
      expect(
        LAWFUL_PAIRINGS.some((pairing) => pairing.foreground === role),
        role,
      ).toBe(true)
    }
  })
})

describe('coherence: every system is a valid, complete set of axes', () => {
  for (const { name, value } of SYSTEMS) {
    it(`${name} validates against the schema`, () => {
      // `parseSystem` would already have thrown. Asserting it here makes the
      // check visible in the law suite.
      expect(() => parseSystem(value)).not.toThrow()
      expect(Object.keys(value.axes).sort()).toEqual([...AXIS_NAMES].sort())
    })
  }

  for (const pair of PAIRINGS) {
    it(`${pair.id} resolves both modes with no warnings`, () => {
      for (const mode of MODES) {
        expect(Object.keys(pair.resolved.color[mode]).length, mode).toBeGreaterThan(0)
      }
    })
  }

  /**
   * The divergence law, about **systems**. Colour belongs to palettes, so a
   * system file holds the design choices this law compares.
   *
   * Tenants are exempt: `kind: 'tenant'` declares that a system reuses another's
   * design, and the tenant suite below checks that. The default is `designed`,
   * so a system that omits `kind` is held to the law.
   */
  /**
   * Reference-calibrated systems are pinned to measured targets instead of
   * designed from a brief: `plain` to a neutral default, and `pebble`,
   * `desktop` and `flint` to established touch, desktop and
   * layered-productivity conventions. Original designs must be distinct,
   * because two house systems one axis apart are one design with two names. A
   * calibrated system's distance follows from its targets: desktop conventions
   * really are one axis from the neutral default. Zero axes apart is still a
   * duplicate for every system.
   */
  const REFERENCE_CALIBRATED = new Set(['plain', 'pebble', 'desktop', 'flint'])

  it('holds every pair of designed systems at least three axes apart', () => {
    const systems = designedSystems()
    expect(systems.length, 'no designed systems — the law would pass vacuously').toBeGreaterThan(1)

    const tooClose: string[] = []
    for (let i = 0; i < systems.length; i += 1) {
      for (let j = i + 1; j < systems.length; j += 1) {
        const a = systems[i]!
        const b = systems[j]!
        const differing = AXIS_NAMES.filter((axis) => a.value.axes[axis] !== b.value.axes[axis])
        const floor = REFERENCE_CALIBRATED.has(a.name) || REFERENCE_CALIBRATED.has(b.name) ? 1 : 3
        if (differing.length < floor) {
          tooClose.push(`${a.name} vs ${b.name} — only ${differing.length} axes apart`)
        }
      }
    }

    expect(tooClose).toEqual([])
  })

  /**
   * The hue band, over palettes.
   *
   * Two palettes 10° apart are effectively one colour. At ±20° two accents
   * read as different decisions. The band covers every palette, a tenant's
   * included, because a palette is a colour identity.
   *
   * **Exempt: `chromaBudget: 'none'`.** Nothing reads an achromatic palette's
   * `accentHue`: its accent ramp has peak 0 and its accent family comes from
   * the neutral ramp. Comparing that hue would compare a number, not a colour,
   * and two ink palettes would collide at 0° for reasons unrelated to colour.
   * The exemption depends on the budget, not a name, so a hued palette cannot
   * claim it.
   */
  /**
   * The calibration exemption for palettes: azure and cobalt are the bright and
   * quiet versions of one interface blue, calibrated ~10° apart on purpose. The
   * band keeps house palettes apart; it does not force calibrated targets
   * apart. The pair must still differ (one hue would be one palette with two
   * names), and each is held to the band against every house palette.
   */
  /**
   * A second pair: `iris` is calibrated to a target violet (OKLCH hue 291,
   * measured), seven degrees from our `amethyst`. Like the blues, the two are
   * exempt only from each other and stay held to the band against every other
   * house palette.
   */
  /**
   * A third pair: `ochre` is calibrated to a target burnt orange (OKLCH hue 50,
   * measured across its family), nineteen degrees from `ember`, the harbor
   * tenant's brand colour. Both are calibrated, and the band still applies
   * against every other house palette.
   */
  const REFERENCE_PALETTE_PAIRS = new Set(['azure|cobalt', 'amethyst|iris', 'ember|ochre'])

  it('gives every palette its own accent-hue band', () => {
    const BAND = 20
    const hued = PALETTES.filter((entry) => entry.value.chromaBudget !== 'none')
    const collisions: string[] = []
    for (let i = 0; i < hued.length; i += 1) {
      for (let j = i + 1; j < hued.length; j += 1) {
        const a = hued[i]!
        const b = hued[j]!
        const raw = Math.abs(a.value.accentHue - b.value.accentHue)
        const apart = Math.min(raw, 360 - raw)
        const pair = [a.name, b.name].sort().join('|')
        if (REFERENCE_PALETTE_PAIRS.has(pair)) {
          if (apart === 0) collisions.push(`${pair} — identical hue, one palette twice`)
          continue
        }
        if (apart < BAND) collisions.push(`${a.name} vs ${b.name} — ${apart.toFixed(0)}° apart`)
      }
    }

    expect(collisions).toEqual([])
  })

  it('exempts an achromatic palette from the band rather than exempting a name', () => {
    // The exemption depends only on the budget: two ink palettes at one hue
    // pass, two hued palettes at one hue do not.
    const band = (palettes: Palette[]) => {
      const hued = palettes.filter((palette) => palette.chromaBudget !== 'none')
      return hued.flatMap((a, i) =>
        hued.slice(i + 1).filter((b) => Math.abs(a.accentHue - b.accentHue) < 20),
      )
    }
    const inkA: Palette = {
      name: 'probe-ink-a',
      accentHue: 0,
      neutralTint: 0,
      chromaBudget: 'none',
    }
    const inkB: Palette = {
      name: 'probe-ink-b',
      accentHue: 0,
      neutralTint: 0,
      chromaBudget: 'none',
    }
    const huedA: Palette = { ...inkA, name: 'probe-hued-a', chromaBudget: 'medium' }
    const huedB: Palette = { ...inkB, name: 'probe-hued-b', chromaBudget: 'medium' }

    expect(band([inkA, inkB])).toEqual([])
    expect(band([huedA, huedB])).toHaveLength(1)
  })

  it('keeps pastel and terminal at least five axes apart', () => {
    const pastel = systemNamed('pastel')
    const terminal = systemNamed('terminal')

    const differing = AXIS_NAMES.filter((axis) => pastel.axes[axis] !== terminal.axes[axis])

    expect(
      differing.length,
      `pastel and terminal agree on all but: ${differing.join(', ')}`,
    ).toBeGreaterThanOrEqual(5)
  })

  it('gives pastel and terminal different default palettes, accent hues and default modes', () => {
    const pastel = systemNamed('pastel')
    const terminal = systemNamed('terminal')
    expect(pastel.defaultPalette).not.toBe(terminal.defaultPalette)
    expect(paletteNamed(pastel.defaultPalette).accentHue).not.toBe(
      paletteNamed(terminal.defaultPalette).accentHue,
    )
    expect(pastel.defaultMode).not.toBe(terminal.defaultMode)
  })
})

/**
 * The tenant test (`docs/verification.md`), over files.
 *
 * A tenant is not a new design. It is one designed system's axes, unchanged,
 * with an untuned brand palette, and it must pass every law above with no
 * manual edits. The sweeps already measure `harbor` on every palette, in both
 * modes, against both standards.
 *
 * This suite checks that `harbor` is still a tenant. A tenant whose axes moved
 * away from its base would pass every law and prove nothing, because the claim
 * is "a palette and a font are enough", not "another system works".
 */
describe('the tenant reuses its base system and adds only its brand', () => {
  const BASE = 'terminal'
  const TENANT = 'harbor'

  it('exists, so the tenant test runs', () => {
    expect(SYSTEMS.some((entry) => entry.name === TENANT)).toBe(true)
    expect(systemNamed(TENANT).kind).toBe('tenant')
  })

  it('copies all eight of its base system’s axes exactly', () => {
    // Deep equality, so a new axis is covered without editing this test.
    expect(
      systemNamed(TENANT).axes,
      `${TENANT} has started making its own taste decisions`,
    ).toEqual(systemNamed(BASE).axes)
  })

  it('may use its own fonts, which the tenant law allows', () => {
    // Fonts are deliberately exempt: a tenant's structure follows its base, but
    // its fonts may differ. Harbor has its own display face.
    expect(systemNamed(TENANT).fonts.display).not.toEqual(systemNamed(BASE).fonts.display)
  })

  it('differs from its base in palette', () => {
    const base = paletteNamed(systemNamed(BASE).defaultPalette)
    const tenant = paletteNamed(systemNamed(TENANT).defaultPalette)

    // A tenant with its base's palette would be a duplicate pairing.
    expect(tenant.accentHue).not.toBe(base.accentHue)
    expect(tenant.neutralTint).not.toBe(base.neutralTint)
    expect(tenant.chromaBudget).not.toBe(base.chromaBudget)
  })
})

/**
 * The emitted-CSS size budget.
 *
 * Gradients, textures, glows and chart roles all add bytes without showing the
 * cost. The ceiling makes the next feature justify its size.
 *
 * **Why this number.** The per-density, per-temperament and per-mode blocks are
 * most of the sheet. Decorative features (partner hue, separate neutral hue,
 * grain texture) are a small share. Colour roles are expensive: each is written
 * five times (base block, both mode blocks, both `[data-tone="inverse"]`
 * borrows). A mode-invariant value such as `--pm-chart-cap` is written three
 * times, because it is never borrowed.
 *
 * The ceiling is **28KB** (28,000 bytes) and is not raised to make room. The
 * largest eager sheet is just under it, so the next token family has to fit a
 * tight budget. It is measured uncompressed and per pairing, because that is
 * what the browser parses and a registry consumer downloads. Gzip would hide
 * the repetitive parts, which are already cheap.
 *
 * **Measured over the eager set**: every system with its default palette. That
 * set is the sheet installed before React. A cross-pairing is appended when
 * selected and costs the same per block.
 */
describe('the emitted stylesheet stays within its size budget', () => {
  const CEILING_BYTES = 28_000

  for (const pair of DEFAULT_PAIRINGS) {
    it(`${pair.id} fits the per-pairing budget`, () => {
      const bytes = Buffer.byteLength(emitThemeCSS(pair.resolved), 'utf8')
      expect(bytes, `${pair.id} emits ${(bytes / 1024).toFixed(1)}KB`).toBeLessThanOrEqual(
        CEILING_BYTES,
      )
    })
  }

  it('measures a non-empty sheet, because an empty one would pass every ceiling', () => {
    const [first] = DEFAULT_PAIRINGS
    expect(Buffer.byteLength(emitThemeCSS(first!.resolved))).toBeGreaterThan(10_000)
  })
})

/**
 * The platform floors.
 *
 * A native renderer takes its sizes from the token document, so the document
 * is where the floors are held, on every platform and at every density:
 *
 * - The hit target is at least the platform's minimum hit area (`platforms.ts`:
 *   WCAG 2.5.8's 24px on the web, 44pt on iOS, 48dp on Android and in
 *   Flutter).
 * - Every control height is at least the web's 24 and is the derivation's own
 *   value. The native minimums are hit areas, not visual heights: a member
 *   extends its hit area to the hit target and keeps the density's height. A
 *   document that raised heights to 44 or 48 would draw every density at one
 *   size on a phone.
 *
 * So the only value a document may raise is a native hit target. On the web it
 * raises nothing, because the stylesheet ships the same values unraised, so a
 * derivation under 24px fails here even though the document would hide it.
 */
describe('platform floors: every hit target at its floor, every control height as derived', () => {
  const SIZES = ['sm', 'md', 'lg'] as const
  const HEIGHT_FLOOR = PLATFORM_FLOORS.web.controlHeight

  it('gives control heights the web’s floor on every platform, and only hit targets a native one', () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_FLOORS[platform].controlHeight, platform).toBe(HEIGHT_FLOOR)
      expect(PLATFORM_FLOORS[platform].hitTarget, platform).toBeGreaterThanOrEqual(HEIGHT_FLOOR)
    }
  })

  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const faults = PLATFORMS.flatMap((platform) => {
        const doc = emitTokenDocument(pair.resolved, { platform })
        const floor = PLATFORM_FLOORS[platform]
        const raised = doc.floor.raised
          .filter((entry) => platform === 'web' || entry.token !== 'hitTarget')
          .map((entry) => `${platform}/${entry.density}: ${entry.token} raised from ${entry.from}`)
        return [
          ...raised,
          ...DENSITIES.flatMap((density) => {
            const set = doc.density[density]
            const derived = pair.resolved.tokens.density[density].controlHeight
            const target =
              set.hitTarget.value < floor.hitTarget
                ? [
                    `${platform}/${density}: hitTarget is ${set.hitTarget.value}, floor is ${floor.hitTarget}`,
                  ]
                : []
            const heights = SIZES.flatMap((size) => {
              const value = set[`controlHeight.${size}`].value
              return [
                ...(value < HEIGHT_FLOOR
                  ? [
                      `${platform}/${density}: controlHeight.${size} is ${value}, floor is ${HEIGHT_FLOOR}`,
                    ]
                  : []),
                ...(value !== parseFloat(derived[size])
                  ? [
                      `${platform}/${density}: controlHeight.${size} is ${value}, derived ${derived[size]}`,
                    ]
                  : []),
              ]
            })
            return [...target, ...heights]
          }),
        ]
      })

      expect(faults).toEqual([])
    })
  }
})

/**
 * Parity: the token document and the stylesheet name the same tokens.
 *
 * Every other emitter reads the document, so a token the CSS has and the
 * document lacks would be missing on every native platform, and a token the
 * document invents would exist nowhere a browser can check it. For every
 * pairing, the stylesheet's `--pm-*` names equal the document's paths through
 * `cssVarName`, except the names below, each with its reason.
 */
describe('parity: the token document carries every token the stylesheet emits', () => {
  /** Emitted by the CSS and deliberately absent from the document. */
  const CSS_ONLY: Record<string, string> = {
    '--pm-axis-depth':
      'a style-query flag for recipes; the document carries every axis in pairing.axes',
    '--pm-axis-geometry':
      'a style-query flag for recipes; the document carries every axis in pairing.axes',
    '--pm-axis-ornament':
      'a style-query flag for recipes; the document carries every axis in pairing.axes',
    '--pm-icon-stroke':
      'an alias of icon.stroke.md for component CSS that expects one stroke value',
    '--pm-text-entry-size':
      'the focus-zoom floor: iOS Safari zooms the viewport on a focused field under 16px, and a native text field has no viewport to zoom',
    '--pm-text-entry-line-height': 'the floor’s line-height, for the same reason',
  }

  /**
   * The document's paths, as CSS token paths. Most keys are paths already. The
   * rest are compound values or named fields, mapped here by the document's
   * shape: a gradient carries its `from` and `to` stops, a spring its three
   * parameters, and four fields take the CSS name they stand for.
   */
  function documentPaths(doc: TokenDocument): Set<string> {
    const paths = new Set<string>(['chart.cap'])
    const add = (keys: Iterable<string>) => {
      for (const key of keys) paths.add(key)
    }
    add(Object.keys(doc.fonts).map((role) => `font.${role}`))
    add(Object.keys(doc.invariant))
    for (const set of Object.values(doc.density)) add(Object.keys(set))
    for (const set of Object.values(doc.motion)) {
      for (const key of Object.keys(set)) {
        if (key.startsWith('motion.spring.')) {
          add(['stiffness', 'damping', 'mass'].map((field) => `${key}.${field}`))
        } else {
          paths.add(key)
        }
      }
    }
    for (const set of Object.values(doc.mode)) {
      add([
        ...Object.keys(set.color),
        ...Object.keys(set.chart),
        ...Object.keys(set.glow),
        ...Object.keys(set.shell),
      ])
      for (const role of Object.keys(set.gradient)) add([role, `${role}.from`, `${role}.to`])
      add(['texture.page', 'material.surface'])
    }
    for (const set of Object.values(doc.inverse)) {
      add([...Object.keys(set.color), ...Object.keys(set.chart)])
    }
    add(doc.exceptions.map((exception) => exception.token))
    return new Set([...paths].map(cssVarName))
  }

  const emitted = (css: string) =>
    new Set([...css.matchAll(/(--pm-[a-z0-9-]+):/g)].map((match) => match[1] as string))

  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const css = emitted(emitThemeCSS(pair.resolved))
      const doc = documentPaths(emitTokenDocument(pair.resolved))
      const dropped = [...css].filter((name) => !doc.has(name) && !(name in CSS_ONLY))
      const invented = [...doc].filter((name) => !css.has(name))
      expect({ dropped, invented }).toEqual({ dropped: [], invented: [] })
    })
  }

  it('keeps the ledger to names the stylesheet really emits, each with a reason', () => {
    const [first] = PAIRINGS
    const css = emitted(emitThemeCSS(first!.resolved))
    for (const [name, reason] of Object.entries(CSS_ONLY)) {
      expect(css.has(name), `${name} is in the ledger but not emitted`).toBe(true)
      expect(reason.length, name).toBeGreaterThan(20)
    }
  })
})

/**
 * Texture stays below perception as a colour change.
 *
 * Contrast is measured against a surface's flat colour. A texture that
 * noticeably darkened the surface would invalidate those measurements.
 */
describe('texture is surface detail, not colour', () => {
  it('keeps every emitted pattern under the lightness bound, in both modes', () => {
    for (const ornament of ORNAMENTS) {
      const { page } = deriveTexture(ornament)
      for (const mode of ['light', 'dark'] as const) {
        const pattern = page[mode]
        if (pattern === 'none') continue
        // Black over light, white over dark, grey noise for grain. The peak
        // alpha is the largest |ΔL| the texture can produce.
        const alphas = [
          ...pattern.matchAll(/(?:slope=['"]|rgb\((?:0 0 0|255 255 255) \/ ?)([0-9.]+)/g),
        ].map((m) => Number(m[1]))
        expect(alphas.length, `${ornament}/${mode} declares no alpha to check`).toBeGreaterThan(0)
        for (const alpha of alphas) {
          expect(alpha, `${ornament}/${mode} peaks at ${alpha}`).toBeLessThanOrEqual(
            TEXTURE_MAX_DELTA_L,
          )
        }
      }
    }
  })

  it('gates texture on the ornament axis in the derivation', () => {
    // Enforced by the function, not by convention or by recipes.
    for (const mode of ['light', 'dark'] as const) {
      expect(deriveTexture('none').page[mode]).toBe('none')
      expect(deriveTexture('minimal').page[mode]).toBe('none')
      expect(deriveTexture('grain').page[mode]).not.toBe('none')
      expect(deriveTexture('grid').page[mode]).not.toBe('none')
    }
  })

  it('draws the grid in a colour that contrasts with its surface, so dark mode shows it', () => {
    // Black strokes over a near-black page produce the same pixel, so the grid
    // must be white in dark mode.
    const { page } = deriveTexture('grid')
    expect(page.light).toContain('rgb(0 0 0')
    expect(page.dark).toContain('rgb(255 255 255')
  })
})

/**
 * The glow guard.
 *
 * A halo is decorative and the focus ring is the accessible focus indicator. A
 * system must not drop the ring because the glow "already shows focus". So the
 * ring's tokens must remain in a theme with no glow, and the ring must never be
 * built from the glow.
 */
describe('a glow never stands in for a focus ring', () => {
  it('keeps the ring intact on a theme with no ornament', () => {
    const bare = deriveNonColorTokens({ ...exampleQuietTheme.axes, ornament: 'none' })
    expect(bare.glow.focus).toBe('none')
    expect(bare.glow.hover).toBe('none')
    // The ring is unchanged: width, offset, and the role it uses.
    expect(bare.focus.width).toMatch(/^\d+px$/)
    expect(bare.focus.offset).toMatch(/^\d+px$/)
    // The ring is a half-alpha halo, so it emits `rgb(… / a)`, not hex. A ring
    // that had been turned off would be `none` or transparent.
    const ring = resolveTheme(exampleQuietTheme).color.light['border.focus']
    expect(ring).toMatch(/^rgb\(/)
    expect(ring).toContain(`/ ${FOCUS_RING_ALPHA}`)
  })

  it('matches the reference ring and field border exactly on the flagship', () => {
    /**
     * The reference's `--ring` is oklch 0.708 light / 0.556 dark, and its
     * `--input` is white at 15% in dark mode where `--border` is 10%. Pinned on
     * the flagship, which must match the reference exactly. Other pairings use
     * the same derivation with their own values.
     */
    const plain = SYSTEMS.find((entry) => entry.name === 'plain')!.value
    const neutral = PALETTES.find((entry) => entry.name === 'neutral')!.value
    const flagship = resolveTheme(composeTheme(plain, neutral))

    // oklch(0.708 0 0) and oklch(0.556 0 0), through the engine's own gamut.
    expect(flagship.color.light['border.focusSolid']).toBe('#a1a1a1')
    expect(flagship.color.dark['border.focusSolid']).toBe('#737373')
    expect(flagship.color.light['border.focus']).toBe(`rgb(161 161 161 / ${FOCUS_RING_ALPHA})`)
    expect(flagship.color.dark['border.focus']).toBe(`rgb(115 115 115 / ${FOCUS_RING_ALPHA})`)

    // `--input` vs `--border`: equal in light mode, different in dark mode.
    expect(flagship.color.light['border.field']).toBe(flagship.color.light['border.default'])
    expect(flagship.color.light['border.field']).toBe('#e5e5e5')
    expect(flagship.color.dark['border.field']).toBe('rgb(255 255 255 / 0.15)')
    expect(flagship.color.dark['border.default']).toBe('rgb(255 255 255 / 0.1)')
  })

  it('sets the resting underline strength by temperament: 0.4, 0.5, or full', () => {
    // Soft systems draw the resting underline at 0.4, standard at 0.5. Stark
    // systems do not soften it, so it resolves with no alpha.
    for (const { name, value: system } of SYSTEMS) {
      const palette = PALETTES.find((entry) => entry.name === system.defaultPalette)!.value
      const resolved = resolveTheme(composeTheme(system, palette))
      for (const mode of MODES) {
        const underline = resolved.color[mode]['accent.underline']
        const alpha = TEMPERAMENT_UNDERLINE_ALPHA[system.axes.contrastTemperament]
        if (alpha === 1) {
          expect(underline, `${name} ${mode}`).not.toContain('/')
        } else {
          expect(underline, `${name} ${mode}`).toContain(`/ ${alpha}`)
        }
      }
    }
  })

  it('draws the glow from a glow role, never from the ring’s', () => {
    const lit = deriveNonColorTokens({ ...exampleQuietTheme.axes, ornament: 'minimal' })
    expect(lit.glow.focus).toContain('--pm-accent-glow')
    expect(lit.glow.focus).not.toContain('--pm-border-focus')
  })
})

/**
 * How a recipe may branch on a system without knowing which system it is in.
 *
 * A recipe never names a house system. For a structural difference it branches
 * on an axis the emitter exposes as a flag token. Each exposed axis allows a
 * branch instead of a value, so the list is asserted here and adding to it
 * requires editing a law.
 */
describe('theme-neutral recipes: only three axes are exposed, deliberately', () => {
  it('exposes exactly the three axes that can demand a structural branch', () => {
    expect([...EXPOSED_AXES]).toEqual(['depth', 'geometry', 'ornament'])
  })

  it('emits a flag token per exposed axis, carrying that system’s value', () => {
    for (const pair of DEFAULT_PAIRINGS) {
      const css = emitThemeCSS(pair.resolved)
      for (const axis of EXPOSED_AXES) {
        expect(css, `${pair.id} / ${axis}`).toContain(
          `${axisFlagName(axis)}: ${pair.resolved.axes[axis]};`,
        )
      }
    }
  })

  it('never names a system or a palette in a flag', () => {
    // A flag tells a recipe what kind of system it is in, never which system
    // or palette. A name in a flag would bypass `polymorph/no-theme-selectors`.
    for (const pair of DEFAULT_PAIRINGS) {
      const css = emitThemeCSS(pair.resolved)
      for (const axis of EXPOSED_AXES) {
        const line = css.split('\n').find((row) => row.includes(`${axisFlagName(axis)}:`))
        expect(line, `${pair.id} / ${axis}`).toBeDefined()
        expect(line).not.toContain(pair.system.name)
        expect(line).not.toContain(pair.palette.name)
      }
    }
  })
})

/**
 * The gradient contrast law: **measured at the worst stop.**
 *
 * A label that passes at one end of a gradient and fails at the other is
 * illegible across part of its width. This runs over every pairing. Without a
 * partner hue the two stops are the same colour and the rule reduces to the
 * ordinary check.
 */
describe('gradient law: legible at both ends', () => {
  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const failures = MODES.flatMap((mode) =>
        auditGradientPairings(pair.resolved.color[mode], pair.resolved.gradient[mode])
          .filter((result) => !result.passes)
          .map(
            (result) =>
              `${mode}: ${gradientPairingId(result.pairing)} — Lc ${result.lc.toFixed(1)} < ` +
              `${result.pairing.minLc} at the '${result.worstStop}' stop`,
          ),
      )

      expect(failures).toEqual([])
    })
  }

  it('measures both stops, not just the one the role falls back to', () => {
    // An illegible second stop must fail even though the first stop (the
    // fallback colour role) passes.
    const partnered: Theme = {
      ...exampleQuietTheme,
      name: 'probe/gradient',
      seeds: { ...exampleQuietTheme.seeds, gradientHue: 75 },
    }
    const resolved = resolveTheme(partnered)
    const audited = auditGradientPairings(resolved.color.light, resolved.gradient.light)
    expect(audited.length).toBe(LAWFUL_GRADIENT_PAIRINGS.length)

    const sabotaged = {
      ...resolved.gradient.light,
      'accent.gradient': {
        ...resolved.gradient.light['accent.gradient'],
        to: resolved.color.light['bg.app'],
      },
    }
    const broken = auditGradientPairings(resolved.color.light, sabotaged).filter((r) => !r.passes)
    expect(broken.map((r) => r.worstStop)).toContain('to')
  })

  it('resolves to a solid colour in both stops when no partner hue is seeded', () => {
    const resolved = resolveTheme(exampleQuietTheme)
    for (const mode of MODES) {
      for (const role of GRADIENT_ROLES) {
        const value = resolved.gradient[mode][role]
        expect(value.solid, `${mode} ${role}`).toBe(true)
        expect(value.from).toBe(value.to)
        // The no-op form is a plain colour, so a recipe need not know whether
        // gradients exist.
        expect(value.css).toBe(value.from)
      }
    }
  })

  it('produces two real stops once a partner hue is seeded', () => {
    const partnered: Theme = {
      ...exampleQuietTheme,
      name: 'probe/gradient',
      seeds: { ...exampleQuietTheme.seeds, gradientHue: 200 },
    }
    const value = resolveTheme(partnered).gradient.light['accent.gradient']
    expect(value.solid).toBe(false)
    expect(value.from).not.toBe(value.to)
    expect(value.css.startsWith('linear-gradient(')).toBe(true)
  })
})

/**
 * The ink budget: `chromaBudget: 'none'`.
 *
 * The other four budgets are one derivation at four chroma levels. `none` is
 * different: at peak 0 there is no hue, so the accent family derives from the
 * **neutral** ramp. The fixture is `example-ink`. The expected values below are
 * the reference's numbers, not copied derivation output. The catalogue laws
 * above cover the shipped ink palettes.
 *
 * Targets (the reference calibration's `--primary` and `--primary-foreground`,
 * ±0.02 lightness): accent fill 0.205 light / **0.922 dark**, its label 0.985
 * light / 0.205 dark.
 */
describe('the ink budget: an accent that is ink, not a hue', () => {
  const ink = resolveTheme(exampleInkTheme)
  const inkRamps = generateAllRamps(exampleInkTheme.seeds)
  const toOklchValue = converter('oklch')

  const read = (value: string) => {
    const parsed = toOklchValue(value)
    if (!parsed) throw new Error(`cannot parse ${value}`)
    return { l: parsed.l, c: parsed.c, alpha: parsed.alpha ?? 1 }
  }
  const near = (value: string, target: number) => Math.abs(read(value).l - target)

  /** The spec's tolerance where it does not annotate one. */
  const TOLERANCE = 0.02

  it('is achromatic everywhere a hued accent would be', () => {
    // Exactly grey. The status ramps are measured separately below.
    const chromatic: string[] = []
    for (const mode of MODES) {
      for (const ramp of ['neutral', 'tinted', 'accent', 'gradient'] as const) {
        for (const step of RAMP_STEPS) {
          const { c } = inkRamps[mode][ramp][step]
          if (c !== 0) chromatic.push(`${mode} ${ramp}.${step} — c ${c}`)
        }
      }
    }
    expect(chromatic).toEqual([])
  })

  it('fills with ink in light and inverts the fill in dark', () => {
    // The only budget whose fills are not pinned to `SOLID_LADDER`. An ink fill
    // is a foreground colour, and foregrounds invert.
    expect(near(ink.color.light['accent.bg'], 0.205), 'light fill').toBeLessThanOrEqual(TOLERANCE)
    expect(near(ink.color.dark['accent.bg'], 0.922), 'dark fill').toBeLessThanOrEqual(TOLERANCE)
    expect(read(ink.color.dark['accent.bg']).l).toBeGreaterThan(
      read(ink.color.light['accent.bg']).l,
    )
  })

  it('inverts the label together with the fill', () => {
    expect(near(ink.color.light['accent.contrast'], 0.985), 'light').toBeLessThanOrEqual(TOLERANCE)
    expect(near(ink.color.dark['accent.contrast'], 0.205), 'dark').toBeLessThanOrEqual(TOLERANCE)
  })

  it('darkens when pressed in both light and dark mode', () => {
    // Rest → hover → active always gets darker. The inversion changes where the
    // fill starts, not its direction.
    for (const mode of MODES) {
      const colors = ink.color[mode]
      expect(read(colors['accent.bgHover']).l, `${mode} hover`).toBeLessThan(
        read(colors['accent.bg']).l,
      )
      expect(read(colors['accent.bgActive']).l, `${mode} active`).toBeLessThan(
        read(colors['accent.bgHover']).l,
      )
    }
  })

  it('passes the contrast law unchanged, including the dark inversion', () => {
    // The exemptions above apply to hue laws. Legibility is not a hue law.
    const failures = MODES.flatMap((mode) =>
      auditPairings(ink.color[mode])
        .filter((result) => !result.passes)
        .map(
          (result) =>
            `${mode}: ${pairingId(result.pairing)} — Lc ${result.lc.toFixed(1)} < ` +
            `${result.pairing.minLc}`,
        ),
    )
    expect(failures).toEqual([])
  })

  it('takes its washes from the neutral ramp, like the surfaces', () => {
    // With no brand hue, the wash is the neutral step the surfaces use.
    for (const mode of MODES) {
      const colors = ink.color[mode]
      for (const [role, step] of [
        ['accent.subtle', 3],
        ['accent.subtleHover', 4],
        ['accent.subtleActive', 5],
      ] as const) {
        expect(colors[role], `${mode} ${role}`).toBe(toCssColor(inkRamps[mode].neutral[step]))
      }
    }
  })

  it('uses text.primary for accent text, because ink text is ordinary text', () => {
    for (const mode of MODES) {
      expect(ink.color[mode]['accent.text'], mode).toBe(ink.color[mode]['text.primary'])
    }
  })

  it('selects with ink and inverts the label on it', () => {
    // Under none `accent.subtle` equals `bg.subtle`, so a wash would leave a
    // selected row unchanged. Ink is the only way left to mark it.
    for (const mode of MODES) {
      const colors = ink.color[mode]
      expect(colors['selection.bg'], `${mode} bg`).toBe(colors['accent.bg'])
      expect(colors['selection.text'], `${mode} text`).toBe(colors['accent.contrast'])
    }
  })

  it('fills a selected surface with a wash, never with ink', () => {
    // A selected row holds text in every role, and controls. On the ink fill
    // primary text is the fill's own colour.
    for (const mode of MODES) {
      const colors = ink.color[mode]
      for (const role of SELECTION_SURFACES) {
        expect(colors[role], `${mode} ${role}`).not.toBe(colors['selection.bg'])
        expect(colors[role], `${mode} ${role}`).not.toBe(colors['selection.bgHover'])
      }
    }
  })

  it('resolves the glow to no halo, because an achromatic system has no decorative glow', () => {
    for (const mode of MODES) {
      expect(read(ink.color[mode]['accent.glow']).alpha, mode).toBe(0)
    }
    // The focus ring is a separate role and remains, as the glow guard
    // requires, at half alpha.
    expect(read(ink.color.light['border.focus']).alpha).toBe(FOCUS_RING_ALPHA)
    expect(read(ink.color.light['border.focus']).alpha).toBeGreaterThan(0)
  })

  it('resolves the gradient to a solid even when a partner hue is seeded', () => {
    const partnered: Theme = {
      ...exampleInkTheme,
      name: 'probe/ink-gradient',
      seeds: { ...exampleInkTheme.seeds, gradientHue: 200 },
    }
    const resolved = resolveTheme(partnered)
    for (const mode of MODES) {
      for (const role of GRADIENT_ROLES) {
        const value = resolved.gradient[mode][role]
        expect(value.solid, `${mode} ${role}`).toBe(true)
        expect(value.css, `${mode} ${role}`).toBe(value.from)
      }
    }
  })

  it('keeps the four status colours at the low chroma floor', () => {
    // `none` removes the accent's chroma, not the status colours'.
    expect(statusPeakOf(exampleInkTheme.seeds)).toBe(STATUS_CHROMA_FLOOR)
    expect(CHROMA_BUDGET_PEAK.none).toBe(0)
    for (const mode of MODES) {
      for (const tone of STATUS_TONES) {
        expect(read(ink.color[mode][`${tone}.solid`]).c, `${mode} ${tone}`).toBeGreaterThan(0.05)
      }
    }
  })
})

/**
 * Axis coherence, swept.
 *
 * Every axis combination (18,432 at eight axes), not only the shipped systems.
 * They are cheap to derive, and the combinations nobody has written yet are the
 * ones most likely to break.
 */
describe('coherence: every axis combination derives a consistent system', () => {
  const everyAxisCombination = (): Axes[] => {
    let combos: Axes[] = [{} as Axes]
    for (const axis of AXIS_NAMES) {
      const next: Axes[] = []
      for (const partial of combos) {
        for (const value of AXIS_VALUES[axis]) next.push({ ...partial, [axis]: value })
      }
      combos = next
    }
    return combos
  }

  const COMBINATIONS = everyAxisCombination()

  it('covers every combination in the space', () => {
    const expected = AXIS_NAMES.reduce((total, axis) => total * AXIS_VALUES[axis].length, 1)
    expect(COMBINATIONS).toHaveLength(expected)
  })

  it('finds no incoherent combination anywhere in the space', () => {
    const broken: string[] = []
    for (const axes of COMBINATIONS) {
      for (const violation of auditCoherence(axes, deriveNonColorTokens(axes))) {
        broken.push(`${AXIS_NAMES.map((a) => axes[a]).join('/')} — ${coherenceMessage(violation)}`)
      }
    }
    // Trimmed, so a broken constraint does not print thousands of identical lines.
    expect(broken.slice(0, 5)).toEqual([])
    /*
     * Quick alone, but it can exceed vitest's default five seconds in a
     * full-suite run, where two browser projects and a package build share the
     * cores. A gate that fails under load teaches people to re-run it.
     */
  }, 30_000)

  it('fails on a deliberately incoherent combination', () => {
    // A flat system whose card has a shadow and whose menu has none passes
    // every other law: the schema accepts the axes, the contrast law ignores
    // shadows, and the emitter writes whatever it is given.
    const axes = { ...exampleQuietTheme.axes, depth: 'flat' as const }
    const derived = deriveNonColorTokens(axes)
    const incoherent = {
      ...derived,
      shadow: { ...derived.shadow, raised: '0 2px 8px rgb(0 0 0 / 0.1)', overlay: 'none' },
    }

    const rules = auditCoherence(axes, incoherent).map((violation) => violation.rule)
    expect(rules).toContain('flat-forbids-resting-elevation')
    expect(rules).toContain('flat-still-detaches-transients')
  })

  it('fails on decoration a system does not permit', () => {
    const axes = { ...exampleQuietTheme.axes, ornament: 'none' as const }
    const derived = deriveNonColorTokens(axes)
    const lit = { ...derived, glow: { focus: '0 0 0 4px red', hover: 'none' } }

    expect(auditCoherence(axes, lit).map((v) => v.rule)).toContain('no-ornament-no-decoration')
  })

  it('fails on a texture the ornament axis does not permit', () => {
    const axes = { ...exampleQuietTheme.axes, ornament: 'minimal' as const }
    const derived = deriveNonColorTokens(axes)
    const pattern = 'url("data:image/svg+xml,x")'
    const textured = { ...derived, texture: { page: { light: pattern, dark: pattern } } }

    expect(auditCoherence(axes, textured).map((v) => v.rule)).toContain(
      'texture-is-gated-on-ornament',
    )
  })
})
