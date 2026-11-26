import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { PREPAINT_SCRIPT, prepaintScript } from '@polymorph/theme'

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

// A guest system that opens dark, beside the one above that opens light.
write('night.json', {
  name: 'nightshift',
  axes: {
    geometry: 'sharp',
    depth: 'flat',
    density: 'compact',
    contrastTemperament: 'stark',
    typePersonality: 'mono',
    colorStrategy: 'quiet',
    motionTemperament: 'subtle',
    ornament: 'grid',
  },
  fonts: {
    body: { family: 'Inter Variable' },
    display: { family: 'Inter Variable' },
    mono: { family: 'JetBrains Mono Variable' },
  },
  defaultPalette: 'tide',
  defaultMode: 'dark',
})

/** What the plugin serves for one of its module ids. */
function loaded(options: PolymorphThemeOptions, id: string): string {
  const plugin = polymorphTheme(options)
  ;(plugin.configResolved as (config: { root: string }) => void)({ root })
  const load = plugin.load as unknown as (
    this: { addWatchFile: () => void },
    id: string,
  ) => string | null
  return load.call({ addWatchFile: () => undefined }, id) ?? ''
}

/** The eager stylesheet the plugin serves for `virtual:polymorph/theme.css`. */
function eagerSheet(options: PolymorphThemeOptions): string {
  return loaded(options, '/__polymorph/theme.css')
}

/** The page and the tags the plugin writes into `index.html`. */
function transformed(options: PolymorphThemeOptions, html: string) {
  const plugin = polymorphTheme(options)
  ;(plugin.configResolved as (config: { root: string }) => void)({ root })
  const transform = plugin.transformIndexHtml as unknown as (html: string) => {
    html: string
    tags: { tag: string; children: string; injectTo: string }[]
  }
  return transform(html)
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

describe('a first visit', () => {
  const options: PolymorphThemeOptions = {
    systems: ['night.json', 'system.json'],
    palettes: ['tide.json', 'tide-strong.json'],
  }

  it('inlines the pre-paint script built with each system’s default mode', () => {
    const { html, tags } = transformed(options, '<html lang="en"><head></head></html>')
    expect(html).toContain('<html data-system="nightshift" data-palette="tide"')
    expect(tags).toEqual([
      {
        tag: 'script',
        children: prepaintScript({
          modes: { nightshift: 'dark', harbourside: 'light' },
          system: 'nightshift',
        }),
        injectTo: 'head-prepend',
      },
    ])
    expect(tags[0]?.children).toContain('"nightshift":"dark"')
  })

  it('hands hydration the same modes, in the theme module’s catalogue', () => {
    const module_ = loaded(options, '\0polymorph:theme')
    expect(module_).toContain('"modes":{"nightshift":"dark","harbourside":"light"}')
    expect(module_).toContain('hydrateTheme(defaultSystem, catalogue)')
  })

  it('inlines the constant where every system follows the device', () => {
    write('daily.json', {
      name: 'daily',
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
      defaultMode: 'system',
    })
    const { tags } = transformed(
      { systems: ['daily.json'], palettes: ['tide.json', 'tide-strong.json'] },
      '<html><head></head></html>',
    )
    expect(tags[0]?.children).toBe(PREPAINT_SCRIPT)
  })
})
