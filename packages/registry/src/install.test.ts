import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildRegistry } from './build'
import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY, MAPPED_FRAMEWORKS } from './frameworks'
import {
  ANGULAR_PACKAGES,
  ELEMENTS_PACKAGES,
  fileClosure,
  FRAMEWORK_PACKAGES,
  INSTALLED_PACKAGES,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
  readFrameworkPackageVersions,
  readPackageVersions,
  SOLID_PACKAGES,
  SVELTE_PACKAGES,
  VUE_PACKAGES,
} from './install'

/**
 * The published packages, as the registry describes them to an install.
 *
 * `registry.packages` and each framework's `vendor.frameworks.<framework>.packages`
 * are the ranges every front writes into a consumer's `package.json`. For a
 * package published from this repository, the only correct range is a caret on
 * that package's own version: anything wider lets a consumer resolve a release
 * the vocabulary was not built with, and anything else names a version that
 * does not exist yet.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)

interface Manifest {
  name: string
  version: string
  publishConfig?: unknown
  peerDependencies?: Record<string, string>
}

/** What a manifest holds of its ranges on other packages. */
interface Ranged {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** `scripts/published-ranges.mjs`, the publish step's rewrite of a manifest's ranges. */
const { publishedRanges, rangeFaults } = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(ROOT, 'scripts/published-ranges.mjs')).href
)) as {
  publishedRanges: (
    manifest: Ranged,
    published: Record<string, string>,
    bundled?: string[],
  ) => Pick<Ranged, 'dependencies' | 'peerDependencies'>
  rangeFaults: (manifest: Ranged) => string[]
}

const manifestOf = (directory: string): Manifest =>
  JSON.parse(readFileSync(resolve(ROOT, 'packages', directory, 'package.json'), 'utf8')) as Manifest

