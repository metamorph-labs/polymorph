import { resolve } from 'node:path'

import {
  ANGULAR_VOCABULARY_MODULE,
  SOLID_VOCABULARY_MODULE,
  SVELTE_VOCABULARY_MODULE,
  VOCABULARY_MODULE,
  VUE_VOCABULARY_MODULE,
} from '@polymorph/rules'
import { describe, expect, it } from 'vitest'

import { existsSync, readFileSync } from 'node:fs'

import { buildRegistry, type Registry } from './build'
import { renderSystemCard } from './card'
import {
  codeFrameworkOf,
  FRAMEWORK_EXTENSIONS,
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_NAMES,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  frameworkFaults,
  frameworkOfPath,
  MAPPED_FRAMEWORKS,
  unionParts,
  vueBinding,
  type Framework,
  type FrameworkDocument,
  type MappedFramework,
} from './frameworks'
import { NO_BUILD_FILES } from './install'
import { searchRegistry } from './search'
import { openUiProgram, readFrameworkDocuments } from './vocabulary'

/**
 * The framework map's law, and the React-to-Vue reading of a prop.
 *
 * The map says which members each web framework's vocabulary ships
 * (`design/frameworks/{vue,svelte,solid,angular,elements}.json`; React is implicit and
 * always native). The
 * claims: each file has the map's shape and names its own framework; every
 * gallery member has an entry, and no entry names something that is neither a
 * member nor a ladder primitive; the entries are sorted by name; no entry still
 * has the scaffold's `DECIDE` placeholder; and an absent entry says why, in
 * words. `frameworkFaults` is the function the build runs, so a new member
 * without an entry fails here by name and fails `pnpm registry` with the same
 * sentence.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const ui = openUiProgram(ROOT)
const members = ui.components.map(({ name }) => name)
const primitives = ['Bespoke', 'DensityScope', 'ThirdParty', 'ToneScope']
const documents = readFrameworkDocuments(ROOT)
const registry = buildRegistry(ROOT)

describe('the framework map covers the vocabulary', () => {
  it('reads the whole gallery and a file for each framework but React, so a pass is meaningful', () => {
    expect(members.length).toBeGreaterThan(100)
    expect(FRAMEWORKS).toEqual(['react', 'vue', 'svelte', 'solid', 'angular', 'elements'])
    expect(MAPPED_FRAMEWORKS).toEqual(['vue', 'svelte', 'solid', 'angular', 'elements'])
    for (const framework of MAPPED_FRAMEWORKS) expect(documents[framework], framework).toBeDefined()
  })

  it('is lawful', () => {
    expect(frameworkFaults(members, documents, primitives)).toEqual([])
  })

  it('publishes an entry for every member and primitive in every framework, React always native', () => {
    expect(registry.frameworks).toEqual([...FRAMEWORKS])
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      expect(member.frameworks.react, member.name).toEqual({ status: 'native' })
      for (const framework of MAPPED_FRAMEWORKS) {
        const entry = member.frameworks[framework]
        expect(entry.status, `${member.name} in ${framework}`).toMatch(/^(native|absent)$/)
        if (entry.status === 'absent') {
          expect(entry.reason?.trim(), `${member.name} in ${framework}`).toBeTruthy()
        }
      }
    }
  })

  it('reads a primitive the file does not name as absent, saying so', () => {
    for (const framework of MAPPED_FRAMEWORKS) {
      const map = documents[framework] as FrameworkDocument
      for (const primitive of registry.exceptions.primitives) {
        if (Object.hasOwn(map.members, primitive.name)) continue
        expect(primitive.frameworks[framework]).toEqual({
          status: 'absent',
          reason: `design/frameworks/${framework}.json has no entry for it`,
        })
      }
    }
  })

  it('names the packages the rules govern as each framework’s vocabulary', () => {
    // The red rules do not read an elements page, which is HTML, so no rule names its vocabulary.
    const { elements, ...governed } = FRAMEWORK_VOCABULARY
    expect(governed).toEqual({
      react: VOCABULARY_MODULE,
      vue: VUE_VOCABULARY_MODULE,
      svelte: SVELTE_VOCABULARY_MODULE,
      solid: SOLID_VOCABULARY_MODULE,
      angular: ANGULAR_VOCABULARY_MODULE,
    })
    expect(elements).toBe('@polymorph/elements-ui')
    expect(FRAMEWORK_FOUNDATION.elements).toBe('@polymorph/elements')
  })

  it('names the framework a path’s extension names alone, and none for TSX or HTML', () => {
    expect(frameworkOfPath('src/Inbox.vue')).toBe('vue')
    expect(frameworkOfPath('src/Inbox.svelte')).toBe('svelte')
    expect(frameworkOfPath('src/Inbox.ts')).toBe('angular')
    expect(frameworkOfPath('src/inbox.d.ts')).toBeUndefined()
    expect(frameworkOfPath('src/Inbox.tsx')).toBeUndefined()
    expect(frameworkOfPath('public/inbox.html')).toBeUndefined()
    expect(FRAMEWORK_EXTENSIONS.solid).toBe(FRAMEWORK_EXTENSIONS.react)
    expect(FRAMEWORK_EXTENSIONS.elements).toBe('.html')
  })

  it('reads a .html file as an elements page only in a project that uses the elements and not Angular', () => {
    const project =
      (...used: Framework[]) =>
      (framework: Framework): boolean =>
        used.includes(framework)
    expect(codeFrameworkOf(undefined, 'public/inbox.html', project('elements'))).toBe('elements')
    // An Angular template stays one: without a project, in an Angular project, and in a
    // project that uses both vocabularies.
    expect(codeFrameworkOf(undefined, 'src/inbox.component.html', null)).toBe('angular')
    expect(codeFrameworkOf(undefined, 'src/inbox.component.html', project('angular'))).toBe(
      'angular',
    )
    expect(
      codeFrameworkOf(undefined, 'src/inbox.component.html', project('angular', 'elements')),
    ).toBe('angular')
    expect(codeFrameworkOf(undefined, 'src/inbox.html', project('react'))).toBe('angular')
    // The framework a caller names wins, and the project answers nothing else differently.
    expect(codeFrameworkOf('angular', 'public/inbox.html', project('elements'))).toBe('angular')
    expect(codeFrameworkOf(undefined, 'src/Inbox.tsx', project('elements'))).toBe('react')
  })
})

describe('the law can fail', () => {
  /** A copy of the real Vue document, changed in one way per test, beside the other real maps. */
  const broken = (mutate: (draft: FrameworkDocument) => void): string[] => {
    const draft = JSON.parse(JSON.stringify(documents.vue)) as FrameworkDocument
    mutate(draft)
    return frameworkFaults(members, { ...documents, vue: draft }, primitives)
  }

  it('names a member missing from the file', () => {
    expect(
      broken((draft) => {
        delete draft.members['Button']
      }),
    ).toEqual([
      'design/frameworks/vue.json: no entry for Button — every member has one in every framework',
    ])
  })

  it('names an entry for something that is not a member, and accepts a primitive', () => {
    expect(
      broken((draft) => {
        draft.members = { ...draft.members, Modal: { status: 'native' } }
        draft.members = Object.fromEntries(
          Object.entries(draft.members).sort(([a], [b]) => a.localeCompare(b)),
        )
      }),
    ).toEqual(['design/frameworks/vue.json: Modal is not a member of the vocabulary'])
    expect(
      broken((draft) => {
        draft.members = Object.fromEntries(
          Object.entries({ ...draft.members, Bespoke: { status: 'native' as const } }).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
        )
      }),
    ).toEqual([])
  })

  it('refuses a file that is not sorted by name', () => {
    const faults = broken((draft) => {
      const { Accordion, ...rest } = draft.members
      draft.members = { ...rest, Accordion: Accordion as FrameworkDocument['members'][string] }
    })
    expect(faults.join('\n')).toContain('entries are not sorted by name')
  })

  it('refuses a missing file, a wrong shape, an unknown status and a file that names another framework', () => {
    expect(frameworkFaults(members, {}, primitives)).toEqual(
      MAPPED_FRAMEWORKS.map(
        (framework) =>
          `design/frameworks/${framework}.json: missing — every framework but React has a map`,
      ),
    )
    const { svelte: _svelte, ...withoutSvelte } = documents
    expect(frameworkFaults(members, withoutSvelte, primitives)).toEqual([
      'design/frameworks/svelte.json: missing — every framework but React has a map',
    ])
    expect(
      broken((draft) => {
        ;(draft.members['Button'] as { status: string }).status = 'adapted'
      }).join('\n'),
    ).toContain('design/frameworks/vue.json.members.Button.status: "adapted" is not one of')
    expect(
      broken((draft) => {
        ;(draft as { framework: string }).framework = 'qwik'
      }).join('\n'),
    ).toContain('design/frameworks/vue.json.framework: "qwik" is not one of')
    expect(
      broken((draft) => {
        ;(draft as { framework: string }).framework = 'svelte'
      }),
    ).toEqual([
      'design/frameworks/vue.json: names its framework "svelte" — the file is the map for vue',
    ])
  })

  it('wants an absent entry to say why, in words', () => {
    expect(
      broken((draft) => {
        draft.members['Kbd'] = { status: 'absent' }
        draft.members['Badge'] = { status: 'absent', reason: '  ' }
      }),
    ).toEqual([
      'design/frameworks/vue.json: Badge has a blank reason — say why, or leave `reason` out of a native entry',
      'design/frameworks/vue.json: Kbd is absent and does not say why (`reason`)',
    ])
  })

  it.each(MAPPED_FRAMEWORKS)(
    'refuses a native member whose %s install would bring a member absent there',
    (framework) => {
      // Two members marked absent in a copy of the map, so the case does not
      // depend on which members the live map marks absent.
      const draft = JSON.parse(JSON.stringify(documents[framework])) as FrameworkDocument
      draft.members['Badge'] = { status: 'absent', reason: 'no shell yet' }
      draft.members['Kbd'] = { status: 'absent', reason: 'no shell yet' }
      // `brings` is what the build reads from the framework's tree: each
      // member's closure, its fixture's included.
      const composes = (brings: Record<string, string[]>) =>
        frameworkFaults(members, { ...documents, [framework]: draft }, primitives, {
          [framework]: brings,
        })
      expect(composes({ Dialog: ['Button'], Tabs: ['Separator'] })).toEqual([])
      expect(composes({ Dialog: ['Button', 'Badge', 'Kbd'] })).toEqual([
        `design/frameworks/${framework}.json: Dialog is native but composes Badge and Kbd, ` +
          `absent in ${framework} — an install of it would copy files ${framework} does not ` +
          'ship; give them a shell, or mark Dialog absent and say why',
      ])
      // An absent member brings nothing an install copies, so it is not checked.
      expect(composes({ Badge: ['Kbd'] })).toEqual([])
    },
  )

  it('refuses the scaffold’s DECIDE placeholder', () => {
    expect(
      broken((draft) => {
        draft.members['Kbd'] = { status: 'absent', reason: 'DECIDE: is there a Vue shell?' }
      }),
    ).toEqual([
      'design/frameworks/vue.json: Kbd still has the scaffold’s DECIDE placeholder — decide whether vue ships it',
    ])
  })
})

