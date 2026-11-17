/**
 * @vitest-environment jsdom
 *
 * The studio store's boot and discard.
 *
 * Two behaviours the designer cannot observe directly:
 *
 *  - **A stored draft the current schema refuses is set aside, never deleted.** A refusal in
 *    `restore()` is not a discard by the designer. The raw document moves verbatim to its own
 *    key, the studio opens with a fresh draft, and the main key persists normally from then on.
 *    Without this, the first keystroke would overwrite the refused document with the fresh
 *    default.
 *  - **Discarding keeps the preview styled.** The preview panes always use the reserved pairing.
 *    A discard that removes the block and installs nothing would leave them inheriting the page
 *    pairing. A designer on `terminal` who clicks Discard would see the default in the controls
 *    and terminal in the panes.
 *
 * The file requests a DOM in its docblock because it tests `localStorage` and the `<style>`
 * elements that style a draft. The store initialises at module load, and that run is the boot
 * under test, so each case seeds storage and then imports the store again.
 */

import { DATA_ATTRS, GEOMETRY_RADII, teardownTheme } from '@polymorph/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DRAFT_PALETTE, DRAFT_STORAGE_KEY, DRAFT_SYSTEM } from '../draft-boot'
import { DEFAULT_SYSTEM, PALETTES, SYSTEMS } from '../themes'
import { deriveDraft, startingDraft } from './draft'

/** The key the store moves a refused document to. Written out here on purpose. */
const REFUSED_KEY = 'pm-studio-draft-refused'

/** The selector every draft block starts with, built from the engine's attributes. */
const DRAFT_SELECTOR = `[${DATA_ATTRS.system}="${DRAFT_SYSTEM}"][${DATA_ATTRS.palette}="${DRAFT_PALETTE}"]`

const defaultSystem = SYSTEMS.find((system) => system.name === DEFAULT_SYSTEM) ?? SYSTEMS[0]!

/** An amended md that the merge law accepts for this geometry: the geometry's own lg. */
function lawfulMd(): number {
  return GEOMETRY_RADII[defaultSystem.axes.geometry][2]
}

/**
 * A stored draft in the shape the store writes: the interchange pair plus the save-field names,
 * as 2-space JSON with a trailing newline. `patch` amends the system, which is the source of every
 * refusal in these tests.
 */
function storedDocument(patch: Record<string, unknown> = {}): string {
  const palette =
    PALETTES.find((candidate) => candidate.name === defaultSystem.defaultPalette) ?? PALETTES[0]!
  return `${JSON.stringify(
    {
      system: { ...defaultSystem, overrides: { radius: { md: lawfulMd() } }, ...patch },
      palette,
      names: { system: 'kept-system', palette: 'kept-palette' },
    },
    null,
    2,
  )}\n`
}

/**
 * A fresh store over freshly seeded storage. `resetModules` is required because the store's
 * `restore() ?? fresh()` runs once, at import, and that run is what these tests check.
 */
async function bootStore(stored: string | null) {
  localStorage.clear()
  document.head.innerHTML = ''
  if (stored !== null) localStorage.setItem(DRAFT_STORAGE_KEY, stored)
  vi.resetModules()
  return import('./store')
}

type Store = Awaited<ReturnType<typeof bootStore>>

/** The blocks the store installed, found the same way the page finds them. */
function draftBlocks(): HTMLStyleElement[] {
  return [...document.querySelectorAll('style')].filter((style) =>
    (style.textContent ?? '').startsWith(DRAFT_SELECTOR),
  )
}