/** Every workspace package, by name, with the directory it lives in. */
const workspace = new Map(
  readdirSync(resolve(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [manifestOf(entry.name).name, entry.name] as const),
)

describe('the published packages', () => {
  it('ranges each one at a caret on its own manifest version', () => {
    for (const name of INSTALLED_PACKAGES) {
      const directory = workspace.get(name)
      expect(directory, `${name} is a workspace package`).toBeDefined()
      expect(registry.packages[name], name).toBe(`^${manifestOf(directory as string).version}`)
    }
  })

  it('ranges the Vue, Svelte, Solid, Angular and elements packages with their framework, and keeps them out of a React install', () => {
    // `polymorph init --framework <name>` writes their aliases from these ranges. An app
    // with a build that uses the elements installs the elements packages at theirs.
    expect(FRAMEWORK_PACKAGES).toEqual([
      ...VUE_PACKAGES,
      ...SVELTE_PACKAGES,
      ...SOLID_PACKAGES,
      ...ANGULAR_PACKAGES,
      ...ELEMENTS_PACKAGES,
    ])
    expect(
      MAPPED_FRAMEWORKS.flatMap((framework) => [
        FRAMEWORK_FOUNDATION[framework],
        FRAMEWORK_VOCABULARY[framework],
      ]),
    ).toEqual(FRAMEWORK_PACKAGES)
    for (const framework of MAPPED_FRAMEWORKS) {
      for (const name of [FRAMEWORK_FOUNDATION[framework], FRAMEWORK_VOCABULARY[framework]]) {
        const directory = workspace.get(name)
        expect(directory, `${name} is a workspace package`).toBeDefined()
        expect(PUBLISHED_NAMES[name], name).toBeDefined()
        expect(registry.vendor.frameworks[framework].packages[name], name).toBe(
          `^${manifestOf(directory as string).version}`,
        )
        expect(registry.packages[name], name).toBeUndefined()
        expect(INSTALLED_PACKAGES).not.toContain(name)
      }
    }
  })

  it('includes the vocabulary, because an app may install it instead of vendoring it', () => {
    // A vendored install replaces `@polymorph/react-ui` with source and never
    // asks for it. `polymorph init` creates an app that installs it, and writes
    // its alias from this range, so the registry has to publish one.
    expect(INSTALLED_PACKAGES).toContain('@polymorph/react-ui')
    expect(registry.packages['@polymorph/react-ui']).toBe(`^${manifestOf('react-ui').version}`)
  })

  it('names exactly the packages that have a publish configuration', () => {
    // `publishConfig` is what `scripts/publish-packages.mjs` packs a package
    // with. A package that has one and no published name could not be
    // installed, and a name without one would point an alias at nothing.
    const publishable = [...workspace]
      .filter(([, directory]) => manifestOf(directory).publishConfig !== undefined)
      .map(([name]) => name)
      .sort()
    expect(Object.keys(PUBLISHED_NAMES).sort()).toEqual(publishable)
  })

  it('publishes every package under one scope, which one `.npmrc` line can point', () => {
    const scopes = new Set(Object.values(PUBLISHED_NAMES).map((name) => name.split('/')[0]))
    expect(scopes.size).toBe(1)
    expect(PUBLISHED_REGISTRY).toMatch(/^https:\/\//)
  })

  it('is the publish script’s table, not a copy of it', () => {
    // One table of registry names. A second one in the script would agree with
    // this one until a package was added to only one of them.
    const script = readFileSync(resolve(ROOT, 'scripts/publish-packages.mjs'), 'utf8')
    expect(script).toContain('PUBLISHED_NAMES')
    for (const name of Object.values(PUBLISHED_NAMES)) expect(script).not.toContain(`'${name}'`)
  })
})

describe('the ranges a package publishes on the others', () => {
  const published = { '@polymorph/engine': '@metamorph-labs/polymorph-engine' }
  const packed = {
    name: '@metamorph-labs/polymorph-rules',
    dependencies: { '@polymorph/engine': '1.2.3', '@zag-js/core': '^1.0.0', picomatch: '^4.0.0' },
    peerDependencies: { '@polymorph/engine': '1.2.3', eslint: '>=9' },
  }

  it('gives a dependency its registry name, so the package manager can install it', () => {
    expect(publishedRanges(packed, published, ['@zag-js/core']).dependencies).toEqual({
      '@polymorph/engine': 'npm:@metamorph-labs/polymorph-engine@^1.2.3',
      picomatch: '^4.0.0',
    })
  })

  it('gives a peer a range under the name the consumer installs it by', () => {
    // pnpm compares a peer's range as written with the version installed under
    // that name. An alias there is an unmet peer whatever is installed.
    expect(publishedRanges(packed, published).peerDependencies).toEqual({
      '@polymorph/engine': '^1.2.3',
      eslint: '>=9',
    })
    expect(publishedRanges({ name: 'x', dependencies: {} }, published)).toEqual({
      dependencies: {},
    })
  })

  it('refuses a manifest a consumer’s resolver would reject', () => {
    const manifest = { ...packed, ...publishedRanges(packed, published) }
    expect(rangeFaults(manifest)).toEqual([])
    expect(rangeFaults(packed)).toEqual([
      '@metamorph-labs/polymorph-rules depends on unpublished @polymorph/engine',
      '@metamorph-labs/polymorph-rules has the peer @polymorph/engine at "1.2.3", which is not a version range',
    ])
    expect(
      rangeFaults({
        ...manifest,
        peerDependencies: { '@polymorph/engine': 'npm:@metamorph-labs/polymorph-engine@^1.2.3' },
      }),
    ).toEqual([
      '@metamorph-labs/polymorph-rules has the peer @polymorph/engine at ' +
        '"npm:@metamorph-labs/polymorph-engine@^1.2.3", which is not a version range',
    ])
    expect(rangeFaults({ name: 'x', dependencies: { y: 'workspace:*' } })).toEqual([
      'x still has a workspace: range',
    ])
  })

  it('has a workspace peer to rewrite, so the rule is not about nothing', () => {
    const peers = [...workspace]
      .filter(([name]) => name in PUBLISHED_NAMES)
      .flatMap(([name, directory]) =>
        Object.keys(manifestOf(directory).peerDependencies ?? {})
          .filter((peer) => peer in PUBLISHED_NAMES)
          .map((peer) => `${name} -> ${peer}`),
      )
    expect(peers).toContain('@polymorph/rules -> @polymorph/engine')
  })
})

describe('the release version', () => {
  // A release is one number. Every package carries it, the registry reports it
  // and the release tag is `v` and that number. With a number per package, one
  // release names several versions, and a consumer cannot tell from them which
  // packages were released together.
  it('is the version every package carries, and the one the registry reports', () => {
    const byVersion: Record<string, string[]> = {}
    for (const [name, directory] of workspace) {
      ;(byVersion[manifestOf(directory).version] ??= []).push(name)
    }
    expect(Object.keys(byVersion), JSON.stringify(byVersion, null, 2)).toHaveLength(1)
    expect(registry.version).toBe(Object.keys(byVersion)[0])
  })

  it('moves with every package, because changesets holds them in one fixed group', () => {
    const config = JSON.parse(readFileSync(resolve(ROOT, '.changeset/config.json'), 'utf8')) as {
      fixed?: string[][]
    }
    // One pattern over the workspace scope, so a new package joins the group
    // with no edit to the config.
    expect(config.fixed).toEqual([['@polymorph/*']])
    for (const name of workspace.keys()) expect(name).toMatch(/^@polymorph\//)
  })
})

describe('a closure that leaves its trees', () => {
  /** A tree whose member imports a file outside it, and the error the walk throws. */
  const thrown = (tree: string): string => {
    const root = mkdtempSync(resolve(tmpdir(), 'polymorph-closure-'))
    const write = (path: string, text: string) => {
      mkdirSync(dirname(resolve(root, path)), { recursive: true })
      writeFileSync(resolve(root, path), text)
    }
    write(`${tree}/Member.ts`, "export { shared } from '../../shared/shared'\n")
    write('packages/shared/shared.ts', 'export const shared = 1\n')
    try {
      fileClosure(root, [`${tree}/Member.ts`], [tree, 'packages/recipes/src'])
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('names the trees, and blames the packaging rule only where the rule runs', () => {
    // `vendorable-imports` reads `packages/react-ui/src` and no other tree, so
    // only a React member's escape is a fault it should have reported first.
    const react = thrown('packages/react-ui/src')
    expect(react).toContain('packages/shared/shared.ts is reachable by a relative import')
    expect(react).toContain('polymorph/vendorable-imports')
    const angular = thrown('packages/angular-ui/src')
    expect(angular).toContain('outside packages/angular-ui/src and packages/recipes/src')
    expect(angular).not.toContain('vendorable-imports')
  })
})

describe('the ranges an install writes', () => {
  /** A tree holding only the given manifests, and the error `read` throws in it. */
  const thrown = (manifests: Record<string, object>, read: (root: string) => unknown): string => {
    const root = mkdtempSync(resolve(tmpdir(), 'polymorph-ranges-'))
    for (const [directory, manifest] of Object.entries(manifests)) {
      mkdirSync(resolve(root, directory), { recursive: true })
      writeFileSync(resolve(root, directory, 'package.json'), JSON.stringify(manifest))
    }
    try {
      read(root)
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  const react = (workbench: Record<string, string>) => ({
    'packages/react-ui': { version: '1.0.0', dependencies: { 'react-aria': '^3.50.0' } },
    'packages/react': { version: '1.0.0', dependencies: { lucide: '^1.27.0' } },
    'apps/workbench': { dependencies: workbench },
  })

  it('refuses two React manifests that range one package differently, whichever is asked for', () => {
    // An install writes one range per package. Letting the last manifest read win would make
    // that range depend on the order the manifests are merged in.
    const disagree = react({ 'react-aria': '^3.49.0' })
    const message =
      'registry: packages/react-ui/package.json declares react-aria at ^3.50.0 and ' +
      'apps/workbench/package.json declares it at ^3.49.0 — an install writes one range for ' +
      'it, so make them agree'
    expect(thrown(disagree, (root) => readPackageVersions(root, ['react-aria']))).toBe(message)
    expect(thrown(disagree, (root) => readPackageVersions(root, ['lucide']))).toBe(message)
    expect(
      thrown(react({ 'react-aria': '^3.50.0' }), (root) =>
        readPackageVersions(root, ['react-aria']),
      ),
    ).toBe('')
  })

  it('refuses a framework whose foundation and vocabulary range one package differently', () => {
    const solid = (machine: string) => ({
      'packages/solid': { version: '1.0.0', dependencies: { '@zag-js/core': '1.46.0' } },
      'packages/solid-ui': {
        version: '1.0.0',
        dependencies: { '@polymorph/solid': 'workspace:*', '@zag-js/core': machine },
      },
    })
    expect(
      thrown(solid('^1.46.0'), (root) =>
        readFrameworkPackageVersions(root, 'solid', ['@zag-js/core']),
      ),
    ).toBe(
      'registry: packages/solid/package.json declares @zag-js/core at 1.46.0 and ' +
        'packages/solid-ui/package.json declares it at ^1.46.0 — an install writes one range ' +
        'for it, so make them agree',
    )
    expect(
      thrown(solid('1.46.0'), (root) =>
        readFrameworkPackageVersions(root, 'solid', ['@polymorph/solid', '@zag-js/core']),
      ),
    ).toBe('')
  })

  it('reads a framework’s ranges from its own manifests only, so React’s range is never its fallback', () => {
    const manifests = {
      ...react({}),
      'packages/vue': { version: '1.0.0', dependencies: {} },
      'packages/vue-ui': { version: '1.0.0', dependencies: { '@zag-js/vue': '^1.46.0' } },
    }
    expect(
      thrown(manifests, (root) => readFrameworkPackageVersions(root, 'vue', ['react-aria'])),
    ).toBe(
      'registry: the Vue vocabulary imports react-aria but neither @polymorph/vue nor ' +
        '@polymorph/vue-ui declares a version for it — an install of the Vue vocabulary would ' +
        'not resolve it',
    )
    expect(thrown(manifests, (root) => readPackageVersions(root, ['@zag-js/vue']))).toContain(
      'registry: the vocabulary imports @zag-js/vue but no package manifest declares',
    )
  })
})
