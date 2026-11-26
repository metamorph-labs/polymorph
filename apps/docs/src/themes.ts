import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  getPalette,
  getSystem,
  hasPairingCSS,
  hydrateTheme,
  installThemeCSS,
  moreContrastOf,
  pairId,
  parsePalette,
  parseSystem,
  resolveTheme,
  setPalette,
  setSystem,
  type InstalledCatalogue,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/theme'

import defaults from '../../../design/defaults.json'

/**
 * The docs site registers every system and palette as the workbench and Relay
 * do, by glob discovery over `design/systems/` and `design/palettes/`. Pairings
 * are data, so a new JSON file reaches the site with no code change.
 */
const SYSTEM_MODULES = import.meta.glob('../../../design/systems/*.json', {
  eager: true,
  import: 'default',
})

const PALETTE_MODULES = import.meta.glob('../../../design/palettes/*.json', {
  eager: true,
  import: 'default',
})

export const SYSTEMS: readonly System[] = Object.keys(SYSTEM_MODULES)
  .sort()
  .map((path) => parseSystem(SYSTEM_MODULES[path]))

export const PALETTES: readonly Palette[] = Object.keys(PALETTE_MODULES)
  .sort()
  .map((path) => parsePalette(PALETTE_MODULES[path]))

export const DEFAULT_SYSTEM =
  SYSTEMS.find((system) => system.name === defaults.system)?.name ?? (SYSTEMS[0]?.name as string)

export function findSystem(name: string): System {
  return SYSTEMS.find((system) => system.name === name) ?? SYSTEMS[0]!
}

function findPalette(name: string): Palette {
  return PALETTES.find((palette) => palette.name === name) ?? PALETTES[0]!
}

/** Every system with its own default palette: the blocks the stylesheet starts with. */
const EAGER: readonly ResolvedTheme[] = SYSTEMS.map((system) =>
  resolveTheme(composeTheme(system, findPalette(system.defaultPalette))),
)

const EAGER_IDS = new Set(EAGER.map((theme) => theme.name))

/**
 * A pairing's block, with the colours of its palette's more-contrast partner under the
 * more-contrast query when the palette names one. Every partner a palette names ships
 * (`packages/theme/src/laws.test.ts`).
 */
function pairingCSS(theme: ResolvedTheme): string {
  return emitThemeCSS(
    theme,
    moreContrastOf(findSystem(theme.system), findPalette(theme.palette), PALETTES),
  )
}

/** What hydration checks stored names against, and the mode each system opens in. */
const INSTALLED: InstalledCatalogue = {
  systems: Object.fromEntries(SYSTEMS.map((system) => [system.name, system.defaultPalette])),
  palettes: PALETTES.map((palette) => palette.name),
  modes: Object.fromEntries(SYSTEMS.map((system) => [system.name, system.defaultMode])),
}

export function installThemes(): void {
  installThemeCSS(EAGER.map(pairingCSS).join('\n'))
  // The installed names are the ones just emitted, so a stored system or
  // palette that no longer exists (after a rename, say) is rejected.
  hydrateTheme(DEFAULT_SYSTEM, INSTALLED)
  // A stored cross-pairing survives hydration because each name is valid on its
  // own. Only the default pairings were just emitted, so a reload into a
  // cross-pairing would have no matching CSS. The hydrated pair is therefore
  // ensured like any selection.
  const system = getSystem()
  const palette = getPalette()
  if (system !== null && palette !== null) ensurePairing(system, palette)
}

/**
 * Resolves and appends a cross-pairing the first time it is chosen. The eager
 * set is checked first because `hasPairingCSS` cannot see it: those blocks live
 * in the single `pm-themes` sheet, which carries no pair id.
 */
export function ensurePairing(systemName: string, paletteName: string): void {
  const id = pairId(systemName, paletteName)
  if (EAGER_IDS.has(id) || hasPairingCSS(id)) return

  const system = SYSTEMS.find((candidate) => candidate.name === systemName)
  const palette = PALETTES.find((candidate) => candidate.name === paletteName)
  if (!system || !palette) return

  appendThemeCSS(pairingCSS(resolveTheme(composeTheme(system, palette))), id)
}

/**
 * The palette the user picked since their last system change. This is the only
 * state the stickiness rule needs, kept beside the catalogue it reads.
 */
let stickyPalette: string | null = null

/**
 * Switching system moves the palette to that system's default, **unless** the
 * user has explicitly picked a palette since the last system change. In that
 * case the picked palette is kept. The choice is consumed here, so the next
 * switch uses the new system's default again.
 *
 * Returns the resulting palette, so a picker holding React state can update
 * without reading `<html>` back.
 */
export function selectSystem(name: string): string {
  const palette = stickyPalette ?? findSystem(name).defaultPalette
  stickyPalette = null

  // Before either attribute changes, so the document never has a pair that no block matches.
  ensurePairing(name, palette)
  setSystem(name)
  setPalette(palette)
  return palette
}

/** Records an explicit palette choice, which is kept across the next system change. */
export function selectPalette(currentSystem: string, name: string): void {
  stickyPalette = name

  ensurePairing(currentSystem, name)
  setPalette(name)
}
