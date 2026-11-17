import type { Density, MotionTemperament } from './axes'
import { cssVarName, DATA_ATTRS, MORE_CONTRAST_QUERY } from './css-vars'

export { cssVarName, DATA_ATTRS, MORE_CONTRAST_QUERY }
import type { Mode, ModePreference } from './theme'

/**
 * The only module in `@polymorph/theme` that touches the DOM (asserted by
 * `runtime.test.ts`). It sets attributes on `<html>` and puts `<style>` in
 * `<head>`, so switching a pairing is a CSS scope change, not a React render.
 */

export const STORAGE_KEYS = {
  system: 'pm-system',
  palette: 'pm-palette',
  mode: 'pm-mode',
  density: 'pm-density',
  motion: 'pm-motion',
} as const

/**
 * The legacy single-name key from the one-name format. Not in `STORAGE_KEYS`
 * because nothing writes it. Hydration reads it once, migrates the choice and
 * removes it.
 */
const LEGACY_THEME_KEY = 'pm-theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function root(): HTMLElement | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement
}

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    // Private-mode Safari throws on access. A theme preference is not worth an
    // exception.
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* see `read` */
  }
}

function apply(attr: string, value: string | null): void {
  const element = root()
  if (!element) return
  if (value === null) element.removeAttribute(attr)
  else element.setAttribute(attr, value)
}

const STYLE_ID = 'pm-themes'
const PAIRING_ATTR = 'data-pm-pairing'

/**
 * Puts the emitted sheet in `<head>` as one `<style>`, replacing any previous
 * one. An app never imports a library stylesheet, which lets `no-app-css` have
 * no exceptions.
 *
 * This is the **eager** sheet: every system with its default palette, at
 * module load. `appendThemeCSS` adds cross-pairings.
 */
export function installThemeCSS(css: string): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  if (!existing) document.head.prepend(style)
}

function pairingStyle(pairId: string): HTMLStyleElement | null {
  const found = document.querySelector(`style[${PAIRING_ATTR}="${pairId}"]`)
  return found instanceof HTMLStyleElement ? found : null
}

/** Whether this pairing's block is already on the page. */
export function hasPairingCSS(pairId: string): boolean {
  if (typeof document === 'undefined') return false
  return pairingStyle(pairId) !== null
}

/**
 * Appends one pairing's block, once per pair id (lazy pairing).
 *
 * Emitting every system × palette block eagerly would multiply the sheet by the
 * palette count. So a cross-pairing is installed when first chosen: the app's
 * `ensurePairing(system, palette)` derives the block and passes it here. **The
 * caller resolves and emits.** This module has no catalogue; it manages the DOM
 * and installs each block once.
 *
 * To skip the derivation too, call `hasPairingCSS` first. An already installed
 * id is a no-op either way.
 *
 * The block goes directly after the eager sheet, not at the end of `<head>`.
 * The eager sheet is prepended so application CSS overrides it. Appended after
 * application styles, a pairing would override them instead, depending on when
 * it was chosen.
 */
export function appendThemeCSS(css: string, pairId: string): void {
  if (typeof document === 'undefined') return
  if (pairingStyle(pairId) !== null) return

  const style = document.createElement('style')
  style.setAttribute(PAIRING_ATTR, pairId)
  style.textContent = css

  const base = document.getElementById(STYLE_ID)
  if (base?.parentNode) base.parentNode.insertBefore(style, base.nextSibling)
  else document.head.prepend(style)
}

/**
 * Applies a system. The pairing's CSS must already be installed: an app with
 * cross-pairings calls `ensurePairing` first, or no block matches.
 */
export function setSystem(name: string): void {
  apply(DATA_ATTRS.system, name)
  write(STORAGE_KEYS.system, name)
}

export function setPalette(name: string): void {
  apply(DATA_ATTRS.palette, name)
  write(STORAGE_KEYS.palette, name)
}

export function getSystem(): string | null {
  return root()?.getAttribute(DATA_ATTRS.system) ?? null
}

export function getPalette(): string | null {
  return root()?.getAttribute(DATA_ATTRS.palette) ?? null
}

let stopWatchingSystem: (() => void) | undefined

/**
 * The preference the last `setMode` applied to this document, or `null` before
 * any. It is held here as well as stored, because storage can refuse the write
 * and another tab can overwrite it, and neither changes what this document
 * wears.
 */
let applied: ModePreference | null = null

const modeListeners = new Set<() => void>()

/** Tells each `watchMode` listener that the preference or the applied mode may have changed. */
function announceMode(): void {
  for (const listener of [...modeListeners]) listener()
}

function prefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(DARK_QUERY).matches
}

