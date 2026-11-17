import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { compile, compileModule } from 'svelte/compiler'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildSvelteUi, lockSvelteUiDist } from './dist-lock'

/**
 * The published build of `@polymorph/svelte-ui` and the manifest that ships it.
 *
 * A Svelte library ships its components as source, and the consumer's Svelte
 * compiles them (`packages/svelte/scripts/package.mjs`). What a consumer's
 * toolchain reads: every bare import in the shipped source is a dependency or
 * a peer the manifest declares; every member ships as a component with its
 * declarations, and imports its recipe from `@polymorph/recipes`, which
 * publishes the stylesheet it names; the entry imports the base layer; every
 * relative import names a file the package ships; and every component compiles
 * for the browser and for a server render, so a server-rendered application
 * can use the package. It is at the package root, in the `logic` project,
 * because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')
const RECIPES = resolve(PACKAGE, '../recipes/src')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, Record<string, string>>
  files: string[]
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  sideEffects: string[]
  publishConfig: { exports: Record<string, Record<string, string>> }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** Test tooling: the laws, the fixtures, the galleries, the mount helpers and the adapter. */
const tooling = (path: string) => {
  const local = relative(SRC, path)
  return (
    /\.(test|states)\.(ts|svelte)$/.test(local) ||
    /(^|\/)(test-setup|mount|galleries)\.ts$/.test(local) ||
    /(^|\/)MountedEntry\.svelte$/.test(local) ||
    local.startsWith('conformance/') ||
    local.startsWith('testing/')
  )
}

/** Shipped source: what the index reaches. */
const shipped = filesUnder(SRC).filter(
  (path) => /\.(ts|svelte)$/.test(path) && !path.endsWith('.d.ts') && !tooling(path),
)

/** A file's module text: a component's scripts, or the module itself. */
const scriptOf = (path: string, text: string) =>
  path.endsWith('.svelte')
    ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
    : text

/** Every module specifier a file imports or re-exports. */
function specifiersOf(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, scriptOf(path, text), ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (specifier !== undefined && ts.isStringLiteral(specifier)) found.push(specifier.text)
  }
  return found
}

const packageOf = (specifier: string) => {
  const [first, second] = specifier.split('/')
  return specifier.startsWith('@') ? `${first}/${second}` : (first ?? specifier)
}

describe('what the shipped source imports, the manifest declares', () => {
  it('resolves every bare specifier from dependencies or peers', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    const undeclared: string[] = []
    for (const path of shipped) {
      for (const specifier of specifiersOf(path)) {
        if (specifier.startsWith('.')) continue
        if (!declared.has(packageOf(specifier))) {
          undeclared.push(`${packageOf(specifier)} ← ${relative(PACKAGE, path)}`)
        }
      }
    }
    expect(undeclared).toEqual([])
  })

  it('names the recipe each member imports, as a file the recipes package publishes', () => {
    const missing: string[] = []
    for (const path of shipped) {
      for (const specifier of specifiersOf(path)) {
        if (!specifier.startsWith('@polymorph/recipes/')) continue
        const file = resolve(RECIPES, specifier.slice('@polymorph/recipes/'.length))
        if (!existsSync(file)) missing.push(`${specifier} ← ${relative(PACKAGE, path)}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps every stylesheet a bundler may not drop, and ships only what a consumer installs', () => {
    expect(manifest.sideEffects).toContain('**/*.css')
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })
})

describe('the published build', () => {
  let release: () => void

  beforeAll(async () => {
    release = await lockSvelteUiDist('packages/svelte-ui/packaging.test.ts')
    buildSvelteUi()
  }, 600_000)

  afterAll(() => release?.())

  it('lists in sideEffects every published entry whose module imports a stylesheet', () => {
    // An entry outside `sideEffects` is side-effect free to a bundler, which then
    // drops its stylesheet imports, and the application loses the base layer.
    const targets = Object.values(manifest.publishConfig.exports).flatMap((conditions) =>
      Object.values(conditions).filter((target) => target.endsWith('.js')),
    )
    const undeclared = [...new Set(targets)].filter(
      (target) =>
        /^import\s+['"][^'"]+\.css['"];?$/m.test(readFileSync(resolve(PACKAGE, target), 'utf8')) &&
        !manifest.sideEffects.includes(target),
    )
    expect(undeclared).toEqual([])
  })

  it('points every published entry at a file the build wrote, for Svelte and for its types', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      expect(Object.keys(conditions), entry).toEqual(['types', 'svelte', 'default'])
      for (const target of Object.values(conditions)) {
        expect(existsSync(resolve(PACKAGE, target)), `${entry} → ${target}`).toBe(true)
      }
    }
  })

  it('imports the base layer from the entry', () => {
    expect(readFileSync(resolve(DIST, 'index.js'), 'utf8')).toMatch(
      /^import ['"]@polymorph\/recipes\/base\.css['"];?$/m,
    )
  })

  it('ships every member as a component with its declarations, and no test tooling', () => {
    const members = shipped
      .filter((path) => path.endsWith('.svelte'))
      .map((path) => relative(SRC, path))
    expect(members.length).toBeGreaterThan(100)
    for (const member of members) {
      expect(existsSync(resolve(DIST, member)), member).toBe(true)
      expect(existsSync(resolve(DIST, `${member}.d.ts`)), `${member}.d.ts`).toBe(true)
    }
    const built = filesUnder(DIST).map((path) => relative(DIST, path))
    expect(
      built.filter((path) => /\.states\.|galleries|mount|conformance|\.test\./.test(path)),
    ).toEqual([])
  })

  it('names, in every relative import, a file the package ships', () => {
    const unresolved: string[] = []
    for (const path of filesUnder(DIST).filter((file) => /\.(js|svelte|d\.ts)$/.test(file))) {
      for (const specifier of specifiersOf(path)) {
        if (!specifier.startsWith('.')) continue
        const target = resolve(dirname(path), specifier)
        const declaration = path.endsWith('.d.ts')
          ? [target.replace(/\.js$/, '.d.ts'), `${target}.d.ts`]
          : []
        if (![target, ...declaration].some((candidate) => existsSync(candidate))) {
          unresolved.push(`${specifier} ← ${relative(PACKAGE, path)}`)
        }
      }
    }
    expect(unresolved).toEqual([])
  })

  it('compiles every component for the browser and for a server render', () => {
    const faults: string[] = []
    for (const path of filesUnder(DIST)) {
      const source = readFileSync(path, 'utf8')
      for (const generate of ['client', 'server'] as const) {
        try {
          if (path.endsWith('.svelte')) compile(source, { filename: path, generate })
          else if (path.endsWith('.svelte.js')) compileModule(source, { filename: path, generate })
        } catch (error) {
          faults.push(`${relative(PACKAGE, path)} (${generate}): ${String(error)}`)
        }
      }
    }
    expect(faults).toEqual([])
    // Every component is compiled twice, which takes longer than the default timeout under the
    // suite's load.
  }, 120_000)
})
