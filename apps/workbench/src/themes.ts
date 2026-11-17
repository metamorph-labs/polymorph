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
  STORAGE_KEYS,
  type InstalledCatalogue,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/engine'

import defaults from '../../../design/defaults.json'
import { bootDraft, DRAFT_PAIR, DRAFT_PALETTE, DRAFT_SYSTEM, getDraftRuntime } from './draft-boot'

/**
 * The pairing registry: every system in `design/systems/` and every palette in
 * `design/palettes/`, found by glob rather than listed.
 *
 * The churn proof checks both parts (`pnpm proof`, see `docs/verification.md`). Because systems
 * are discovered, a tenant is only a JSON file. Adding one to `design/systems/` puts it in the
 * product, the emitted stylesheet and every law test with no code change. Adding a palette next
 * to it repaints every system that names it. The default system is in `design/defaults.json` for
 * the same reason: it is a design decision, and it must not need an edit in application code.
 * The default palette is not set here. Each system declares its own, so changing it is one word
 * in one system file.
 *
 * `parseSystem`/`parsePalette` validate the JSON at load, so a bad hand edit fails here rather
 * than inside the emitter. The lists are sorted by name so the order is the same on every
 * machine, because `import.meta.glob` does not guarantee one.
 *
 * `fonts.ts` loads the matching webfonts, because the library never bundles them. Fonts are the
 * only app change a new system can need. A new palette needs none, because fonts belong to the
 * system.
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

/** Falls back to the first system found, so a renamed default still renders. */
export const DEFAULT_SYSTEM =
  SYSTEMS.find((system) => system.name === defaults.system)?.name ?? (SYSTEMS[0]?.name as string)

/** Falls back to the first system found, so a renamed system does not throw. */
function findSystem(name: string): System {
  return SYSTEMS.find((system) => system.name === name) ?? SYSTEMS[0]!
}

function findPalette(name: string): Palette {
  return PALETTES.find((palette) => palette.name === name) ?? PALETTES[0]!
}

/**
 * The eager set: each system with its own `defaultPalette`, one block per system. Every palette
 * is valid on every system, so emitting the full cross-product up front would multiply the sheet
 * by the palette count for pairings nobody has selected.
 */
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

/**
 * The installed catalogue, which hydration uses to check stored names. Each system maps to its
 * fallback palette because the two names go stale separately. A stale system falls back
 * entirely. A stale palette falls back to its system's default.
 */
const INSTALLED: InstalledCatalogue = {
  systems: Object.fromEntries(SYSTEMS.map((system) => [system.name, system.defaultPalette])),
  palettes: PALETTES.map((palette) => palette.name),
}

/**
 * Installs the themes once, at module load, before React mounts. The sheet covers every system
 * in its default palette, so opening the product only swaps attributes.
 *
 * A persisted studio draft is re-derived and appended before hydration checks the stored names,
 * and it joins the installed catalogue for that check. So a designer who reloads while using
 * `pm-draft` keeps it. This is best-effort. If the engine refuses a stored draft, nothing is
 * installed, `pm-draft` stays out of the catalogue, and hydration treats the stored selection
 * like any stale system: it falls back entirely and clears the keys. `draft-ambient.test.ts`
 * asserts this order.
 */
export function installThemes(): void {
  installThemeCSS(EAGER.map(pairingCSS).join('\n'))

  const draft = bootDraft()
  const installed: InstalledCatalogue =
    draft === null
      ? INSTALLED
      : {
          systems: { ...INSTALLED.systems, [DRAFT_SYSTEM]: DRAFT_PALETTE },
          palettes: [...INSTALLED.palettes, DRAFT_PALETTE],
        }
  if (draft !== null) appendThemeCSS(draft.css, DRAFT_PAIR)

  // The catalogue lists only what was just emitted, so a stored system or palette that no longer
  // exists is discarded.
  hydrateTheme(DEFAULT_SYSTEM, installed)

  const system = getSystem()
  const palette = getPalette()

  /*
   * A pairing with only one draft half matches no theme block, so the document is unstyled.
   *
   * The draft's block is scoped by both reserved names, but hydration checks the two stored names
   * separately. With a draft installed, `pm-draft` next to a shipped palette passes both checks
   * and is applied. It matches no block, so every `--pm-*` resolves to nothing. Two tabs can
   * cause this: one switches to the draft, the other picks a palette, and each writes its own
   * key. The state persists, because the next load reads the same pair back.
   *
   * So a mixed pair is resolved in full in one direction. It moves to the draft while the
   * runtime slot holds one, and to the shipped defaults when it does not. The keys are cleared
   * before the selection so storage never holds half a pairing, even briefly.
   */
  if ((system === DRAFT_SYSTEM) !== (palette === DRAFT_PALETTE)) {
    if (draft !== null) {
      selectSystem(DRAFT_SYSTEM)
    } else {
      clearStoredPairing()
      selectSystem(DEFAULT_SYSTEM)
    }
    return
  }

  // A stored cross-pairing passes hydration because each name is valid. Only the default
  // pairings were emitted, so a reload into a cross-pairing would be unstyled. The hydrated pair
  // goes through `ensurePairing` like any selection.
  if (system !== null && palette !== null) ensurePairing(system, palette)
}

