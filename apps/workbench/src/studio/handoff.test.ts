/**
 * The handoff's save-names law.
 *
 * The studio derives everything under the reserved pairing. The draft needs some pair name while
 * it is edited, and no file may be named `pm-draft`. The handoff is the only place a derivation
 * leaves the page, so it must resolve under the names the designer typed. A file containing
 * `pm-draft` would give someone a stylesheet scoped to a pairing that cannot exist in their
 * repository, and a markdown file naming a system nobody can install.
 *
 * This mistake is easy to reintroduce and does not show on the page. So this law checks both
 * files in both directions: the save names are present and the reserved name is absent.
 */

import { DATA_ATTRS } from '@polymorph/engine'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SYSTEM } from '../themes'
import { DRAFT_PALETTE, DRAFT_SYSTEM, startingDraft, type Draft } from './draft'
import { renderHandoff, renderThemeCSS } from './handoff'

/**
 * A system name no shipped system has and a palette name no shipped palette has, so any match
 * comes from this test.
 */
const SYSTEM_NAME = 'ember'
const PALETTE_NAME = 'dune'

/**
 * A real draft rather than a copy of the default. An amendment makes the handoff render its "what
 * the amendments moved" table. That section reads the emitted sheet and could include the
 * reserved name.
 */
function draft(): Draft {
  const base = startingDraft(DEFAULT_SYSTEM)
  return {
    ...base,
    system: { ...base.system, overrides: { shadow: { throw: 1.25 } } },
  }
}

describe('the handoff files use the save names', () => {
  it('scopes the stylesheet to the pair the designer typed', () => {
    const css = renderThemeCSS(draft(), SYSTEM_NAME, PALETTE_NAME)

    expect(css).toContain(`[${DATA_ATTRS.system}="${SYSTEM_NAME}"]`)
    expect(css).toContain(`[${DATA_ATTRS.palette}="${PALETTE_NAME}"]`)
  })

  it('names both files and the command that installs them', () => {
    const handoff = renderHandoff(draft(), SYSTEM_NAME, PALETTE_NAME)

    expect(handoff).toContain(`design/systems/${SYSTEM_NAME}.json`)
    expect(handoff).toContain(`design/palettes/${PALETTE_NAME}.json`)
    expect(handoff).toContain(`polymorph add theme:${SYSTEM_NAME} palette:${PALETTE_NAME}`)
  })

  it('keeps the reserved name out of both files', () => {
    expect(DRAFT_SYSTEM, 'both halves of the reserved pair spell the same').toBe(DRAFT_PALETTE)

    expect(renderThemeCSS(draft(), SYSTEM_NAME, PALETTE_NAME)).not.toContain(DRAFT_SYSTEM)
    expect(renderHandoff(draft(), SYSTEM_NAME, PALETTE_NAME)).not.toContain(DRAFT_SYSTEM)
  })
})
