import { describe, expect, it } from 'vitest'

import { cssVarName } from './css-vars'
import {
  BACKGROUND_ROLES,
  COLOR_ROLE_GROUPS,
  COLOR_ROLES,
  isColorRole,
  STATUS_ROLES,
  STATUS_TONES,
  STATUS_VARIANTS,
  statusRole,
  TEXT_BEARING_BACKGROUNDS,
} from './roles'

describe('colour role catalogue', () => {
  it('has no duplicates', () => {
    expect(new Set(COLOR_ROLES).size).toBe(COLOR_ROLES.length)
  })

  it('is 74 roles — 7 bg + 10 accent + 5 text + 6 border + 40 status + 6 selection', () => {
    // Pinned so the catalogue stays small enough to remember (the
    // small-vocabulary law, `docs/concepts.md`) and a new role is a reviewed
    // change. Each group's size is justified where it is defined: status
    // families copy the accent's shape (`roles.ts`); `border.field` exists
    // because the reference's dark `--input` differs from `--border`;
    // `border.focusSolid` because the reference's focused border becomes the
    // ring, plus the halo (`role-map.ts`); `accent.underline` is the resting
    // link underline (`TEMPERAMENT_UNDERLINE_ALPHA` in `role-map.ts`);
    // selection has two fills because a selected part holds one label or
    // content of its own (`roles.ts`).
    expect(COLOR_ROLES).toHaveLength(74)
  })

  it('is exactly the union of its groups', () => {
    const fromGroups = Object.values(COLOR_ROLE_GROUPS).flat()
    expect([...COLOR_ROLES].sort()).toEqual([...fromGroups].sort())
  })

  it('covers the full status cross-product — 4 tones x 10 variants', () => {
    const expected = STATUS_TONES.flatMap((tone) =>
      STATUS_VARIANTS.map((variant) => statusRole(tone, variant)),
    )
    expect([...STATUS_ROLES].sort()).toEqual([...expected].sort())
    expect(STATUS_ROLES).toHaveLength(40)
  })

  it('keeps scrim and inverse out of the text-bearing set', () => {
    expect(TEXT_BEARING_BACKGROUNDS).not.toContain('bg.scrim')
    expect(TEXT_BEARING_BACKGROUNDS).not.toContain('bg.inverse')
    for (const bg of TEXT_BEARING_BACKGROUNDS) {
      expect(BACKGROUND_ROLES).toContain(bg)
    }
  })

  it('narrows unknown strings', () => {
    expect(isColorRole('bg.app')).toBe(true)
    expect(isColorRole('bg.nope')).toBe(false)
  })

  it('emits every role as a lint-legal custom property', () => {
    // Mirrors the Stylelint `custom-property-pattern` law: `^pm-[a-z0-9-]+$`.
    for (const role of COLOR_ROLES) {
      expect(cssVarName(role)).toMatch(/^--pm-[a-z0-9-]+$/)
    }
    expect(new Set(COLOR_ROLES.map(cssVarName)).size).toBe(COLOR_ROLES.length)
  })
})