/**
 * The frameworks an install vendors members in. An element copies nothing: a page loads every
 * element from the files `polymorph init` copies, and its shells are read below.
 */
const VENDORING = MAPPED_FRAMEWORKS.filter(
  (framework): framework is Exclude<MappedFramework, 'elements'> => framework !== 'elements',
)
type Vendoring = (typeof VENDORING)[number]

/** The extension of a member's file in each framework's tree. */
const MEMBER_EXTENSIONS: Record<Vendoring, string> = {
  vue: '.vue',
  svelte: '.svelte',
  solid: '.tsx',
  angular: '.ts',
}

/** The extension of a member's fixture in each framework's tree. */
const FIXTURE_EXTENSIONS: Record<Vendoring, string> = {
  vue: '.ts',
  svelte: '.svelte',
  solid: '.tsx',
  angular: '.ts',
}

/** The package a framework's Zag adapter is: `@zag-js/vue`, or the Angular foundation. */
const ZAG_ADAPTERS: Record<Vendoring, string> = {
  vue: '@zag-js/vue',
  svelte: '@zag-js/svelte',
  solid: '@zag-js/solid',
  angular: '@polymorph/angular',
}

/** The package that is the framework itself, which a shell never ranges. */
const ITSELF: Record<Vendoring, string> = {
  vue: 'vue',
  svelte: 'svelte',
  solid: 'solid-js',
  angular: '@angular/core',
}

