import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import {
  EscapingDirError,
  planInstall,
  shipped,
  successor,
  UnknownItemError,
  vendoredText,
} from './plan'

/**
 * The plan, where an install makes every decision.
 *
 * Pure: it takes a registry and a list of names and returns a description of an
 * install. This file uses no temporary directory, on purpose. Resolution is
 * separate from writing, so a plan can be shown to a consumer before anything
 * is touched (`--dry-run`) and returned by the MCP server's `get_install_plan`
 * without an installer.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

describe('resolving what to install', () => {
  it('includes the files a component needs to compile', () => {
    const plan = planInstall(registry, ['button'])
    const landed = plan.files.map((file) => file.to)

    expect(landed).toContain('src/polymorph/controls/Button.tsx')
    expect(landed).toContain('src/polymorph/controls/button.module.css')
    expect(landed).toContain('src/polymorph/controls/button.states.tsx')
    // The two convention stylesheets nothing exports and every component
    // composes. A closure built from component dependencies alone misses both.
    expect(landed).toContain('src/polymorph/conventions/focus.module.css')
    expect(landed).toContain('src/polymorph/conventions/motion.module.css')
    // And the ambient declaration, which no import can reach.
    expect(landed).toContain('src/polymorph/css-modules.d.ts')
  })

  it('preserves the tree below each root, so a recipe lands beside its member', () => {
    const files = planInstall(registry, ['dialog']).files
    for (const file of files) {
      expect(file.to).toBe(
        file.from.replace(/^packages\/(?:react-ui|recipes)\/src/, 'src/polymorph'),
      )
    }
    const dialog = files.find(
      (file) => file.from === 'packages/recipes/src/overlays/dialog.module.css',
    )
    expect(dialog?.to).toBe('src/polymorph/overlays/dialog.module.css')
  })

  it('rewrites a member’s recipe import to its copy, and nothing else', () => {
    // A vendoring consumer installs no `@polymorph/recipes`: the recipe is
    // copied beside the member, and the import names the copy.
    const source = [
      "import { memberAttr } from '@polymorph/react'",
      "import styles from '@polymorph/recipes/controls/button.module.css'",
      'const note = "@polymorph/recipes/controls/button.module.css"',
      '',
    ].join('\n')
    expect(vendoredText(registry, 'packages/react-ui/src/controls/Button.tsx', source)).toBe(
      [
        "import { memberAttr } from '@polymorph/react'",
        "import styles from './button.module.css'",
        'const note = "@polymorph/recipes/controls/button.module.css"',
        '',
      ].join('\n'),
    )
    // A member one directory deeper than its recipe's tier, and a recipe in another tier.
    expect(
      vendoredText(
        registry,
        'packages/react-ui/src/charts/frame/ChartFrame.tsx',
        "import styles from '@polymorph/recipes/charts/frame/chart-frame.module.css'\n" +
          "import layout from '@polymorph/recipes/layout/layout.module.css'\n",
      ),
    ).toBe(
      "import styles from './chart-frame.module.css'\n" +
        "import layout from '../../layout/layout.module.css'\n",
    )
    // A recipe is copied as it is: its `composes` are relative already.
    const css = "composes: focusRing from '../conventions/focus.module.css';"
    expect(vendoredText(registry, 'packages/recipes/src/controls/button.module.css', css)).toBe(css)
  })

  it('rewrites every recipe import a vendored member has, so none needs the package', () => {
    // The real files, as an install reads them.
    for (const file of planInstall(registry, ['dialog', 'data-table', 'app-shell']).files) {
      if (!/\.tsx?$/.test(file.from)) continue
      const text = vendoredText(registry, file.from, readFileSync(resolve(ROOT, file.from), 'utf8'))
      expect(text, file.from).not.toContain(`'${registry.vendor.recipes.package}/`)
    }
  })

  it('honours a different directory', () => {
    const plan = planInstall(registry, ['button'], { dir: 'app/ui' })
    expect(plan.dir).toBe('app/ui')
    expect(plan.files.every((file) => file.to.startsWith('app/ui/'))).toBe(true)
  })

  it('names every component pulled in, not only the ones asked for', () => {
    const plan = planInstall(registry, ['dialog'])
    expect(plan.requested).toEqual(['Dialog'])
    // Dialog's fixture builds a form inside the modal, so the form members are
    // installed too. Reporting only `dependencies.components` would say
    // "Button", which misstates the consumer's repository.
    expect(plan.components).toContain('Input')
    expect(plan.components).toContain('FormField')
    expect(plan.components).toContain('Stack')
  })

  it('copies a shared file once when two components both need it', () => {
    const plan = planInstall(registry, ['button', 'dialog'])
    const focus = plan.files.filter((file) => file.to.endsWith('conventions/focus.module.css'))
    expect(focus).toHaveLength(1)
    expect(new Set(plan.files.map((file) => file.to)).size).toBe(plan.files.length)
  })

  it('asks for the external packages the closure imports, at the tested ranges', () => {
    const plan = planInstall(registry, ['dialog'])
    expect(plan.packages['@radix-ui/react-dialog']).toMatch(/^\^\d/)
    // Always the install boundary: the React foundation vendored source
    // imports by name, the rules the generated lint configs import, and the
    // engine both are built on. The rules are a dev dependency, because only
    // the lint configs load them.
    expect(plan.packages['@polymorph/react']).toBe(`^${registry.version}`)
    expect(plan.packages['@polymorph/engine']).toBe(registry.packages['@polymorph/engine'])
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
    })
    expect(plan.packages['@polymorph/rules']).toBeUndefined()
    // Never the engine's internals. `vendorable-imports` forbids a component
    // from importing `@polymorph/theme`, so the consumer is not told to install
    // it. Nor the vocabulary package, which the vendored source replaces.
    expect(plan.packages['@polymorph/theme']).toBeUndefined()
    expect(plan.packages['@polymorph/react-ui']).toBeUndefined()
    // Nor the recipes, which are copied beside the members that import them.
    expect(plan.packages['@polymorph/recipes']).toBeUndefined()
  })

  it('reads the install boundary from the registry, not from a list of its own', () => {
    // The registry publishes a range for every package published from this
    // repository. A package it adds is asked for without a change here, and
    // the vocabulary, which a vendored install replaces, never is.
    const grown: Registry = {
      ...registry,
      packages: { ...registry.packages, '@polymorph/added': '^1.0.0' },
    }
    const plan = planInstall(grown, ['button'])
    expect(plan.packages['@polymorph/added']).toBe('^1.0.0')
    expect(registry.packages['@polymorph/react-ui']).toBeDefined()
    expect(plan.packages['@polymorph/react-ui']).toBeUndefined()
  })

  it('carries the base layer, which no closure walk can reach', () => {
    // `@polymorph/react-ui`'s package root imports the base layer for its side
    // effect, so a package consumer gets it. A *vendored* consumer deep-imports
    // `controls/Button` and never touches a package root. Without this, their
    // pages would run on user-agent defaults.
    //
    // Following imports cannot find it. It declares no class, so no stylesheet
    // composes from it, and no component names it. Like the ambient CSS Modules
    // declaration, the install must include it explicitly.
    const plan = planInstall(registry, ['button'])
    expect(plan.base?.to).toBe('src/polymorph/base.css')
    expect(plan.base?.from).toBe('packages/recipes/src/base.css')
    expect(plan.files.map((file) => file.to)).not.toContain('src/polymorph/base.css')
  })

  it('carries it for a theme install too, which needs it most', () => {
    // A theme install writes no source, and the only part of a theme that
    // reaches text outside any component is `body { font-family: … }`, which is
    // in the base layer.
    expect(planInstall(registry, ['theme:pastel']).base?.to).toBe('src/polymorph/base.css')
    expect(planInstall(registry, ['palette:orchid']).base?.to).toBe('src/polymorph/base.css')
    expect(planInstall(registry, ['button'], { dir: 'app/ui' }).base?.to).toBe('app/ui/base.css')
  })

  it('carries none when the install resolves to nothing', () => {
    // `icon` ships inside `@polymorph/react`, so there is no vendored tree to
    // start.
    expect(planInstall(registry, ['icon']).base).toBeNull()
  })

  it('is deterministic: the same request gives the same plan', () => {
    const once = planInstall(registry, ['dialog', 'button', 'theme:pastel'])
    const twice = planInstall(registry, ['button', 'theme:pastel', 'dialog'])
    expect(JSON.stringify(once.files)).toBe(JSON.stringify(twice.files))
    expect(once.packages).toEqual(twice.packages)
  })
})

describe('the install directory', () => {
  /*
   * The plan refuses a bad directory, because every directory reaches an
   * install through it. `add`, `update` replaying a manifest, and the MCP
   * server's `get_install_plan` all call it, and two of the three never write a
   * file.
   */
  it('refuses a directory that climbs out of the repository', () => {
    expect(() => planInstall(registry, ['button'], { dir: '../../escape' })).toThrow(
      EscapingDirError,
    )
    expect(() => planInstall(registry, ['button'], { dir: 'app/../../escape' })).toThrow(
      EscapingDirError,
    )
  })

  it('refuses an absolute directory', () => {
    expect(() => planInstall(registry, ['button'], { dir: '/tmp/escape' })).toThrow(
      EscapingDirError,
    )
  })

  it('refuses the empty string, which would make every path absolute', () => {
    // Every install path is `${dir}/…`, so an empty directory does not mean the
    // root. It produces `/controls/Button.tsx`.
    expect(() => planInstall(registry, ['button'], { dir: '' })).toThrow(EscapingDirError)
  })

  it('allows a nested directory, and one that only looks like it escapes', () => {
    expect(planInstall(registry, ['button'], { dir: 'app/ui' }).dir).toBe('app/ui')
    expect(
      planInstall(registry, ['button'], { dir: 'src/../src/polymorph' }).files.length,
    ).toBeGreaterThan(0)
  })
})