/**
 * `system` is a preference, not a mode: stored as `system`, applied as the OS's
 * current mode, and reapplied when that changes. (Here "system" is the OS
 * setting, not a design system.) Each call, and each change of the OS's mode
 * while `system` is applied, calls the `watchMode` listeners.
 */
export function setMode(preference: ModePreference): void {
  applied = preference
  write(STORAGE_KEYS.mode, preference)
  stopWatchingSystem?.()
  stopWatchingSystem = undefined

  if (preference !== 'system') {
    apply(DATA_ATTRS.mode, preference)
    announceMode()
    return
  }

  if (typeof matchMedia === 'undefined') {
    apply(DATA_ATTRS.mode, 'light')
    announceMode()
    return
  }

  const query = matchMedia(DARK_QUERY)
  const sync = () => apply(DATA_ATTRS.mode, query.matches ? 'dark' : 'light')
  const follow = () => {
    sync()
    announceMode()
  }
  sync()
  query.addEventListener('change', follow)
  stopWatchingSystem = () => query.removeEventListener('change', follow)
  announceMode()
}

/**
 * The preference this document wears, which may be `system`: the one the last
 * `setMode` applied, or the stored one before any call. The pre-paint script
 * applies the stored one, so the two agree until a `setMode`.
 */
export function getModePreference(): ModePreference {
  if (applied !== null) return applied
  const stored = read(STORAGE_KEYS.mode)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/** The mode currently applied. Unlike the preference, it is never `system`. */
export function getMode(): Mode {
  return root()?.getAttribute(DATA_ATTRS.mode) === 'dark' ? 'dark' : 'light'
}

/** The document's mode preference and the mode it resolves to, read together. */
export interface ModeReading {
  /** `light`, `dark` or `system`, as `getModePreference` gives it. */
  readonly preference: ModePreference
  /** The mode applied, `light` or `dark`, as `getMode` gives it. */
  readonly mode: Mode
}

/**
 * The reading where there is no document: nothing is stored, so the
 * preference is `system`, and no mode is applied, so the mode is `light`. A
 * server render reads it, and a foundation returns it while its framework
 * hydrates the server's markup, so the first render in the browser is the
 * server's.
 */
export const SERVER_MODE: ModeReading = { preference: 'system', mode: 'light' }

let lastReading: ModeReading = SERVER_MODE

/**
 * The preference and the applied mode now. The same object is returned until
 * one of the two changes, so a framework's store can compare readings by
 * identity.
 */
export function readMode(): ModeReading {
  const preference = getModePreference()
  const mode = getMode()
  if (lastReading.preference !== preference || lastReading.mode !== mode) {
    lastReading = { preference, mode }
  }
  return lastReading
}

/**
 * Calls `listener` after each `setMode`, and each time the OS's mode changes
 * while `system` is applied, until the function it returns is called. The
 * listener takes a new `readMode`. It hears what this runtime applies: an
 * attribute another script writes on `<html>`, and a choice another tab
 * stores, are not changes to this document's preference.
 */
export function watchMode(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  modeListeners.add(listener)
  return () => {
    modeListeners.delete(listener)
  }
}

/**
 * Overrides the theme axis's density. `null` restores the default. Density
 * inside the page is a `<DensityScope>` (`@polymorph/react-ui`).
 */
export function setDensityDefault(density: Density | null): void {
  apply(DATA_ATTRS.density, density)
  write(STORAGE_KEYS.density, density)
}

export function setMotionTemperament(temperament: MotionTemperament | null): void {
  apply(DATA_ATTRS.motion, temperament)
  write(STORAGE_KEYS.motion, temperament)
}

/**
 * What is installed on the page, the only thing that can validate a stored
 * name. `systems` maps each system to its default palette, which the fallback,
 * the migration and the stale-palette rule all need.
 */
export interface InstalledCatalogue {
  systems: Readonly<Record<string, string>>
  palettes: readonly string[]
}

function defaultPaletteOf(system: string | null, installed?: InstalledCatalogue): string | null {
  if (system === null || installed === undefined) return null
  return installed.systems[system] ?? null
}

/**
 * The legacy key `pm-theme` holds one name, an old preset. It becomes the
 * system, with that system's default palette, written once, and the legacy
 * key is removed so this runs only once.
 *
 * Only the catalogue knows a system's palette. Without it nothing is migrated
 * **and the legacy key is kept** for a later hydration.
 */
function migrateLegacyTheme(installed?: InstalledCatalogue): void {
  if (installed === undefined) return
  if (read(STORAGE_KEYS.system) !== null) return

  const legacy = read(LEGACY_THEME_KEY)
  if (legacy === null) return

  const palette = installed.systems[legacy]
  if (palette !== undefined) {
    write(STORAGE_KEYS.system, legacy)
    write(STORAGE_KEYS.palette, palette)
  }
  // An unknown legacy name is stale, not migrated. The rules below apply the
  // fallback and write nothing back.
  write(LEGACY_THEME_KEY, null)
}

/**
 * Re-applies the stored preferences and re-attaches the `prefers-color-scheme`
 * listener, which the pre-paint script cannot. Call once on mount; repeat
 * calls are safe.
 *
 * **Staleness, for both keys.** A stored name not in `installed` was renamed or
 * removed, and the document points at CSS that does not exist. The pre-paint
 * script has no installed set to check against and no room in its 500-byte
 * budget for one, so hydration is the first point to validate.
 * Without `installed`, nothing is checked or migrated and no default palette
 * can be supplied.
 *
 *  - a stale **system** falls back to `fallbackSystem` with its default
 *    palette, and the stored palette is cleared too, because it was chosen for
 *    the missing system;
 *  - a stale **palette** falls back to the current system's default.
 *
 * The stale key is cleared, or the next pre-paint would reapply it. Fallbacks
 * are never written back: only `setSystem` or `setPalette` stores a
 * preference, so later default changes still reach this user.
 */
export function hydrateTheme(fallbackSystem?: string, installed?: InstalledCatalogue): void {
  migrateLegacyTheme(installed)

  const storedSystem = read(STORAGE_KEYS.system)
  const storedPalette = read(STORAGE_KEYS.palette)

  const systemStale =
    storedSystem !== null && installed !== undefined && !(storedSystem in installed.systems)
  const paletteStale =
    storedPalette !== null && installed !== undefined && !installed.palettes.includes(storedPalette)

  // A stale system also clears its palette, chosen for a pairing that no longer
  // exists. A palette key left alone would make the next load differ from this.
  if (systemStale) {
    write(STORAGE_KEYS.system, null)
    write(STORAGE_KEYS.palette, null)
  } else if (paletteStale) {
    write(STORAGE_KEYS.palette, null)
  }

  const system = (systemStale ? null : storedSystem) ?? fallbackSystem ?? null
  const keptPalette = systemStale || paletteStale ? null : storedPalette
  const palette = keptPalette ?? defaultPaletteOf(system, installed)

  // A stale name with no replacement removes the attribute. Other paths only
  // apply what they have.
  if (system !== null || systemStale) apply(DATA_ATTRS.system, system)
  if (palette !== null || systemStale || paletteStale) apply(DATA_ATTRS.palette, palette)

  const density = read(STORAGE_KEYS.density)
  if (density) apply(DATA_ATTRS.density, density)

  const motion = read(STORAGE_KEYS.motion)
  if (motion) apply(DATA_ATTRS.motion, motion)

  setMode(getModePreference())
}

/**
 * For tests: releases the `prefers-color-scheme` subscription and forgets the
 * applied preference, so the next read is the stored one.
 */
export function teardownTheme(): void {
  stopWatchingSystem?.()
  stopWatchingSystem = undefined
  applied = null
}

/**
 * Inline this in `<head>`, before any stylesheet, to apply the stored pairing
 * and mode before first paint. Built from the constants above, so keys and
 * attributes match.
 *
 * Under 500 bytes (asserted in tests), a one-liner that never throws, because
 * it blocks parsing. It applies `pm-system`/`pm-palette` if present and **does
 * no migration**: a legacy visitor sees the fallback until hydration migrates
 * them, which keeps the script simple.
 */
export const PREPAINT_SCRIPT =
  `(function(){try{var d=document.documentElement,s=localStorage,a=function(k,v){d.setAttribute(k,v)},` +
  `t=s.getItem('${STORAGE_KEYS.system}'),p=s.getItem('${STORAGE_KEYS.palette}'),` +
  `m=s.getItem('${STORAGE_KEYS.mode}')||'system',` +
  `y=s.getItem('${STORAGE_KEYS.density}'),o=s.getItem('${STORAGE_KEYS.motion}');` +
  `if(t)a('${DATA_ATTRS.system}',t);if(p)a('${DATA_ATTRS.palette}',p);` +
  `a('${DATA_ATTRS.mode}',m==='system'?(matchMedia('${DARK_QUERY}').matches?'dark':'light'):m);` +
  `if(y)a('${DATA_ATTRS.density}',y);` +
  `if(o)a('${DATA_ATTRS.motion}',o)}catch(e){}})()`

/** True when the OS prefers dark. For toolbars showing "system (dark)". */
export function systemPrefersDark(): boolean {
  return prefersDark()
}