/** The `@zag-js/core` a framework's foundation declares, when it pins one exact version, or `null`. */
const pinnedCore = (framework: Vendoring): string | null => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(
        ROOT,
        FRAMEWORK_FOUNDATION[framework].replace('@polymorph/', 'packages/'),
        'package.json',
      ),
      'utf8',
    ),
  ) as { dependencies?: Record<string, string> }
  const core = manifest.dependencies?.['@zag-js/core']
  return core !== undefined && /^\d+\.\d+\.\d+$/.test(core) ? core : null
}

/** A member's file in a framework's tree: `packages/svelte-ui/src/overlays/Tabs.svelte`. */
const memberFile = (framework: Vendoring, dir: string, name: string): string =>
  `${registry.vendor.frameworks[framework].root}/${dir}/${name}${MEMBER_EXTENSIONS[framework]}`

describe.each(VENDORING)('each member native in %s publishes its shell', (framework) => {
  const tree = registry.vendor.frameworks[framework]
  const natives = [...registry.components, ...registry.exceptions.primitives].filter(
    (member) => member.frameworks[framework].status === 'native',
  )
  const shell = (name: string) =>
    natives.find((member) => member.name === name)?.frameworks[framework].shell

  it('names the tree and its support files, which exist', () => {
    expect(tree.root).toBe(`packages/${framework}-ui/src`)
    for (const file of tree.support) expect(existsSync(resolve(ROOT, file)), file).toBe(true)
  })

  it('gives every native member a shell whose files exist, and no absent member one', () => {
    expect(natives.length).toBeGreaterThan(30)
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      const { status, shell } = member.frameworks[framework]
      expect(shell !== undefined, member.name).toBe(status === 'native')
      expect(member.frameworks.react.shell, member.name).toBeUndefined()
    }
    for (const member of natives) {
      const shell = member.frameworks[framework].shell
      for (const file of [...(shell?.dependencies.files ?? []), shell?.states ?? tree.root]) {
        expect(existsSync(resolve(ROOT, file)), `${member.name}: ${file}`).toBe(true)
      }
      for (const file of shell?.dependencies.files ?? []) {
        expect(
          file.startsWith(`${tree.root}/`) || file.startsWith(`${registry.vendor.recipes.root}/`),
          `${member.name}: ${file}`,
        ).toBe(true)
      }
    }
  })

  it('reads a compound part as its member’s, from the index that attaches it', () => {
    expect(shell('Tabs')?.sources).toEqual([
      memberFile(framework, 'overlays', 'Tabs'),
      memberFile(framework, 'overlays', 'TabsContent'),
    ])
    expect(shell('Avatar')?.sources).toContain(memberFile(framework, 'structure', 'AvatarGroup'))
    expect(shell('Menu')?.dependencies.files).toContain(
      memberFile(framework, 'overlays', 'MenuSubmenu'),
    )
    expect(shell('Tabs')?.dependencies.components).toEqual(['Badge'])
    expect(shell('Tabs')?.dependencies.packages).toEqual(
      expect.arrayContaining([
        FRAMEWORK_FOUNDATION[framework],
        '@zag-js/tabs',
        ZAG_ADAPTERS[framework],
      ]),
    )
  })

  it('reads the fixture as the member’s, from its scripts in a single-file component', () => {
    expect(shell('Button')?.states).toBe(
      `${tree.root}/controls/button.states${FIXTURE_EXTENSIONS[framework]}`,
    )
    // Button's fixture lays its entries out in an Inline, so the install copies it.
    expect(shell('Button')?.dependencies.files).toContain(memberFile(framework, 'layout', 'Inline'))
  })

  it('reads Icon as the foundation’s, with nothing to copy', () => {
    expect(shell('Icon')).toMatchObject({ origin: 'installed', sources: [] })
    expect(shell('Icon')?.dependencies.files).toEqual([])
  })

  it('reads what the member composes in the framework, not what the React one does', () => {
    // React's FormField composes Toast for its toast mode; no other framework's shell does.
    const formField = registry.components.find((member) => member.name === 'FormField')
    if (formField?.frameworks[framework].status !== 'native') return
    expect(formField.dependencies.components).toContain('Toast')
    expect(
      formField.frameworks[framework].shell?.dependencies.files.some((file) => /Toast/.test(file)),
    ).toBe(false)
  })

  it('ranges every package a shell imports with its framework, never the framework itself', () => {
    const itself = ITSELF[framework]
    for (const member of natives) {
      for (const name of member.frameworks[framework].shell?.dependencies.packages ?? []) {
        expect(tree.packages[name], `${member.name}: ${name}`).toBeDefined()
        expect(name, member.name).not.toBe(itself)
      }
    }
    // The foundation's `useMachine` interprets every machine with the foundation's own
    // `@zag-js/core`. When the foundation pins that core to one version, a machine of any other
    // version would run on a core it was not built with, so every Zag package the framework
    // installs is pinned to the same version. Every other range is a caret range.
    const core = pinnedCore(framework)
    expect(Object.keys(tree.packages).length).toBeGreaterThan(2)
    for (const [name, range] of Object.entries(tree.packages)) {
      if (core !== null && name.startsWith('@zag-js/')) expect(range, name).toBe(core)
      else expect(range, name).toMatch(/^\^\d/)
    }
  })
})

