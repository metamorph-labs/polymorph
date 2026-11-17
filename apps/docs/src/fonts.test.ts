import { FONT_ROLES } from '@polymorph/engine'
import { describe, expect, it } from 'vitest'

import { FAMILY_LOADERS } from './fonts'
import { SYSTEMS } from './themes'

describe('the font map covers the catalogue', () => {
  it('has a loader for every family a shipped system names', () => {
    // A family missing from the map renders the fallback everywhere with no
    // error, because `FAMILY_LOADERS[family]?.()` ignores a miss. The map is
    // generated from the catalogue, so a fresh map covers it. This law catches a
    // stale map: a system edited without `pnpm registry` (or an install) having
    // run since.
    const missing = SYSTEMS.flatMap((system) =>
      FONT_ROLES.map((role) => system.fonts[role].family).filter(
        (family) => !(family in FAMILY_LOADERS),
      ),
    )
    expect(missing).toEqual([])
  })
})
