import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  deriveNonColorTokens,
  AXIS_NAMES,
  AXIS_VALUES,
  CHART_ROLES,
  COLOR_ROLE_GROUPS,
  COLOR_ROLES,
  composeTheme,
  cssVarName,
  DISPLAY_STEPS,
  DURATION_ROLES,
  EASING_ROLES,
  emitThemeCSS,
  EXPOSED_AXES,
  GLOW_STEPS,
  GRADIENT_ROLES,
  ICON_SIZES,
  moreContrastOf,
  parsePalette,
  parseSystem,
  RADIUS_STEPS,
  resolveTheme,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
  type Mode,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/theme'

import { fontsFor, PREPAINT, type FontRequirement } from './install'

/**
 * The token and axis catalogue, split into systems and palettes.
 *
 * It is read from `@polymorph/theme`, not copied by hand. The custom properties
 * are read from what the emitter *writes*, not from the role names it writes
 * them from. Those lists differ, because density scopes, modes and temperaments
 * each re-declare a subset. A recipe author or an agent needs the list of
 * properties that will resolve.
 *
 * A theme has two halves, and the catalogue's shape keeps them apart. A
 * **system** is the structural personality (axes, fonts, presentation defaults)
 * and a **palette** is the colour voice. Nothing here pairs them, except the
 * eager pairings that the custom-property union and each system's token values
 * are read from. A front that wants another pairing composes one. Every palette is lawful on every system, so publishing
 * the whole cross-product would add a large table that no reader needs.
 */

export interface RegistrySystem {
  name: string
  /** All eight, stringified, in `AXIS_NAMES` order. */
  axes: Record<string, string>
  /**
   * The webfonts the system's three slots need, one entry per family.
   *
   * It names the npm package, not only the family, because apps load fonts and
   * the library never bundles them. An installer given only a family name would
   * have to derive the package, and a front that derives becomes a second
   * source of truth. Fonts belong to the system, not the palette, because a
   * serif display face is part of the system's personality.
   */
  fonts: FontRequirement[]
  /** The palette this system uses unless another one is chosen. */
  defaultPalette: string
  defaultMode: string
  kind: string
  /** The system JSON, one half of a theme install. */
  file: string
  spec: string | null
  /**
   * What each token is worth when this system wears its default palette, for
   * the rules that name the nearest token to a raw value (see `TokenValues`).
   */
  tokenValues: TokenValues
}

/**
 * The values a raw colour, length or duration is compared with, by family:
 * custom property -> value. It is the shape the rules take as their `values`
 * option (`TokenValues` in `@polymorph/rules/stylelint/emitted`), with every
 * family present.
 *
 * Published per system because an installed app's lint config is written
 * before anything compiles its theme. `polymorph add` reads these values from
 * the sheet it compiles. `polymorph init` leaves compiling to the Vite plugin at
 * build time, so it writes the registry's instead, and the registry reads them
 * from the same resolved theme the sheet is emitted from.
 */
export interface TokenValues {
  /** Colour roles, in the engine's role order. Chart series are not roles and are left out. */
  color: Record<string, string>
  /** `--pm-space-N`. */
  space: Record<string, string>
  /** `--pm-radius-*` steps. */
  radius: Record<string, string>
  /** `--pm-text-*-size` and `--pm-display-*-size`. */
  text: Record<string, string>
  /** Control heights and icon sizes. */
  size: Record<string, string>
  /** `--pm-motion-duration-*`. */
  duration: Record<string, string>
}

/**
 * A pairing's token values, as its sheet declares them before any scope
 * attribute applies: the default mode, and the density and motion temperament
 * its system's axes choose. That is what the page renders, and it is the block
 * `tokenValues` in the rules and `tokenValuesIn` in the CLI read from the
 * emitted CSS. This reads the resolved theme the emitter writes that block
 * from, so no CSS is parsed. The families are chosen by the engine's own role
 * and step lists, and a value that only references another token is left out.
 */
export function tokenValuesOf(theme: ResolvedTheme): TokenValues {
  // The emitter's fallback: a preference that is not `dark` renders light.
  const mode: Mode = theme.defaultMode === 'dark' ? 'dark' : 'light'
  const density = theme.tokens.density[theme.axes.density]
  const motion = theme.tokens.motion[theme.axes.motionTemperament]

  const family = (entries: readonly (readonly [string, string | number])[]) => {
    const values: Record<string, string> = {}
    for (const [path, value] of entries) {
      const written = String(value).trim()
      if (!written.startsWith('var(')) values[cssVarName(path)] = written
    }
    return values
  }

  return {
    color: family(COLOR_ROLES.map((role) => [role, theme.color[mode][role]] as const)),
    space: family(SPACE_STEPS.map((step) => [`space.${step}`, density.space[step]] as const)),
    radius: family(
      RADIUS_STEPS.map((step) => [`radius.${step}`, theme.tokens.radius[step]] as const),
    ),
    text: family([
      ...TEXT_STEPS.map((step) => [`text.${step}.size`, theme.tokens.text[step].size] as const),
      ...DISPLAY_STEPS.map(
        (step) => [`display.${step}.size`, theme.tokens.display[step].size] as const,
      ),
    ]),
    size: family([
      ...(['sm', 'md', 'lg'] as const).map(
        (size) => [`controlHeight.${size}`, density.controlHeight[size]] as const,
      ),
      ...ICON_SIZES.map((size) => [`icon.size.${size}`, theme.tokens.icon.size[size]] as const),
    ]),
    duration: family(
      DURATION_ROLES.map((role) => [`motion.duration.${role}`, motion.duration[role]] as const),
    ),
  }
}