describe('themes — a system, the palette it declares, and its fonts', () => {
  it('includes the whole pairing bundle', () => {
    const plan = planInstall(registry, ['theme:pastel'])
    const [system] = plan.systems

    expect(system?.name).toBe('pastel')
    expect(system?.file.to).toBe('src/polymorph/themes/systems/pastel.json')
    // A system on disk with no palette beside it resolves to nothing, so its
    // default palette is included whether or not anybody named it.
    expect(system?.defaultPalette).toBe('amethyst')
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['amethyst'])
    expect(plan.palettes[0]?.file.to).toBe('src/polymorph/themes/palettes/amethyst.json')

    expect(system?.fonts.map((font) => font.package)).toEqual([
      '@fontsource-variable/fira-code',
      '@fontsource-variable/plus-jakarta-sans',
    ])
    for (const font of system?.fonts ?? []) {
      expect(plan.packages[font.package], font.package).toMatch(/^\^\d/)
    }
  })

  it('declares the packages the generated files import, and not the React foundation', () => {
    // A theme install writes `themes/index.ts`, which imports
    // `@polymorph/engine/runtime`, and the lint fragments, which import
    // `@polymorph/rules`. It vendors no member, and nothing it writes imports
    // `@polymorph/react`.
    const plan = planInstall(registry, ['theme:pastel'])
    expect(plan.packages['@polymorph/engine']).toBe(registry.packages['@polymorph/engine'])
    expect(plan.packages['@polymorph/react']).toBeUndefined()
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
    })
  })

  it('keeps theme data out of the source tree, because a theme is data', () => {
    const plan = planInstall(registry, ['theme:journal'])
    expect(plan.files).toEqual([])
    expect(plan.systems[0]?.file.to).toBe('src/polymorph/themes/systems/journal.json')
    expect(plan.palettes[0]?.file.to).toBe('src/polymorph/themes/palettes/umber.json')
  })

  it('writes the two halves of a pairing to sibling directories', () => {
    // Nothing in the schema stops a system and a palette from sharing a name,
    // and in one flat `themes/` directory the two would overwrite each other.
    // The shipped catalogue has no such collision. The split makes sure one
    // would not matter.
    const plan = planInstall(registry, ['theme:harbor'])
    const landed = [...plan.systems, ...plan.palettes].map((entry) => entry.file.to)
    expect(new Set(landed).size).toBe(2)
    expect(landed).toContain('src/polymorph/themes/systems/harbor.json')
    expect(landed).toContain('src/polymorph/themes/palettes/ember.json')
  })

  it('installs two systems without duplicating a shared family', () => {
    const plan = planInstall(registry, ['theme:pastel', 'theme:journal'])
    expect(plan.systems.map((system) => system.name)).toEqual(['pastel', 'journal'])
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['amethyst', 'umber'])
    // Both use Fira Code for mono; the dependency appears once.
    expect(Object.keys(plan.packages).filter((name) => name.includes('fira-code'))).toHaveLength(1)
  })
})

