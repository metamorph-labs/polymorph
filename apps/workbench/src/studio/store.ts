import { getSystem, parsePalette, parseSystem } from '@polymorph/react'
import { useSyncExternalStore } from 'react'

import { getDraftRuntime, readStoredDraft, setDraftRuntime, writeStoredDraft } from '../draft-boot'
import { DEFAULT_SYSTEM, selectSystem } from '../themes'
import {
  deriveDraft,
  DRAFT_SYSTEM,
  installDraftCSS,
  removeDraftCSS,
  startingDraft,
  type Derivation,
  type Draft,
} from './draft'

/**
 * The studio's store: the draft, its derivation and its save names. It is held outside React so
 * the work survives a reload and the rest of the workbench can apply it.
 *
 * Three rules apply:
 *
 *  - **What persists is the document, saved at its last schema-valid state.** The in-memory draft
 *    may be schema-invalid, for example while the law panel reports a non-monotone ladder. But
 *    what localStorage holds must parse on the next boot, so an invalid edit updates the page and
 *    skips the snapshot. The designer loses at most the invalid edits at the end of a session,
 *    never the draft.
 *  - **The runtime slot follows the last resolvable derivation.** When the engine refuses an
 *    edit, the previous block stays on the page and the previous resolution stays in the slot.
 *    So the whole workbench, like the preview, keeps showing the last resolved theme while the
 *    law panel explains the failure.
 *  - **The store is the only writer.** Boot reads storage once before React. Every later change
 *    goes through `update`/`replace`/`discard` here, so the slot, the block, the snapshot and the
 *    page stay consistent.
 */

export interface StudioState {
  draft: Draft
  /** The file names a save writes to, not the names on screen. */
  systemName: string
  paletteName: string
  derivation: Derivation
}

/** The persisted shape: the interchange document plus the save-field names. */
interface StoredDraft {
  system?: unknown
  palette?: unknown
  names?: { system?: unknown; palette?: unknown }
}

/**
 * The storage key for a stored document that the current schema refuses.
 *
 * It is a second key rather than a flag on the first, because the two keys have opposite
 * lifecycles. The main key is rewritten on every lawful edit, and the refused document must
 * survive those writes. Only `park` writes this key, and only the designer clears it.
 */
export const REFUSED_STORAGE_KEY = 'pm-studio-draft-refused'

function readParked(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(REFUSED_STORAGE_KEY)
  } catch {
    // Private-mode Safari throws on access; see `readStoredDraft`.
    return null
  }
}

function writeParked(text: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (text === null) localStorage.removeItem(REFUSED_STORAGE_KEY)
    else localStorage.setItem(REFUSED_STORAGE_KEY, text)
  } catch {
    /* see `readStoredDraft` */
  }
}

/**
 * The refused document, verbatim, or `null` when there is none. The studio's notice card offers it
 * for download.
 */
export function refusedDraft(): string | null {
  return readParked()
}

/** Called when the designer dismisses the notice. Deletes the set-aside document. */
export function discardRefusedDraft(): void {
  writeParked(null)
}

/**
 * Moves a refused document aside and clears the main key.
 *
 * This never blocks the studio and never overwrites the document. A refusal is not a discard,
 * because the designer did nothing destructive. But the studio cannot show a document it cannot
 * parse, and leaving it in the main key would let the next lawful edit overwrite it without
 * notice. So the document moves to a separate key, the studio opens with a fresh draft, and the
 * notice card offers the document back as a file.
 */
function park(text: string): void {
  writeParked(text)
  writeStoredDraft(null)
}

function restore(): StudioState | null {
  const text = readStoredDraft()
  if (text === null) return null

  let draft: Draft
  let names: StoredDraft['names']
  try {
    const stored = JSON.parse(text) as StoredDraft
    draft = { system: parseSystem(stored.system), palette: parsePalette(stored.palette) }
    names = stored.names
  } catch {
    // A document this schema refuses, including one written by an older schema, starts the studio
    // with a fresh draft instead of crashing it. It is set aside first, because otherwise the
    // first keystroke would overwrite it.
    park(text)
    return null
  }

  // This is outside the `try` on purpose. A draft the laws refuse still restores, and
  // `deriveDraft` withholds only the theme. Only a schema refusal sets a document aside.
  return {
    draft,
    systemName: typeof names?.system === 'string' ? names.system : draft.system.name,
    paletteName: typeof names?.palette === 'string' ? names.palette : draft.palette.name,
    derivation: deriveDraft(draft),
  }
}

