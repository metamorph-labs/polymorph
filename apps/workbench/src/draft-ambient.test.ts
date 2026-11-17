/**
 * @vitest-environment jsdom
 *
 * The ambient-draft law. A studio draft is persisted as a document and applied as a pairing. On
 * boot, a stored draft must be re-derived and installed before hydration checks the stored names.
 * Otherwise a designer who reloads while using their draft is moved back to the default system
 * without notice, and the studio appears to lose their work. The file requests a DOM in its
 * docblock because it tests `<html>` attributes, `<head>` styles and `localStorage`.
 */

import { DATA_ATTRS, GEOMETRY_RADII, STORAGE_KEYS, teardownTheme } from '@polymorph/engine'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  bootDraft,
  DRAFT_PALETTE,
  DRAFT_STORAGE_KEY,
  DRAFT_SYSTEM,
  getDraftRuntime,
  setDraftRuntime,
  subscribeDraft,
} from './draft-boot'
import { DEFAULT_SYSTEM, installThemes, PALETTES, SYSTEMS } from './themes'

/** An amended md that the merge law accepts for this geometry: the geometry's own lg. */
function lawfulMd(system: (typeof SYSTEMS)[number]): number {
  return GEOMETRY_RADII[system.axes.geometry][2]
}

function draftDocument(): string {
  const system = SYSTEMS[0]!
  const palette =
    PALETTES.find((candidate) => candidate.name === system.defaultPalette) ?? PALETTES[0]!
  // A visible edit, so the stored draft differs from the shipped file. The amended radius step
  // goes in `overrides`, where a system file sets values. The value comes from the system's own
  // geometry so the merged ladder stays monotone, because the studio only persists what the
  // schema accepts.
  return JSON.stringify({
    system: { ...system, overrides: { radius: { md: lawfulMd(system) } } },
    palette,
  })
}

function reset(): void {
  localStorage.clear()
  document.head.innerHTML = ''
  // The slot is module state and persists across a file's tests. A boot that reads nothing must
  // leave nothing behind, and each case below checks that on its own.
  setDraftRuntime(null)
  for (const attr of Object.values(DATA_ATTRS)) {
    document.documentElement.removeAttribute(attr)
  }
}

/** The pair the document applies, read from the attributes. */
function worn(): { system: string | null; palette: string | null } {
  return {
    system: document.documentElement.getAttribute(DATA_ATTRS.system),
    palette: document.documentElement.getAttribute(DATA_ATTRS.palette),
  }
}

/**
 * Whether a block on the page starts with the applied pair's selector. A pairing that no block
 * matches leaves every `--pm-*` undefined.
 */
function paintable(): boolean {
  const { system, palette } = worn()
  const selector = `[${DATA_ATTRS.system}="${system}"][${DATA_ATTRS.palette}="${palette}"]`
  return [...document.querySelectorAll('style')].some((style) =>
    (style.textContent ?? '').includes(selector),
  )
}

beforeEach(reset)
afterEach(() => teardownTheme())

describe('a stored draft is applied at boot', () => {
  it('keeps a stored draft selection through boot and installs its block', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, draftDocument())
    localStorage.setItem(STORAGE_KEYS.system, DRAFT_SYSTEM)
    localStorage.setItem(STORAGE_KEYS.palette, DRAFT_PALETTE)

    installThemes()

    expect(document.documentElement.getAttribute(DATA_ATTRS.system)).toBe(DRAFT_SYSTEM)
    expect(document.documentElement.getAttribute(DATA_ATTRS.palette)).toBe(DRAFT_PALETTE)

    const blocks = [...document.querySelectorAll('style')].filter((style) =>
      (style.textContent ?? '').startsWith(
        `[${DATA_ATTRS.system}="${DRAFT_SYSTEM}"][${DATA_ATTRS.palette}="${DRAFT_PALETTE}"]`,
      ),
    )
    expect(blocks, 'the draft pairing must be painted, not merely selected').toHaveLength(1)
    // The stored amendment is in the block, so the restored draft is the stored draft and not the
    // system it started from.
    expect(blocks[0]?.textContent).toContain(`--pm-radius-md: ${lawfulMd(SYSTEMS[0]!)}px`)
  })

  it('falls back to the default system when the stored draft does not parse', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{"system":')
    localStorage.setItem(STORAGE_KEYS.system, DRAFT_SYSTEM)
    localStorage.setItem(STORAGE_KEYS.palette, DRAFT_PALETTE)

    installThemes()

    // No draft could be installed, so `pm-draft` is a stale name. The document falls back entirely
    // and the stale keys are cleared, the same as for a renamed system.
    expect(document.documentElement.getAttribute(DATA_ATTRS.system)).toBe(DEFAULT_SYSTEM)
    expect(localStorage.getItem(STORAGE_KEYS.system)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.palette)).toBeNull()
  })

  it('installs a stored draft that is not selected, without changing the selection', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, draftDocument())

    installThemes()

    expect(document.documentElement.getAttribute(DATA_ATTRS.system)).toBe(DEFAULT_SYSTEM)
    const blocks = [...document.querySelectorAll('style')].filter((style) =>
      (style.textContent ?? '').startsWith(`[${DATA_ATTRS.system}="${DRAFT_SYSTEM}"]`),
    )
    expect(blocks, 'the draft is installed either way — the toolbar offers it').toHaveLength(1)
  })
})

