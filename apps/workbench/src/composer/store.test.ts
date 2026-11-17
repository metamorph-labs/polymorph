/**
 * @vitest-environment jsdom
 *
 * The composer store's laws: what the store accepts as a document, and how history merges edits.
 *
 * The boot tests guard against a permanently broken page. Suppose `restore()` accepted anything
 * with `"spec": "polymorph-screen/1"` and `replaceComposition` persisted whatever Open passed it.
 * Then one tagged but malformed document, such as a screen with no `root` from a half-written
 * file or a hand-edited draft, would be written to `localStorage`. It would crash `renderSpec` on
 * the next render and be read back on every reload, so the page would always show "This page
 * failed to load" until someone cleared storage in devtools. So the store checks a stored document
 * against the same shape the renderer assumes. That check is safe in the browser and uses a
 * dependency the render path already loads.
 *
 * The history tests cover merging: a run of keystrokes into one prop is one undo, and the run
 * ends when the selection moves.
 *
 * The file requests a DOM in its docblock because it tests `localStorage` and a store that reads
 * it at module scope.
 */

import { SPEC_ID } from '@polymorph/spec/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { COMPOSER_STORAGE_KEY } from './store'

/** A fresh module per case, because the store reads storage once, at import. */
async function boot() {
  vi.resetModules()
  return import('./store')
}

const stored = (): unknown => JSON.parse(localStorage.getItem(COMPOSER_STORAGE_KEY) ?? 'null')

beforeEach(() => {
  localStorage.clear()
})

describe('what the store will accept as a document', () => {
  it('resumes a lawful stored draft', async () => {
    const { startingSpec } = await boot()
    const draft = { ...startingSpec(), name: 'Resumed' }
    localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify(draft))

    const { currentSpec } = await boot()
    expect(currentSpec().name).toBe('Resumed')
  })

  it('ignores a tagged but malformed stored draft at boot', async () => {
    // Tagged as a screen spec but missing everything the renderer reads. A check of
    // `.spec === SPEC_ID` alone would accept it.
    localStorage.setItem(
      COMPOSER_STORAGE_KEY,
      JSON.stringify({ spec: SPEC_ID, name: 'Broken', purpose: 'x' }),
    )

    const { currentSpec, startingSpec } = await boot()
    expect(currentSpec()).toEqual(startingSpec())
  })

  it('refuses to load or persist a malformed document at Open time', async () => {
    const { currentSpec, replaceComposition, startingSpec } = await boot()
    const lawful = { ...startingSpec(), name: 'Kept' }
    replaceComposition(lawful)
    expect(currentSpec().name).toBe('Kept')

    // A stale or hand-edited file in `design/screens/` can look like this.
    replaceComposition({ spec: SPEC_ID, name: 'Broken', purpose: 'x' } as never)
    expect(currentSpec().name).toBe('Kept')
    // Storage also keeps the previous document, otherwise the next reload would load the bad one.
    expect(stored()).toEqual(lawful)
  })

  it('returns false when it refuses a document', async () => {
    const { replaceComposition } = await boot()
    expect(replaceComposition({ spec: SPEC_ID, name: 'Broken' } as never)).toBe(false)
  })
})

describe('a run of keystrokes is one undo', () => {
  it('merges edits with the same tag, so three characters undo in one step', async () => {
    const { apply, currentSpec, startingSpec, undoComposition } = await boot()
    const opening = startingSpec().purpose
    for (const purpose of ['A', 'Ab', 'Abc']) {
      apply({ ...currentSpec(), purpose }, undefined, '$:purpose')
    }
    expect(currentSpec().purpose).toBe('Abc')

    undoComposition()
    expect(currentSpec().purpose).toBe(opening)
  })

  it('ends the run when the selection moves', async () => {
    // Selecting is not an edit, but it ends the current run. The next keystroke starts a new
    // entry rather than joining the run from before the selection changed.
    const { apply, currentSpec, select, undoComposition } = await boot()
    for (const purpose of ['A', 'Ab']) {
      apply({ ...currentSpec(), purpose }, undefined, '$:purpose')
    }
    select('$.children[0]')
    apply({ ...currentSpec(), purpose: 'Abc' }, undefined, '$:purpose')

    undoComposition()
    expect(currentSpec().purpose).toBe('Ab')
  })
})
