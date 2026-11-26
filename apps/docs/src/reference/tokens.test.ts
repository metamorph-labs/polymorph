import { TEXT_BEARING_BACKGROUNDS } from '@polymorph/theme'
import { describe, expect, it } from 'vitest'

import { REGISTRY } from '../registry'
import { fontsOf, paintOf, pixels, purposeOf, readersOf, usageOf } from './tokens'

/** What the tokens page says about each role is read from the contrast law and the registry. */

const roles = Object.entries(REGISTRY.theme.colorRoles)
  .filter(([group]) => group !== 'chart')
  .flatMap(([, names]) => names)

describe('the tokens page', () => {
  it('paints every colour role the registry lists', () => {
    expect(roles.length).toBeGreaterThan(0)
    for (const role of roles)
      expect(['fill', 'ink', 'line', 'veil'], role).toContain(paintOf(role).kind)
  })

  it('draws a surface with the text checked on it, and text on its surface', () => {
    for (const surface of TEXT_BEARING_BACKGROUNDS) {
      expect(paintOf(surface)).toEqual({ kind: 'fill', ink: 'text.primary' })
    }
    expect(paintOf('accent.bg')).toEqual({ kind: 'fill', ink: 'accent.contrast' })
    expect(paintOf('text.muted').kind).toBe('ink')
    expect(paintOf('border.default').kind).toBe('line')
    expect(paintOf('bg.scrim').kind).toBe('veil')
  })

  it('says what every text role is for, with its contrast floor', () => {
    for (const role of REGISTRY.theme.colorRoles.text ?? []) {
      expect(purposeOf(role), role).toBeDefined()
    }
    expect(purposeOf('text.primary')).toMatch(/Lc 75\.$/)
  })

  it('names the components that read a role', () => {
    expect(readersOf('bg.app')).toContain('AppShell')
    expect(usageOf('bg.app')).toBe('Used by AppShell.')
  })

  it('states sizes and fonts from the registry', () => {
    for (const system of REGISTRY.theme.systems) {
      expect(pixels(system.tokenValues.text['--pm-text-md-size']), system.name).toMatch(
        /^\d+(\.\d)?px$/,
      )
    }
    for (const system of REGISTRY.theme.systems) {
      expect(fontsOf(system.name), system.name).toMatch(/ for text/)
      // Every system draws its headings in some face, its body face when it has no heading slot.
      expect(fontsOf(system.name), system.name).toMatch(/headings/)
    }
    expect(fontsOf('dew')).toBe(
      'Geist for text and headings, Fraunces for display titles and Geist Mono for code',
    )
  })
})