/**
 * The draft is applied as a pair, and its block is scoped by both names. A pairing with only one
 * draft name matches no block, so the document is unstyled. Hydration does not catch this on its
 * own, because it checks the two stored names separately. `pm-draft` next to a shipped palette
 * passes both checks but matches no block. Two tabs can cause this: one switches to the draft,
 * the other picks a palette. The state persists, because the unmatched pair is stored for the
 * next load.
 */
describe('a pairing with only one draft half is never applied', () => {
  const shippedSystem =
    SYSTEMS.find((system) => system.name !== DEFAULT_SYSTEM)?.name ?? DEFAULT_SYSTEM
  const shippedPalette = PALETTES[0]!.name

  const halves = [
    {
      what: 'the draft system beside a shipped palette',
      system: DRAFT_SYSTEM,
      palette: shippedPalette,
    },
    {
      what: 'a shipped system beside the draft palette',
      system: shippedSystem,
      palette: DRAFT_PALETTE,
    },
  ]

  for (const half of halves) {
    it(`${half.what}, with a draft installed, switches to the full draft`, () => {
      localStorage.setItem(DRAFT_STORAGE_KEY, draftDocument())
      localStorage.setItem(STORAGE_KEYS.system, half.system)
      localStorage.setItem(STORAGE_KEYS.palette, half.palette)

      installThemes()

      expect(worn(), 'the draft is worn whole or not at all').toEqual({
        system: DRAFT_SYSTEM,
        palette: DRAFT_PALETTE,
      })
      expect(paintable(), 'and a block matches it').toBe(true)
    })

    it(`${half.what}, with no draft installed, falls back to a shipped pair`, () => {
      localStorage.setItem(STORAGE_KEYS.system, half.system)
      localStorage.setItem(STORAGE_KEYS.palette, half.palette)

      installThemes()

      const { system, palette } = worn()
      expect(system, 'the reserved name is nowhere near the document').not.toBe(DRAFT_SYSTEM)
      expect(palette).not.toBe(DRAFT_PALETTE)
      expect(paintable(), 'and whatever it landed on, a block matches it').toBe(true)
    })
  }
})

/**
 * `null` discards the draft (see `bootDraft`'s docblock), and both refusal paths must do so.
 * Otherwise a second boot that finds nothing, or finds something it cannot parse, leaves the
 * first boot's runtime in place. The toolbar would then show an entry for a draft that is no
 * longer stored, with a resolution that never updates.
 */
describe('a boot that installs nothing clears the slot', () => {
  it('when the stored draft is gone', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, draftDocument())
    expect(bootDraft()).not.toBeNull()

    let told = 0
    const stop = subscribeDraft(() => {
      told += 1
    })
    localStorage.removeItem(DRAFT_STORAGE_KEY)

    expect(bootDraft()).toBeNull()
    expect(getDraftRuntime(), 'the slot the first boot claimed is released').toBeNull()
    expect(told, 'and the toolbar is told, or its entry never goes').toBeGreaterThan(0)
    stop()
  })

  it('when the stored draft no longer parses', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, draftDocument())
    expect(bootDraft()).not.toBeNull()

    let told = 0
    const stop = subscribeDraft(() => {
      told += 1
    })
    localStorage.setItem(DRAFT_STORAGE_KEY, '{"system":')

    expect(bootDraft()).toBeNull()
    expect(getDraftRuntime()).toBeNull()
    expect(told).toBeGreaterThan(0)
    stop()
  })
})