export interface RegistryPalette {
  name: string
  accentHue: number
  /** Usually absent. Without it, every gradient role resolves to a solid colour. */
  gradientHue?: number
  neutralHue?: number
  neutralTint: number
  chromaBudget: string
  /**
   * The palette its colours give way to under the more-contrast query. Absent
   * for most palettes. An install of this palette installs the partner too,
   * because the pairing is compiled with it.
   */
  moreContrast?: string
  /** The palette JSON, which is the whole of a palette install. */
  file: string
}

/**
 * The catalogue-level token *values*, not only names.
 *
 * Names without magnitudes cannot size a mark. A step name gives the step's
 * position but not the distance between steps. An agent given `space: 0…10` and
 * asked to draw a 24px dot cannot tell that it is step 6.
 *
 * Only the two scales that are a *system* fact, not a pairing's, are published.
 * No palette and no axis but density changes space or control height. A system
 * may still amend either (`overrides.space`, `overrides.controlHeight` in
 * `docs/theming.md`), so these are the unamended values: what a system without
 * overrides resolves to. Every other value belongs to a pairing. The catalogue
 * publishes them for each system's own pairing (`RegistrySystem.tokenValues`)
 * and deliberately not for the cross-product (see `readTheme`).
 */
export interface StandardDensity {
  /** Space step -> px, at standard density. Compact and comfortable rescale it. */
  space: Record<string, string>
  /** `sm` / `md` / `lg` control heights, at standard density. Other densities rescale them. */
  controlHeight: Record<string, string>
}

/** What each retired system or palette name became, old name -> current name. */
export interface ThemeRenames {
  systems: Record<string, string>
  palettes: Record<string, string>
}

/**
 * The systems and palettes the catalogue shipped under another name.
 *
 * A consumer's `polymorph.json` records the names it installed, and the
 * catalogue does not keep an old name beside the new one. Without this table
 * an update finds the old name missing, drops it, and leaves the install with
 * no system. With it, `polymorph update` moves the manifest to the current
 * name. Each entry is a rename of the same document: the axes, fonts and
 * default palette are unchanged, and only the name and its prose moved.
 * `registry.test.ts` holds every current name to a shipped one and every old
 * name to one the catalogue no longer has.
 */
export const RENAMED: ThemeRenames = {
  systems: { fluent: 'flint', ios: 'pebble', macos: 'desktop', shadcn: 'plain' },
  palettes: {},
}

export interface ThemeCatalogue {
  axes: { name: string; values: string[]; exposed: boolean }[]
  colorRoles: Record<string, string[]>
  scales: Record<string, string[]>
  standardDensity: StandardDensity
  customProperties: string[]
  systems: RegistrySystem[]
  palettes: RegistryPalette[]
  /** What each retired system or palette name became (`RENAMED`). */
  renamed: ThemeRenames
  /** Inline in `<head>` before any stylesheet. See `install.ts`. */
  prepaint: string
}

const SYSTEM_DIR = 'design/systems'
const PALETTE_DIR = 'design/palettes'

/** Sorted by name, because `readdirSync` guarantees no order and the registry needs one. */
function readJson(root: string, dir: string): { file: string; json: unknown }[] {
  const path = resolve(root, dir)
  if (!existsSync(path)) return []

  return readdirSync(path)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, json: JSON.parse(readFileSync(resolve(path, file), 'utf8')) }))
}

/** Validated on read, so a malformed system file fails the build instead of a consumer. */
export function readSystems(root: string): { file: string; system: System }[] {
  return readJson(root, SYSTEM_DIR).map(({ file, json }) => ({ file, system: parseSystem(json) }))
}

export function readPalettes(root: string): { file: string; palette: Palette }[] {
  return readJson(root, PALETTE_DIR).map(({ file, json }) => ({
    file,
    palette: parsePalette(json),
  }))
}

