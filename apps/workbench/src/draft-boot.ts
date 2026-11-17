import {
  composeTheme,
  emitThemeCSS,
  FONT_ROLES,
  pairId,
  parsePalette,
  parseSystem,
  resolveTheme,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/engine'

/**
 * The draft's app-level runtime: storage, the boot install, and the live slot the rest of the
 * workbench reads.
 *
 * This module is on the boot path, because `themes.ts` calls it before hydration. So it holds
 * only what boot needs: parse, resolve and emit. The audits, the law messages and the rest of the
 * studio logic are in `studio/draft.ts`, which loads with the studio chunk. Imports go one way
 * only. `themes.ts` and the studio both import this file, and this file imports only the engine.
 * `studio/draft.ts` already imports `themes.ts`, so putting the slot there would create an import
 * cycle at boot.
 */

/**
 * The reserved pairing a draft is applied under. It is defined here because boot needs the names
 * before the studio chunk loads. A draft needs some pair name because the emitted block is scoped
 * by both names. It cannot use the name typed into the save field, because that name may not
 * exist yet, may collide with a shipped block, and changes as the user types. So the document
 * uses a name no file may have. `pm-` is the engine's reserved namespace.
 */
export const DRAFT_SYSTEM = 'pm-draft'
export const DRAFT_PALETTE = 'pm-draft'
export const DRAFT_PAIR = pairId(DRAFT_SYSTEM, DRAFT_PALETTE)

/**
 * One storage key holding one document. It uses the same `{ system, palette }` interchange shape
 * that the copy button emits and the paste box accepts, so localStorage holds exactly what a
 * designer could export. Every reader of the shape tolerates extra keys. The save-field names are
 * stored as `names`.
 */
export const DRAFT_STORAGE_KEY = 'pm-studio-draft'

export interface DraftRuntime {
  /** The parsed system and palette under their own names. Fonts and restore read these. */
  system: System
  palette: Palette
  /** The theme resolved under the reserved names, which `findPairing` returns. */
  resolved: ResolvedTheme
  css: string
}

let runtime: DraftRuntime | null = null

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** For `useSyncExternalStore`. The toolbar shows a draft entry while a draft exists. */
export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDraftRuntime(): DraftRuntime | null {
  return runtime
}

/**
 * The studio's store passes every re-derivation here, so the toolbar entry and `findPairing` stay
 * current without the boot bundle importing the studio. `null` discards the draft: the entry
 * disappears and `findPairing` falls back.
 */
export function setDraftRuntime(next: DraftRuntime | null): void {
  runtime = next
  notify()
}

export function readStoredDraft(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(DRAFT_STORAGE_KEY)
  } catch {
    // Private-mode Safari throws on access. Failing to read a draft is not an error.
    return null
  }
}

export function writeStoredDraft(text: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (text === null) localStorage.removeItem(DRAFT_STORAGE_KEY)
    else localStorage.setItem(DRAFT_STORAGE_KEY, text)
  } catch {
    /* see `readStoredDraft` */
  }
}

/** The draft's system and palette renamed to the reserved names, for preview. */
export function previewNames(
  system: System,
  palette: Palette,
): { system: System; palette: Palette } {
  return {
    system: { ...system, name: DRAFT_SYSTEM, defaultPalette: DRAFT_PALETTE },
    palette: { ...palette, name: DRAFT_PALETTE },
  }
}

/**
 * Boot install, best-effort. It parses the stored document with the same schemas that shipped
 * files must pass, resolves it through the real engine and emits its block. On any refusal it
 * installs nothing. What persists is the draft document. The CSS is derived from it. What happens
 * to the document depends on which check refused it:
 *
 *  - **The schema refused it.** The document has an older shape that no longer validates. The
 *    studio's store moves it aside unchanged (`pm-studio-draft-refused`) and offers it back as a
 *    file, and the studio opens with a fresh draft. It is never overwritten without notice,
 *    because the refusal comes from a schema change, not from the designer discarding it.
 *  - **A law refused it**, for example a contrast floor the nudge budget could not reach. The
 *    document restores into the studio exactly as stored, but gets no pairing entry. A toolbar
 *    entry that applies no styles would be worse than none, and the law panel shows the failure
 *    so the designer can fix it.
 *
 * In both cases this returns `null`, which discards the draft. The slot is released and the
 * subscribers are notified, so a second boot cannot leave the first boot's runtime in place.
 * Hydration then treats a stored `pm-draft` selection like any stale name: it falls back
 * entirely and clears the keys.
 */
export function bootDraft(): DraftRuntime | null {
  const text = readStoredDraft()
  if (text === null) {
    setDraftRuntime(null)
    return null
  }

  try {
    const document = JSON.parse(text) as { system?: unknown; palette?: unknown }
    const system = parseSystem(document.system)
    const palette = parsePalette(document.palette)
    const preview = previewNames(system, palette)
    const resolved = resolveTheme(composeTheme(preview.system, preview.palette))
    runtime = { system, palette, resolved, css: emitThemeCSS(resolved) }
    notify()
    return runtime
  } catch {
    setDraftRuntime(null)
    return null
  }
}

/** The draft's font families, for the per-system loader. `null` when there is no draft. */
export function draftFontFamilies(): readonly string[] | null {
  if (runtime === null) return null
  const { fonts } = runtime.system
  return FONT_ROLES.map((role) => fonts[role].family)
}