/** Removes both stored pairing keys. See the mixed-draft handling above. */
function clearStoredPairing(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.system)
    localStorage.removeItem(STORAGE_KEYS.palette)
  } catch {
    // Private-mode Safari throws on access. Failing to clear a pairing is not an error.
  }
}

/**
 * Resolves a cross-pairing and appends its block the first time it is chosen: one derive and one
 * style append, cached by pair id.
 *
 * The eager set is checked first because `hasPairingCSS` cannot see it. Those blocks are inside
 * the single `pm-themes` sheet, which has no pair id, so `hasPairingCSS` would report them
 * missing and they would be appended again. The app layer tracks its own catalogue because the
 * runtime intentionally has none.
 */
export function ensurePairing(systemName: string, paletteName: string): void {
  // The draft's block has its own lifecycle. Boot appends it and the studio replaces it on each
  // revision. This function has nothing to derive it from.
  if (systemName === DRAFT_SYSTEM || paletteName === DRAFT_PALETTE) return

  const id = pairId(systemName, paletteName)
  if (EAGER_IDS.has(id) || hasPairingCSS(id)) return

  const system = SYSTEMS.find((candidate) => candidate.name === systemName)
  const palette = PALETTES.find((candidate) => candidate.name === paletteName)
  if (!system || !palette) return

  appendThemeCSS(pairingCSS(resolveTheme(composeTheme(system, palette))), id)
}

/**
 * The resolved pairing, for pages that inspect it rather than apply it. The token gallery reads
 * ramps, seeds and derived values from the object the emitter built the CSS from. Results are
 * cached by pair id. The gallery re-reads on every attribute change, and re-deriving a theme on
 * each render would run the colour pipeline in a render path.
 */
const RESOLVED = new Map<string, ResolvedTheme>(EAGER.map((theme) => [theme.name, theme]))

export function findPairing(systemName: string, paletteName: string): ResolvedTheme {
  const id = pairId(systemName, paletteName)

  // The draft's resolution is in its runtime slot, not this cache. The studio replaces it on
  // every valid edit, so a cache entry here would go stale and the token gallery would show old
  // values.
  if (id === DRAFT_PAIR) {
    const draft = getDraftRuntime()
    if (draft !== null) return draft.resolved
  }

  const cached = RESOLVED.get(id)
  if (cached) return cached

  const system = SYSTEMS.find((candidate) => candidate.name === systemName)
  const palette = PALETTES.find((candidate) => candidate.name === paletteName)
  if (!system || !palette)
    return EAGER.find((theme) => theme.system === DEFAULT_SYSTEM) ?? EAGER[0]!

  const resolved = resolveTheme(composeTheme(system, palette))
  RESOLVED.set(id, resolved)
  return resolved
}

/**
 * The palette the user picked since their last system change.
 *
 * This is the whole stickiness rule. It is here rather than in a picker because the workbench has
 * two pickers, the harness toolbar and Relay's settings screen, and two copies of the rule could
 * disagree. It lasts for the session only. A reload starts from storage.
 */
let stickyPalette: string | null = null

/**
 * Switching system moves the palette to that system's default, unless the user has picked a
 * palette since the last system change. In that case the picked palette carries over. The choice
 * is consumed here, so it is sticky only until the next explicit system change. After that, the
 * new system's default applies again.
 *
 * Returns the chosen palette, so a picker that holds its own state can follow without reading
 * `<html>` back.
 */
export function selectSystem(name: string): string {
  // Switching to the draft does not count as a system change. The sticky palette is not
  // consumed, so a palette picked before switching to the draft still applies after leaving it.
  // With no draft installed the name is stale and falls back like any renamed system.
  if (name === DRAFT_SYSTEM) {
    if (getDraftRuntime() === null) return selectSystem(DEFAULT_SYSTEM)
    setSystem(DRAFT_SYSTEM)
    setPalette(DRAFT_PALETTE)
    return DRAFT_PALETTE
  }

  const palette = stickyPalette ?? findSystem(name).defaultPalette
  stickyPalette = null

  // Runs before either attribute changes, so the document never applies a pair with no block.
  ensurePairing(name, palette)
  setSystem(name)
  setPalette(palette)
  return palette
}

/** Records an explicit palette choice, which carries over the next system change. */
export function selectPalette(currentSystem: string, name: string): void {
  // The draft's palette belongs to the draft. While the draft is active no cross-pairing block
  // can exist, so there is nothing to switch to. The pickers disable the control, and this guard
  // enforces the rule for any other caller.
  if (currentSystem === DRAFT_SYSTEM || name === DRAFT_PALETTE) return

  stickyPalette = name

  ensurePairing(currentSystem, name)
  setPalette(name)
}