describe('palettes — the colour half, on its own', () => {
  it('carries one file and no fonts, because a palette declares none', () => {
    const plan = planInstall(registry, ['palette:orchid'])

    expect(plan.systems).toEqual([])
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['orchid'])
    expect(plan.palettes[0]?.file.to).toBe('src/polymorph/themes/palettes/orchid.json')
    expect(plan.files).toEqual([])
    // Fonts belong to the system, so a palette brings none. It still brings
    // the engine, whose runtime the generated theme module imports, and the
    // rules, which the generated lint configs import. It vendors no member, so
    // it does not bring the React foundation.
    expect(plan.packages).toEqual({
      '@polymorph/engine': registry.packages['@polymorph/engine'],
    })
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
    })
  })

  it('adds a palette beside a system that did not declare it', () => {
    // The cross-pairing case, which is the reason for the split: orchid is pop's
    // default, and pastel may use it.
    const plan = planInstall(registry, ['theme:pastel', 'palette:orchid'])
    expect(plan.systems.map((system) => system.name)).toEqual(['pastel'])
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['amethyst', 'orchid'])
  })

  it('adds no note when a system already brought the palette asked for', () => {
    // This is the bundle, not a duplicate request. Only a name typed twice gets
    // a note. Otherwise `update` would report one on every run.
    const bundled = planInstall(registry, ['theme:pastel', 'palette:amethyst'])
    expect(bundled.notes).toEqual([])
    expect(bundled.palettes.map((palette) => palette.name)).toEqual(['amethyst'])

    const twice = planInstall(registry, ['palette:orchid', 'palette:orchid'])
    expect(twice.notes.join(' ')).toContain('asked for twice')
    expect(twice.palettes).toHaveLength(1)
  })
})