function fresh(): StudioState {
  const draft = startingDraft(DEFAULT_SYSTEM)
  return {
    draft,
    systemName: draft.system.name,
    paletteName: draft.palette.name,
    derivation: deriveDraft(draft),
  }
}

let state: StudioState = restore() ?? fresh()

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Saves the document, but only when it would parse on the next load. */
function persist(next: StudioState): void {
  try {
    parseSystem(next.draft.system)
    parsePalette(next.draft.palette)
  } catch {
    return
  }
  const document = {
    system: next.draft.system,
    palette: next.draft.palette,
    names: { system: next.systemName, palette: next.paletteName },
  }
  writeStoredDraft(`${JSON.stringify(document, null, 2)}\n`)
}

/** Installs the block and fills the slot, but only when the engine resolved a theme. */
function install(next: StudioState): void {
  const { theme, css } = next.derivation
  if (theme === null || css === null) return
  installDraftCSS(css)
  setDraftRuntime({
    system: next.draft.system,
    palette: next.draft.palette,
    resolved: theme,
    css,
  })
}

/**
 * The preview's first paint. A fresh studio (no boot draft and no edit yet) has panes scoped to
 * `pm-draft` and no block that matches them. This installs the starting derivation without
 * persisting it or filling the runtime slot, so opening the studio does not create a toolbar
 * draft. The first real edit switches to the full path.
 */
export function ensurePreviewInstalled(): void {
  if (getDraftRuntime() !== null) return
  const { theme, css } = state.derivation
  if (theme === null || css === null) return
  installDraftCSS(css)
}

/** Every edit goes through here: derive, persist, install, notify React. */
export function updateDraft(recipe: (draft: Draft) => Draft): void {
  const draft = recipe(state.draft)
  state = { ...state, draft, derivation: deriveDraft(draft) }
  persist(state)
  install(state)
  notify()
}

/** Replaces the whole draft. Used by the paste box and by the detail-page link. */
export function replaceDraft(draft: Draft): void {
  state = {
    ...state,
    draft,
    systemName: draft.system.name,
    paletteName: draft.palette.name,
    derivation: deriveDraft(draft),
  }
  persist(state)
  install(state)
  notify()
}

export function setSystemName(name: string): void {
  state = { ...state, systemName: name }
  persist(state)
  notify()
}

export function setPaletteName(name: string): void {
  state = { ...state, paletteName: name }
  persist(state)
  notify()
}

/**
 * Discards the draft: removes the snapshot, the slot and the blocks. If the document is using the
 * draft, it switches away first, otherwise it would apply a pair no block matches. The studio
 * returns to the shipped default, where a fresh studio starts.
 */
export function discardDraft(): void {
  writeStoredDraft(null)
  if (getSystem() === DRAFT_SYSTEM) selectSystem(DEFAULT_SYSTEM)
  setDraftRuntime(null)
  removeDraftCSS()
  state = fresh()
  // The preview panes always use the reserved pairing. If the discard installed nothing, they
  // would inherit the page pairing until the next edit, so the controls would show the default
  // while the panes still showed another system, such as terminal. This is the same first paint a
  // fresh visit gets, and it does nothing if a slot still exists.
  ensurePreviewInstalled()
  notify()
}

/**
 * Whether an edit was made this session or a snapshot exists from an earlier one. This is what
 * "there is a draft" means to the toolbar and the discard button.
 */
export function hasDraft(): boolean {
  return getDraftRuntime() !== null || readStoredDraft() !== null
}

/**
 * The current state, for readers outside React: the boot tests and `useStudio` below. It only
 * reads, so the store remains the only writer.
 */
export function studioState(): StudioState {
  return state
}

export function useStudio(): StudioState {
  return useSyncExternalStore(subscribe, studioState, studioState)
}
