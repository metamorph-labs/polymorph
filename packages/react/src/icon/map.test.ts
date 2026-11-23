import { ICON_ROLE_META, ICON_ROLES, ICON_SET, isIconRole } from '@polymorph/engine'
import * as lucide from 'lucide'
import { describe, expect, it } from 'vitest'

import iconSet from '../../../../design/icons.json' with { type: 'json' }
import { ICON_MAP } from './map'

/**
 * The map is hand-written to keep lucide's 6000 exports tree-shakable, so a
 * copying mistake is possible. These tests check that every role in
 * `design/icons.json` is mapped, nothing extra is, and each entry points at the
 * glyph the spec names. The check compares against lucide's own export of that
 * name, so `add: Minus` fails instead of only looking wrong in a gallery.
 */

const pascal = (kebab: string) =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

describe('icon map', () => {
  it('covers exactly the roles the spec declares', () => {
    expect(Object.keys(ICON_MAP).sort()).toEqual(Object.keys(iconSet.roles).sort())
    // Pinned so adding a role is a visible, reviewed change. `design/icons.md`
    // lists the roles by group and the steps for adding one.
    expect(ICON_ROLES).toHaveLength(108)
  })

  it('points every role at the glyph the spec names', () => {
    for (const role of ICON_ROLES) {
      const expected = pascal(ICON_ROLE_META[role].glyph)
      const named = (lucide as unknown as Record<string, unknown>)[expected]
      expect(named, `lucide has no glyph "${expected}"`).toBeDefined()
      expect(ICON_MAP[role], `role "${role}" -> ${ICON_ROLE_META[role].glyph}`).toBe(named)
    }
  })

  it('keeps the intentional role-to-glyph indirections', () => {
    // Separate roles that share a glyph now and can diverge later without
    // changing a call site (design/icons.md).
    expect(ICON_MAP.close).toBe(ICON_MAP.clear)
    expect(ICON_MAP.remove).toBe(ICON_MAP.indeterminate)
    // A pair that looks like one role but is two, with different glyphs.
    expect(ICON_MAP.duplicate).not.toBe(ICON_MAP.copy)
  })

  it('groups every role into one of the five documented groups', () => {
    const groups = new Set(ICON_ROLES.map((role) => ICON_ROLE_META[role].group))
    expect([...groups].sort()).toEqual(['action', 'form', 'navigation', 'object', 'status'])
  })

  it('rejects unknown names, so an invented icon name is a type error', () => {
    expect(isIconRole('delete')).toBe(true)
    expect(isIconRole('trash-can')).toBe(false)
    expect(ICON_SET).toBe('lucide')
  })
})