describe('each member native in elements publishes its shell, which copies nothing', () => {
  const tree = registry.vendor.frameworks.elements
  const natives = [...registry.components, ...registry.exceptions.primitives].filter(
    (member) => member.frameworks.elements.status === 'native',
  )
  const shell = (name: string) =>
    natives.find((member) => member.name === name)?.frameworks.elements.shell
  const definition = (dir: string, name: string) => `${tree.root}/${dir}/${name}.ts`

  it('names the tree, no support file, and the files a page with no build loads', () => {
    expect(tree.root).toBe('packages/elements-ui/src')
    expect(tree.support).toEqual([])
    expect(tree.noBuild).toEqual(NO_BUILD_FILES)
    expect(tree.noBuild?.dir).toBe('packages/elements-ui/dist/cdn')
    for (const framework of VENDORING) {
      expect(registry.vendor.frameworks[framework].noBuild, framework).toBeUndefined()
    }
  })

  it('gives every native member an installed shell with nothing to copy, and no absent member one', () => {
    expect(natives.length).toBeGreaterThan(30)
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      const { status, shell } = member.frameworks.elements
      expect(shell !== undefined, member.name).toBe(status === 'native')
    }
    for (const member of natives) {
      const own = member.frameworks.elements.shell
      expect(own?.origin, member.name).toBe('installed')
      expect(own?.dependencies, member.name).toEqual({ components: [], packages: [], files: [] })
      for (const file of [...(own?.sources ?? []), own?.states ?? tree.root]) {
        expect(existsSync(resolve(ROOT, file)), `${member.name}: ${file}`).toBe(true)
      }
    }
  })

  it('names each element’s definition module, then its parts’, and Icon’s as the foundation’s', () => {
    expect(shell('Tabs')?.sources).toEqual([
      definition('overlays', 'Tabs'),
      definition('overlays', 'TabsContent'),
    ])
    expect(shell('Table')?.sources).toContain(definition('structure', 'TableRow'))
    expect(shell('Button')?.states).toBe(`${tree.root}/controls/button.states.ts`)
    expect(shell('Icon')).toMatchObject({ origin: 'installed', sources: [] })
  })

  it('ranges the foundation and the vocabulary, for an app with a build', () => {
    expect(Object.keys(tree.packages)).toEqual(['@polymorph/elements', '@polymorph/elements-ui'])
    for (const range of Object.values(tree.packages)) expect(range).toMatch(/^\^\d/)
  })
})