describe('names that are not quite right', () => {
  it('takes a component by any spelling of its name', () => {
    for (const spelling of ['DatePicker', 'date-picker', 'datepicker', 'Date-Picker']) {
      expect(planInstall(registry, [spelling]).requested, spelling).toEqual(['DatePicker'])
    }
  })

  it('points a bare theme name at the prefixed form', () => {
    // Worth catching, because `polymorph add pastel` is the natural thing to
    // type and the prefix rule makes it wrong.
    expect(() => planInstall(registry, ['pastel'])).toThrow(UnknownItemError)
    expect(() => planInstall(registry, ['pastel'])).toThrow('"theme:pastel"')
    expect(() => planInstall(registry, ['orchid'])).toThrow('"palette:orchid"')
    // Systems are checked first, so a name that is both resolves to the
    // pairing, which is what one word most likely means. The palette stays
    // reachable under its own prefix.
    expect(() => planInstall(registry, ['harbor'])).toThrow('"theme:harbor"')
  })

  it('points a half asked for under the other half’s prefix at its own', () => {
    expect(() => planInstall(registry, ['theme:orchid'])).toThrow('"palette:orchid"')
    expect(() => planInstall(registry, ['palette:pastel'])).toThrow('"theme:pastel"')
    // It guesses nothing else. A prefixed name that is neither gets no component
    // suggestion, because `theme:button` is not a near miss.
    expect(() => planInstall(registry, ['theme:zeppelin'])).toThrow(UnknownItemError)
    expect(() => planInstall(registry, ['theme:zeppelin'])).not.toThrow('did you mean')
  })

  it('answers a renamed system with the name it has now', () => {
    // The registry records the rename, so the suggestion is the system itself
    // and not a guess.
    expect(() => planInstall(registry, ['theme:shadcn'])).toThrow('"theme:plain"')
    expect(() => planInstall(registry, ['theme:macos'])).toThrow('"theme:desktop"')
    expect(successor(registry, 'theme:Shadcn')).toBe('theme:plain')
    expect(successor(registry, 'theme:pastel')).toBeNull()
    expect(successor(registry, 'Button')).toBeNull()
  })

  it('completes a prefix', () => {
    expect(() => planInstall(registry, ['date'])).toThrow('"DatePicker"')
  })

  it('refuses an unknown name without guessing', () => {
    const error = (() => {
      try {
        // A name no member, system or palette uses.
        planInstall(registry, ['zeppelin'])
        return null
      } catch (thrown) {
        return thrown as UnknownItemError
      }
    })()

    expect(error).toBeInstanceOf(UnknownItemError)
    expect(error?.suggestion).toBeNull()
    expect(error?.message).not.toContain('did you mean')
  })

  it('says a member that ships in the React foundation is installed, not vendored', () => {
    const plan = planInstall(registry, ['icon'])
    expect(plan.files).toEqual([])
    expect(plan.notes.join(' ')).toContain('ships inside @polymorph/react')
    expect(Object.keys(plan.packages)).toEqual(['@polymorph/react'])
    // Nothing lands, so no lint config is generated and the rules are not asked for.
    expect(plan.devPackages).toEqual({})
  })
})