/** Any edit. It changes a seed, so no schema can refuse it. */
function nudge(store: Store): void {
  store.updateDraft((draft) => ({
    ...draft,
    palette: { ...draft.palette, accentHue: (draft.palette.accentHue + 40) % 360 },
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = ''
})

afterEach(() => teardownTheme())

describe('a stored draft the schema refuses is set aside, not overwritten', () => {
  it('sets the refused document aside verbatim and opens with a fresh draft', async () => {
    // Valid in every other respect. `systemSchema` is a strict object, so one unknown key
    // simulates a document written under a different schema.
    const stale = storedDocument({ vibe: 'loud' })
    const store = await bootStore(stale)

    expect(localStorage.getItem(REFUSED_KEY), 'the document is set aside, byte for byte').toBe(
      stale,
    )
    expect(localStorage.getItem(DRAFT_STORAGE_KEY), 'and the main lane is clear').toBeNull()

    const state = store.studioState()
    expect(state.systemName, 'the studio opened fresh, not on the refused names').toBe(
      DEFAULT_SYSTEM,
    )
    expect(state.draft.system.overrides).toBeUndefined()
  })

  it('persists the next edit to the main key and keeps the set-aside copy', async () => {
    const stale = storedDocument({ vibe: 'loud' })
    const store = await bootStore(stale)

    nudge(store)

    expect(localStorage.getItem(DRAFT_STORAGE_KEY), 'the fresh draft snapshots').not.toBeNull()
    expect(localStorage.getItem(REFUSED_KEY), 'the refused one is still there').toBe(stale)
  })

  it('restores a draft the schema accepts but the laws refuse', async () => {
    /*
     * The schema checks shape. Whether a slug names a real member is checked by the registry,
     * and `deriveDraft` reports it as a fault. So this document parses but is refused. That case
     * must still restore, so the designer can fix the draft from the law panel.
     *
     * The contrast case cannot be tested because it cannot occur. The nudge budget resolves every
     * schema-valid pairing in the lawful space (an exhaustive check of 55,296 axes ×
     * example-palette combinations found none unresolvable). So no document the schema accepts
     * produces a contrast-refused draft.
     */
    const lawless = storedDocument({
      overrides: {
        exceptions: [
          {
            component: 'not-a-member',
            family: 'radius',
            class: 'control',
            step: 'pill',
            because: 'the studio must still let me argue with this',
          },
        ],
      },
    })
    const store = await bootStore(lawless)

    expect(localStorage.getItem(REFUSED_KEY), 'nothing was parked').toBeNull()
    expect(localStorage.getItem(DRAFT_STORAGE_KEY), 'and nothing was cleared').toBe(lawless)

    const state = store.studioState()
    expect(state.systemName, 'the stored save-names came back').toBe('kept-system')
    expect(state.draft.system.overrides?.exceptions).toHaveLength(1)
    expect(state.derivation.faults.join(' ')).toContain('not-a-member')
  })

  it('reports no draft until the first edit, so Discard stays disabled until then', async () => {
    const store = await bootStore(storedDocument({ vibe: 'loud' }))

    expect(store.hasDraft(), 'nothing to discard: the studio is showing a fresh draft').toBe(false)

    nudge(store)

    expect(store.hasDraft(), 'now there is').toBe(true)
  })

  it('carries a document the schema accepts straight into the studio', async () => {
    const store = await bootStore(storedDocument())

    expect(localStorage.getItem(REFUSED_KEY)).toBeNull()
    expect(store.studioState().draft.system.overrides?.radius?.md).toBe(lawfulMd())
    expect(store.hasDraft()).toBe(true)
  })
})

describe('discarding keeps the preview styled', () => {
  it('re-installs the fresh derivation so the panes keep a matching block', async () => {
    const store = await bootStore(storedDocument())
    nudge(store)
    expect(draftBlocks(), 'the edit painted the draft').toHaveLength(1)

    store.discardDraft()

    const blocks = draftBlocks()
    expect(blocks, 'the preview panes still have a block to wear').toHaveLength(1)
    expect(blocks[0]?.textContent, 'and it is the fresh draft, not the discarded one').toBe(
      deriveDraft(startingDraft(DEFAULT_SYSTEM)).css,
    )
  })
})
