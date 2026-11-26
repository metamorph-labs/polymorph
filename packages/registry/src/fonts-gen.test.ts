import { resolve } from 'node:path'

import { exampleQuietSystem, type System } from '@polymorph/theme'
import { describe, expect, it } from 'vitest'

import {
  assertResolvable,
  assertWeightsShipped,
  fontLoaders,
  renderFontLoaders,
  weightFaults,
  type Loader,
} from './fonts-gen'
import { readSystems } from './theme'

const ROOT = resolve(import.meta.dirname, '../../..')
const WORKBENCH = resolve(ROOT, 'apps/workbench')

/** A guest system with the given fonts and heading weights. */
function guest(
  fonts: Partial<System['fonts']>,
  type: { titleWeight?: number; displayWeight?: number },
) {
  return {
    ...exampleQuietSystem,
    name: 'light-headings',
    fonts: { ...exampleQuietSystem.fonts, ...fonts },
    overrides: { type },
  } satisfies System
}

const loaderOf = (loaders: Loader[], family: string): Loader => {
  const loader = loaders.find((entry) => entry.family === family)
  if (loader === undefined) throw new Error(`no loader for ${family}`)
  return loader
}

describe('the font loaders', () => {
  it('carry no heading weight for the catalogue, whose systems set none', () => {
    const loaders = fontLoaders(readSystems(ROOT).map(({ system }) => system))
    expect(loaders.length).toBeGreaterThan(0)
    for (const loader of loaders) {
      expect(loader.demands, loader.family).toEqual([])
      expect(loader.specifiers, loader.family).toEqual(
        loader.variable
          ? [loader.package]
          : [400, 500, 600].map((weight) => `${loader.package}/${weight}.css`),
      )
    }
  })

  it('import a heading weight a system sets beside the three a static family loads', () => {
    const loaders = fontLoaders([guest({}, { titleWeight: 300, displayWeight: 700 })])
    // The quiet example's body and display are both static Inter.
    expect(loaderOf(loaders, 'Inter').specifiers).toEqual([
      '@fontsource/inter/300.css',
      '@fontsource/inter/400.css',
      '@fontsource/inter/500.css',
      '@fontsource/inter/600.css',
      '@fontsource/inter/700.css',
    ])
    // The mono family draws no heading step, so it keeps its three files.
    expect(loaderOf(loaders, 'JetBrains Mono').demands).toEqual([])
    expect(loaderOf(loaders, 'JetBrains Mono').specifiers).toHaveLength(3)
  })

  it('ask the title weight of the body family, in a system with no heading slot, and the display weight of the display family', () => {
    const loaders = fontLoaders([
      guest(
        { body: { family: 'Space Grotesk Variable' }, display: { family: 'Lora Variable' } },
        { titleWeight: 300, displayWeight: 400 },
      ),
    ])
    expect(loaderOf(loaders, 'Space Grotesk Variable').demands).toEqual([
      { weight: 300, system: 'light-headings', key: 'titleWeight' },
    ])
    expect(loaderOf(loaders, 'Lora Variable').demands).toEqual([
      { weight: 400, system: 'light-headings', key: 'displayWeight' },
    ])
    // A variable face imports its package whole, whatever the weights.
    expect(loaderOf(loaders, 'Lora Variable').specifiers).toEqual(['@fontsource-variable/lora'])
  })

  it('ask the title weight of the heading family when a system states one', () => {
    const loaders = fontLoaders([
      guest(
        {
          body: { family: 'Space Grotesk Variable' },
          heading: { family: 'Lora Variable' },
        },
        { titleWeight: 300 },
      ),
    ])
    expect(loaderOf(loaders, 'Lora Variable').demands).toEqual([
      { weight: 300, system: 'light-headings', key: 'titleWeight' },
    ])
    // The body family draws no heading step, so the weight is not asked of it.
    expect(loaderOf(loaders, 'Space Grotesk Variable').demands).toEqual([])
    // Lora's weight axis is 400–700 in the package the workbench installs, so 300 is refused.
    expect(() => assertWeightsShipped(WORKBENCH, '@polymorph/workbench', loaders)).toThrow(
      'system "light-headings" sets overrides.type.titleWeight 300, and "Lora Variable" ' +
        'draws weights 400–700 only',
    )
  })

  it('name every static file in the module the apps import', () => {
    const module = renderFontLoaders(fontLoaders([guest({}, { titleWeight: 300 })]))
    expect(module).toContain("import('@fontsource/inter/300.css')")
    expect(module).toContain('any heading weight a system sets for it')
  })
})

describe('a heading weight the family must ship', () => {
  const staticLoader = loaderOf(fontLoaders([guest({}, { titleWeight: 300 })]), 'Inter')

  it('needs a file for the weight in a static family', () => {
    expect(weightFaults(staticLoader, { weights: [400, 500] }, () => false)).toEqual([
      'system "light-headings" sets overrides.type.titleWeight 300, and @fontsource/inter has ' +
        'no 300 file (it ships 400, 500)',
    ])
    expect(weightFaults(staticLoader, undefined, () => true)).toEqual([])
  })

  it('needs the weight inside a variable family’s weight axis', () => {
    const loader = loaderOf(
      fontLoaders([guest({ display: { family: 'Lora Variable' } }, { displayWeight: 300 })]),
      'Lora Variable',
    )
    expect(
      weightFaults(loader, { variable: { wght: { min: '400', max: '700' } } }, () => true),
    ).toEqual([
      'system "light-headings" sets overrides.type.displayWeight 300, and "Lora Variable" ' +
        'draws weights 400–700 only',
    ])
    expect(
      weightFaults(loader, { variable: { wght: { min: '100', max: '900' } } }, () => true),
    ).toEqual([])
    expect(weightFaults(loader, { variable: false }, () => true)).toEqual([
      'system "light-headings" sets overrides.type.displayWeight 300, and ' +
        '@fontsource-variable/lora has no weight axis to draw it with',
    ])
  })

  it('reads the axis from the package the app installs', () => {
    // Lora's axis is 400–700 and Space Grotesk's 300–700, in the packages the workbench installs.
    const refused = fontLoaders([
      guest({ display: { family: 'Lora Variable' } }, { displayWeight: 300 }),
    ]).filter((loader) => loader.family === 'Lora Variable')
    expect(() => assertWeightsShipped(WORKBENCH, '@polymorph/workbench', refused)).toThrow(
      'registry: @polymorph/workbench cannot draw a heading weight a system file sets:\n' +
        '  system "light-headings" sets overrides.type.displayWeight 300, and "Lora Variable" ' +
        'draws weights 400–700 only',
    )
    const drawn = fontLoaders([
      guest({ body: { family: 'Space Grotesk Variable' } }, { titleWeight: 300 }),
    ]).filter((loader) => loader.family === 'Space Grotesk Variable')
    expect(() => assertWeightsShipped(WORKBENCH, '@polymorph/workbench', drawn)).not.toThrow()
  })

  it('leaves a package that is not installed to the install check', () => {
    // The workbench installs no static Inter, so the weight check passes it on.
    const loaders = [staticLoader]
    expect(() => assertWeightsShipped(WORKBENCH, '@polymorph/workbench', loaders)).not.toThrow()
    expect(() => assertResolvable(WORKBENCH, '@polymorph/workbench', loaders)).toThrow(
      'pnpm add @fontsource/inter --filter @polymorph/workbench',
    )
  })
})