/**
 * The exception ladder's primitives, installable by the same command whose
 * rules point at them.
 *
 * `polymorph/no-raw-styles` answers a style decision with rungs 1, 3 and 4.
 * Rung 4 is a `<Bespoke>` zone, and a consumer who vendors the vocabulary has
 * no package root to import it from. The registry publishes the primitives'
 * closure so that `polymorph add bespoke` can install it. Without that, the
 * only way to reach the rung the rules name would be to copy two files by hand
 * and write their hashes into `polymorph.json` by hand.
 */
describe('the exception ladder’s primitives', () => {
  it('vendors a Bespoke zone like any member: source, stylesheet, support, base', () => {
    const plan = planInstall(registry, ['bespoke'])
    const landed = plan.files.map((file) => file.to)

    expect(plan.requested).toEqual(['Bespoke'])
    expect(plan.components).toEqual(['Bespoke'])
    expect(landed).toContain('src/polymorph/exceptions/Bespoke.tsx')
    // `display: contents` is in the module. Without it the boundary generates a
    // box, and declaring an exception would shift the content it wraps.
    expect(landed).toContain('src/polymorph/exceptions/bespoke.module.css')
    expect(landed).toContain('src/polymorph/css-modules.d.ts')
    expect(plan.base?.to).toBe('src/polymorph/base.css')
    // It imports React and its own stylesheet and nothing else, so the only
    // dependencies the install writes are the boundary every vendored tree
    // carries.
    expect(Object.keys(plan.packages)).toEqual(['@polymorph/engine', '@polymorph/react'])
    expect(Object.keys(plan.devPackages)).toEqual(['@polymorph/rules'])
  })

  it('installs both scopes from the one file that declares them, and reports it', () => {
    // `Scopes.tsx` declares the two rung-2 primitives. Asking for one copies the
    // file, which brings the other. The other is reported as `came along`,
    // because a report that named only DensityScope would misstate the tree.
    const plan = planInstall(registry, ['density-scope'])
    expect(plan.requested).toEqual(['DensityScope'])
    expect(plan.components).toEqual(['DensityScope', 'ToneScope'])
    expect(plan.files.filter((file) => file.to.endsWith('exceptions/Scopes.tsx'))).toHaveLength(1)
    expect(plan.files.map((file) => file.to)).not.toContain('src/polymorph/exceptions/Bespoke.tsx')

    const both = planInstall(registry, ['density-scope', 'tone-scope'])
    expect(both.requested).toEqual(['DensityScope', 'ToneScope'])
    expect(both.files.filter((file) => file.to.endsWith('exceptions/Scopes.tsx'))).toHaveLength(1)
  })

  it('takes a primitive by any spelling, and completes a prefix to it', () => {
    for (const spelling of [
      'Bespoke',
      'bespoke',
      'BESPOKE',
      'ToneScope',
      'tone-scope',
      'tonescope',
    ]) {
      expect(planInstall(registry, [spelling]).requested, spelling).toHaveLength(1)
    }
    expect(() => planInstall(registry, ['besp'])).toThrow('"Bespoke"')
  })

  it('reports them as shipped, so an update does not prune the zone', () => {
    // `update` replays the manifest's names through `shipped`, and drops a name
    // it does not recognise along with its files. If `shipped` did not recognise
    // the primitives, the first update after installing a zone would delete it.
    expect(shipped(registry, 'Bespoke')).toBe(true)
    expect(shipped(registry, 'density-scope')).toBe(true)
    expect(shipped(registry, 'zeppelin')).toBe(false)
  })
})
