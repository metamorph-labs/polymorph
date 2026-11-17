import { validate } from '@polymorph/registry/shape'
import { SCREEN_SHAPE, SPEC_ID, type ScreenSpec } from '@polymorph/spec/schema'
import { useSyncExternalStore } from 'react'

import { commit, elementAt, redo, undo, untag, type Address, type History } from './model'

/**
 * The composer's store: the document, its history and the selection. It is held outside React and
 * persisted like the studio's draft, with the same rules. The store is the only writer. The
 * snapshot is the document in the format's own JSON, so localStorage holds exactly what Save would
 * write. A reload resumes the composition where it was.
 */

export const COMPOSER_STORAGE_KEY = 'pm-composer-draft'

export function startingSpec(): ScreenSpec {
  return {
    spec: SPEC_ID,
    name: 'Untitled',
    purpose: 'Composed in the workbench.',
    inputs: [],
    root: {
      component: 'Stack',
      props: { gap: 5, p: 7 },
      children: [
        { component: 'Heading', children: ['A new screen'] },
        {
          component: 'Text',
          props: { tone: 'secondary' },
          children: ['Select a layer on the left, or insert a member to begin.'],
        },
      ],
    },
  }
}

export interface ComposerState {
  history: History
  selection: Address
}

/**
 * Checks whether a value is a screen document.
 *
 * The tag alone is not enough, and trusting it would break the page permanently. A document with
 * `"spec": "polymorph-screen/1"` and no `root` would be accepted by `restore`, persisted by
 * `replaceComposition` and passed to `renderSpec`, which reads `spec.root`. It would be read back
 * on every reload, so the crash would persist after the session that caused it. The shape check
 * is the same one `validateSpec` runs first and the one the renderer relies on. It is safe in the
 * browser because `@polymorph/spec/schema` and `@polymorph/registry/shape` are subpaths the render
 * path already loads into the page.
 *
 * It checks shape only, on purpose. Whether every prop exists on every member is for the law
 * panel, and a document may be invalid for a long time while it is edited. Whether there is a
 * tree to draw is checked here, because no editing state lacks one.
 */
export function isScreenDocument(value: unknown): value is ScreenSpec {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { spec?: unknown }).spec === SPEC_ID &&
    validate(SCREEN_SHAPE, value).length === 0
  )
}

function restore(): ScreenSpec | null {
  try {
    const text = localStorage.getItem(COMPOSER_STORAGE_KEY)
    if (text === null) return null
    const parsed: unknown = JSON.parse(text)
    return isScreenDocument(parsed) ? parsed : null
  } catch {
    return null
  }
}

function persist(spec: ScreenSpec): void {
  try {
    localStorage.setItem(COMPOSER_STORAGE_KEY, `${JSON.stringify(spec, null, 2)}\n`)
  } catch {
    /* Private-mode storage. The session still works but is not saved. */
  }
}

let state: ComposerState = {
  history: { past: [], present: restore() ?? startingSpec(), future: [] },
  selection: '$',
}

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

/** Keeps the selection valid. An address missing from the new tree resets to root. */
function settled(selection: Address, spec: ScreenSpec): Address {
  return elementAt(spec, selection) === null ? '$' : selection
}

export function currentSpec(): ScreenSpec {
  return state.history.present
}

/**
 * Applies one edit.
 *
 * `tag` marks a continuous edit, identified by the address and prop being typed into.
 * Consecutive applies with the same tag merge into one history entry (see `commit`). Structural
 * operations pass no tag, which ends a run of keystrokes. Moving the selection also ends it.
 */
export function apply(next: ScreenSpec, select?: Address, tag?: string): void {
  if (next === state.history.present && select === undefined) return
  const history = commit(state.history, next, tag)
  state = { history, selection: settled(select ?? state.selection, history.present) }
  persist(history.present)
  notify()
}

export function select(address: Address): void {
  if (address === state.selection) return
  // A new selection ends any typing run in the old one, so the next keystroke starts a new
  // history entry.
  state = { history: untag(state.history), selection: settled(address, state.history.present) }
  notify()
}

export function undoComposition(): void {
  const history = undo(state.history)
  if (history === state.history) return
  state = { history, selection: settled(state.selection, history.present) }
  persist(history.present)
  notify()
}

export function redoComposition(): void {
  const history = redo(state.history)
  if (history === state.history) return
  state = { history, selection: settled(state.selection, history.present) }
  persist(history.present)
  notify()
}

/**
 * Loads a document or starts over, with fresh history and the root selected.
 *
 * Refuses a document that is not a screen, before persisting it. A malformed document in storage
 * would crash the page again after every reload.
 */
export function replaceComposition(spec: ScreenSpec): boolean {
  if (!isScreenDocument(spec)) return false
  state = { history: { past: [], present: spec, future: [], tag: null }, selection: '$' }
  persist(spec)
  notify()
  return true
}

export function useComposer(): ComposerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}
