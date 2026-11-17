import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { polymorphTheme, type PolymorphThemeOptions } from './src/vite'

/**
 * The build-time theme plugin, driven through its own hooks over documents on
 * disk, as Vite drives it. It lives at the package root, not in `src/`, because
 * `src/**` is the engine's browser project and this is a node test about files.
 */

const root = mkdtempSync(join(tmpdir(), 'polymorph-vite-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const write = (name: string, document: object) =>
  writeFileSync(join(root, name), JSON.stringify(document))

write('system.json', {
  name: 'harbourside',
  axes: {
    geometry: 'soft',
    depth: 'borders',
    density: 'standard',
    contrastTemperament: 'standard',
    typePersonality: 'grotesque',
    colorStrategy: 'quiet',
    motionTemperament: 'standard',
    ornament: 'minimal',
  },
  fonts: {
    body: { family: 'Inter Variable' },
    display: { family: 'Inter Variable' },
    mono: { family: 'JetBrains Mono Variable' },
  },
  defaultPalette: 'tide',
  defaultMode: 'light',
})
write('tide.json', {
  name: 'tide',
  accentHue: 220,
  neutralTint: 0.004,
  chromaBudget: 'medium',
  moreContrast: 'tide-strong',
})
write('tide-strong.json', {
  name: 'tide-strong',
  accentHue: 220,
  neutralTint: 0,
  chromaBudget: 'high',
})

/** The eager stylesheet the plugin serves for `virtual:polymorph/theme.css`. */
function eagerSheet(options: PolymorphThemeOptions): string {
  const plugin = polymorphTheme(options)
  ;(plugin.configResolved as (config: { root: string }) => void)({ root })
  const load = plugin.load as unknown as (
    this: { addWatchFile: () => void },
    id: string,
  ) => string | null
  return load.call({ addWatchFile: () => undefined }, '/__polymorph/theme.css') ?? ''
}

describe('a palette with a more-contrast partner', () => {
  it('compiles the partner into the pairing’s own stylesheet, under the media query', () => {
    const css = eagerSheet({
      systems: ['system.json'],
      palettes: ['tide.json', 'tide-strong.json'],
    })
    const query = css.indexOf('@media (prefers-contrast: more), (forced-colors: active) {')
    expect(query).toBeGreaterThan(0)
    expect(css.slice(query)).toContain('[data-system="harbourside"][data-palette="tide"]')
  })

  it('fails the build when the partner is not among the palettes', () => {
    expect(() => eagerSheet({ systems: ['system.json'], palettes: ['tide.json'] })).toThrow(
      /its more-contrast palette "tide-strong" is not among `palettes`/,
    )
  })
})