export function readTheme(root: string): ThemeCatalogue {
  const systems = readSystems(root)
  const palettes = readPalettes(root)
  const exposed = new Set<string>(EXPOSED_AXES)

  const paletteByName = new Map(palettes.map(({ palette }) => [palette.name, palette]))

  /*
   * Every `--pm-*` any pairing emits, unioned over the *eager* pairings: each
   * system with the palette it declares. These are the same blocks as the eager
   * sheet the runtime installs at load.
   *
   * Those blocks cover the whole catalogue, not a sample of it. Every system
   * appears once, and every shipped palette is some system's default, so no
   * axis-driven or seed-driven property is missing from the union. A palette
   * with no gradient partner resolves its gradient roles to solids and still
   * declares them (a no-op, not a missing property). So this is a catalogue of
   * the *vocabulary*, not of whichever pairing was read first.
   */
  const eager = systems.map(({ system }) => {
    const palette = paletteByName.get(system.defaultPalette)
    if (!palette) {
      throw new Error(
        `registry: system ${system.name} declares defaultPalette "${system.defaultPalette}" and ` +
          `no such palette is in ${PALETTE_DIR} — the pairing it ships with cannot resolve`,
      )
    }
    return resolveTheme(composeTheme(system, palette))
  })

  // A palette's more-contrast partner is emitted with it, as every admission
  // emits it, so the union is read from the sheet an app installs.
  const catalogue = palettes.map(({ palette }) => palette)
  const css = eager
    .map((theme, index) => {
      const { system } = systems[index] as { system: System }
      const palette = paletteByName.get(theme.palette) as Palette
      return emitThemeCSS(theme, moreContrastOf(system, palette, catalogue))
    })
    .join('\n')
  const customProperties = [
    ...new Set([...css.matchAll(/(--pm-[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string)),
  ].sort()

  // The magnitudes come from the engine, not from the ladder constant, like
  // every other value here. Density scales the ladder and rounds it to an even
  // grid, so a copied ladder would publish the input to that arithmetic as if
  // it were the output. They do not come from an eager theme either. A system
  // may amend its own ladders (an `overrides.controlHeight` is that system's
  // decision, not the catalogue's), so reading whichever system sorts first
  // would publish its amendments as everyone's. The catalogue-level magnitudes
  // are the *unamended* derivation: the engine with no overrides. No axis
  // affects them.
  const [reference] = eager
  if (!reference) {
    throw new Error(`registry: no systems in ${SYSTEM_DIR}, so no theme resolves and none can`)
  }
  const density = deriveNonColorTokens(reference.axes).density.standard

  return {
    axes: AXIS_NAMES.map((name) => ({
      name,
      values: [...AXIS_VALUES[name]],
      exposed: exposed.has(name),
    })),

    colorRoles: {
      ...Object.fromEntries(
        Object.entries(COLOR_ROLE_GROUPS).map(([group, roles]) => [group, [...roles]]),
      ),
      gradient: [...GRADIENT_ROLES],
      // The chart family is a role family like any other. Series colour is
      // shared by the whole product, and charts are its first consumer, not its
      // owner. It is published here so an agent reading the registry can name a
      // slot without reading the theme engine.
      chart: [...CHART_ROLES],
    },

    scales: {
      space: SPACE_STEPS.map(String),
      text: [...TEXT_STEPS],
      display: [...DISPLAY_STEPS],
      radius: [...RADIUS_STEPS],
      shadow: [...SHADOW_STEPS],
      glow: [...GLOW_STEPS],
      icon: [...ICON_SIZES],
      duration: [...DURATION_ROLES],
      easing: [...EASING_ROLES],
      spring: [...SPRING_ROLES],
    },

    standardDensity: {
      space: Object.fromEntries(SPACE_STEPS.map((step) => [String(step), density.space[step]])),
      controlHeight: Object.fromEntries(
        (['sm', 'md', 'lg'] as const).map((size) => [size, density.controlHeight[size]]),
      ),
    },

    customProperties,

    systems: systems.map(({ file, system }, index) => {
      const spec = `${SYSTEM_DIR}/${file.replace(/\.json$/, '.md')}`
      // `eager` is built from `systems` in the same order, so the index is this
      // system's own pairing, already resolved.
      const pairing = eager[index] as ResolvedTheme
      return {
        name: system.name,
        axes: Object.fromEntries(
          AXIS_NAMES.map((axis) => [axis, String(system.axes[axis])]),
        ) as Record<string, string>,
        fonts: fontsFor(system.fonts),
        defaultPalette: system.defaultPalette,
        defaultMode: system.defaultMode,
        kind: system.kind,
        // A theme install is this file plus the palette it names. The installer
        // copies both paths and derives neither, because a front that derives a
        // path becomes a second source of truth.
        file: `${SYSTEM_DIR}/${file}`,
        spec: existsSync(resolve(root, spec)) ? spec : null,
        tokenValues: tokenValuesOf(pairing),
      }
    }),

    palettes: palettes.map(({ file, palette }) => ({
      name: palette.name,
      accentHue: palette.accentHue,
      // Spread conditionally instead of assigning `undefined`, so an absent seed
      // is an absent key in both the document and the schema check.
      ...(palette.gradientHue === undefined ? {} : { gradientHue: palette.gradientHue }),
      ...(palette.neutralHue === undefined ? {} : { neutralHue: palette.neutralHue }),
      neutralTint: palette.neutralTint,
      chromaBudget: palette.chromaBudget,
      ...(palette.moreContrast === undefined ? {} : { moreContrast: palette.moreContrast }),
      file: `${PALETTE_DIR}/${file}`,
    })),

    renamed: { systems: { ...RENAMED.systems }, palettes: { ...RENAMED.palettes } },

    prepaint: PREPAINT,
  }
}