describe('a React prop, read in Vue', () => {
  const prop = (name: string, type: string) => vueBinding({ name, type })

  it('keeps a plain prop under its own name', () => {
    expect(prop('label', 'string')).toEqual({ kind: 'prop', name: 'label' })
    expect(prop('getRowId', '(row: Row) => string')).toEqual({ kind: 'prop', name: 'getRowId' })
    expect(prop('emptyState', 'EmptyStateProps')).toEqual({ kind: 'prop', name: 'emptyState' })
    expect(prop('aria-label', 'string | undefined')).toEqual({ kind: 'prop', name: 'aria-label' })
  })

  it('reads `onFoo` as the event `foo`', () => {
    expect(prop('onClick', '((event: MouseEvent<HTMLButtonElement>) => void) | undefined')).toEqual(
      { kind: 'event', name: 'click' },
    )
    expect(prop('onSortChange', '((sort: DataTableSort) => void) | undefined')).toEqual({
      kind: 'event',
      name: 'sortChange',
    })
  })

  it('reads `children` as the default slot and a node prop as the named slot', () => {
    expect(prop('children', 'ReactNode')).toEqual({ kind: 'slot', name: 'default' })
    expect(prop('actions', 'ReactNode')).toEqual({ kind: 'slot', name: 'actions' })
    expect(
      prop(
        'trigger',
        'ReactElement<{ onClick?: ((event: MouseEvent<HTMLElement, MouseEvent>) => void) | undefined; }, string | JSXElementConstructor<any>> | undefined',
      ),
    ).toEqual({ kind: 'slot', name: 'trigger' })
  })

  it('reads a render prop as the scoped slot', () => {
    expect(prop('renderItem', '((item: Item) => ReactNode) | undefined')).toEqual({
      kind: 'scoped-slot',
      name: 'renderItem',
    })
    expect(prop('children', '(state: { open: boolean }) => ReactNode')).toEqual({
      kind: 'scoped-slot',
      name: 'default',
    })
  })

  it('splits a union only at its top level', () => {
    expect(unionParts('((value: string | null) => void) | undefined')).toEqual([
      '((value: string | null) => void)',
    ])
    expect(unionParts('"a|b" | Record<string, number | null> | null')).toEqual([
      '"a|b"',
      'Record<string, number | null>',
      'null',
    ])
  })

  it('reads every prop the registry publishes without throwing, and finds each kind', () => {
    const kinds = new Set<string>()
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      for (const entry of member.props) kinds.add(vueBinding(entry).kind)
    }
    // DataTable's `rowDetail` is the vocabulary's render prop.
    expect([...kinds].sort()).toEqual(['event', 'prop', 'scoped-slot', 'slot'])
  })
})

describe('the tools answer per framework', () => {
  /** The registry with every member native in every framework: what it becomes once every shell exists. */
  const allNative: Registry = {
    ...registry,
    components: registry.components.map((component) => ({
      ...component,
      frameworks: {
        ...component.frameworks,
        ...Object.fromEntries(MAPPED_FRAMEWORKS.map((each) => [each, { status: 'native' }])),
      },
    })),
  }

  /** How each framework's card says a prop reads. */
  const reading: Record<MappedFramework, string> = {
    vue: '`onFoo` is `@foo`, a node prop is slot `#foo`',
    svelte: 'Props keep their React names; a node prop is snippet `foo`',
    solid: 'Props keep their React names; a node prop is a `JSX.Element`',
    angular: '`onFoo` is `(foo)`, a node prop is `slot="foo"`',
    elements:
      'a prop is its kebab attribute (`icon-only`), data a JSON attribute, a node prop a child ' +
      'with `slot="foo"`, `onFoo` the event `poly-foo`, and a function a property set from script',
  }

  it.each(MAPPED_FRAMEWORKS)(
    'leaves members absent in %s out of its card, and says how a prop reads',
    (framework) => {
      const card = renderSystemCard(registry, { framework })
      expect(card).toContain(`imports members from \`${FRAMEWORK_VOCABULARY[framework]}\``)
      // A page with no build installs nothing: it loads the files `polymorph init` copies.
      expect(card).toContain(
        framework === 'elements'
          ? 'loads the files `polymorph init --framework elements` copies'
          : `installs \`@polymorph/engine\`, \`${FRAMEWORK_FOUNDATION[framework]}\``,
      )
      expect(card.replace(/\s+/g, ' ')).toContain(reading[framework])
      for (const component of registry.components) {
        const row = `- **${component.name}** `
        if (component.frameworks[framework].status === 'absent') expect(card).not.toContain(row)
      }
      expect(renderSystemCard(allNative, { framework })).toContain('- **Button** ')
    },
  )

  it.each(MAPPED_FRAMEWORKS)(
    'states the %s member contract, and no sentence that holds only in React',
    (framework) => {
      // A Vue, Svelte, Solid or Angular member takes `class` and `style` where a
      // React one takes `className`; no other framework has a client directive.
      // A member is still added once, in React, and generated from its description.
      const card = renderSystemCard(registry, { framework }).replace(/\s+/g, ' ')
      expect(card).not.toContain('`className`')
      expect(card).not.toContain('use client')
      // Angular's host element and an element take a static `class` or `style`, so
      // their cards say it is outside the member's contract instead (`card.test.ts`).
      expect(card).toMatch(
        framework === 'angular'
          ? /`class` or `style` on a member is outside its contract/
          : framework === 'elements'
            ? /`class` or `style` on it is outside its contract/
            : /`class`.*`style` .*on a member does nothing/,
      )
      expect(card).toContain(
        `from which \`pnpm shells\` writes the ${FRAMEWORK_NAMES[framework]} one`,
      )
      expect(card).toContain('`pnpm new:member <Name>`')
    },
  )

  it.each(MAPPED_FRAMEWORKS)(
    'never makes a %s card longer than the React card of the same registry',
    (framework) => {
      // Each framework's paragraph replaces the React one; it adds no section. So
      // the card budget in `card.test.ts` holds for its card once every shell exists.
      const react = renderSystemCard(allNative)
      expect(renderSystemCard(allNative, { framework }).length).toBeLessThanOrEqual(react.length)
    },
  )

  it('renders the React card by default, byte for byte', () => {
    expect(renderSystemCard(registry, { framework: 'react' })).toBe(renderSystemCard(registry))
  })

  it.each(MAPPED_FRAMEWORKS)('searches only what %s ships', (framework) => {
    const absent = registry.components.filter(
      (c) => c.frameworks[framework].status === 'absent',
    ).length
    const all = searchRegistry(registry).length
    expect(searchRegistry(registry, { framework })).toHaveLength(all - absent)
    expect(searchRegistry(allNative, { framework })).toHaveLength(all)
    expect(searchRegistry(registry, { framework: 'react' })).toHaveLength(all)
  })
})
