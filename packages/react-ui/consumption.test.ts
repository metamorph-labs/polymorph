import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Tests the linked-package contract.
 *
 * `@polymorph/react-ui` can be consumed in two ways (`docs/consuming.md`). Vendoring
 * has its own laws: the vendorable-imports rule, the registry's closure walk,
 * and the scratch-app acceptance test. The other way, where a product depends
 * on the package in place and must not copy the React foundation
 * (`@polymorph/react`), is tested here.
 * Without a test, a linked consumer would find a broken contract only when
 * their build breaks.
 *
 * So this checks what that consumer's toolchain would: that every entry point
 * the `exports` map names exists; that every bare import in the shipped source
 * resolves from what the manifest declares (under pnpm's strictness an
 * undeclared import resolves here, through hoisting, and nowhere else); that
 * every recipe import resolves through `@polymorph/recipes`; and that a name
 * means the same thing from a focused entry point as from the root.
 *
 * It is at the package root rather than in `src/`, for the same reason as
 * `packages/engine/packaging.test.ts`: `src/**` is the browser project, and this
 * is a node test about files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  sideEffects: string[]
  publishConfig: { exports: Record<string, string | Record<string, string>> }
}

/** The recipes package, which every member's stylesheet import names. */
const RECIPES = resolve(PACKAGE, '../recipes')
const recipes = JSON.parse(readFileSync(resolve(RECIPES, 'package.json'), 'utf8')) as {
  name: string
  exports: Record<string, string>
  sideEffects: string[]
}

/**
 * The file a subpath of the recipes package names, through its `exports` map,
 * as a resolver reads it: an exact key, or a key with one `*` whose match is
 * substituted into the target. `null` when no key matches.
 */
function recipeTarget(subpath: string): string | null {
  for (const [key, target] of Object.entries(recipes.exports)) {
    const star = key.indexOf('*')
    if (star === -1) {
      if (key === subpath) return resolve(RECIPES, target)
      continue
    }
    const [head, tail] = [key.slice(0, star), key.slice(star + 1)]
    if (subpath.startsWith(head) && subpath.endsWith(tail) && subpath.length >= key.length - 1) {
      const match = subpath.slice(head.length, subpath.length - tail.length)
      return resolve(RECIPES, target.replace('*', match))
    }
  }
  return null
}

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** The root barrel, and the entry points that must be a subset of it. */
const ROOT_ENTRY = '.'
const FOCUSED_ENTRIES = ['./identity', './identity-signup']

/** Shipped source: everything under `src/` a consumer's bundler can reach, minus tests and their setup. */
function shippedSources(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__screenshots__' ? [] : shippedSources(path)
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || name === 'test-setup.ts') return []
    return [path]
  })
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)
}

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
function packageOf(specifier: string): string {
  const [first, second] = specifier.split('/')
  return specifier.startsWith('@') ? `${first}/${second}` : (first ?? specifier)
}

/** The names a module makes public — values and types alike, because a consumer imports both. */
function exportedNames(path: string): string[] {
  const names: string[] = []
  for (const statement of parse(path).statements) {
    if (!ts.isExportDeclaration(statement) || statement.exportClause === undefined) continue
    if (!ts.isNamedExports(statement.exportClause)) continue
    for (const element of statement.exportClause.elements) names.push(element.name.text)
  }
  return names
}

describe('the exports map', () => {
  it('points every entry at a file that exists', () => {
    for (const [entry, target] of Object.entries(manifest.exports)) {
      expect(existsSync(resolve(PACKAGE, target)), `${entry} → ${target}`).toBe(true)
    }
  })

  it('offers the entry points the README promises, and no deep path', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual([
      '.',
      './galleries',
      './identity',
      './identity-signup',
    ])
    // No `./src/*` or `./*` wildcard: a deep import is not part of the contract,
    // and the map makes it a resolution error.
    for (const entry of Object.keys(manifest.exports))
      expect(entry.includes('*'), entry).toBe(false)
  })

  it('keeps every stylesheet import one a bundler may not drop', () => {
    // The entry points import the base layer, and each built member imports its
    // compiled stylesheet, only for the side effect. If a manifest did not
    // declare that CSS has side effects, a production build would tree-shake
    // the stylesheets away, and only that build. In source the import names
    // `@polymorph/recipes`, so that manifest must say it too.
    expect(manifest.sideEffects).toContain('**/*.css')
    expect(recipes.sideEffects).toContain('**/*.css')
  })
})

describe('the published exports map', () => {
  it('offers the same entry points as the source map', () => {
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(
      Object.keys(manifest.exports).sort(),
    )
  })

  it('resolves every entry point to one build, whichever condition a toolchain names', () => {
    // A framework that renders on a server resolves a client component twice:
    // once while it builds the server, and once for the browser. A condition
    // that sent Node to a second copy of the modules would put two copies of a
    // member's context on one page, and a part would not find the root it is
    // rendered in. What differs for Node is one stylesheet import, which the
    // `imports` map resolves (`packaging.test.ts`).
    for (const [entry, target] of Object.entries(manifest.publishConfig.exports)) {
      if (typeof target === 'string') continue
      expect(Object.keys(target), entry).toEqual(['types', 'import'])
    }
  })
})

describe('a focused entry point is a subset of the root, by name', () => {
  const root = new Set(exportedNames(resolve(PACKAGE, manifest.exports[ROOT_ENTRY]!)))

  for (const entry of FOCUSED_ENTRIES) {
    it(`${entry} exports nothing the root does not`, () => {
      const names = exportedNames(resolve(PACKAGE, manifest.exports[entry]!))
      expect(names.length).toBeGreaterThan(0)
      // A name that exists only on a focused entry would be a second vocabulary.
      // Moving an import between entry points must never change its meaning.
      expect(names.filter((name) => !root.has(name))).toEqual([])
    })
  }
})

/**
 * The types a module makes public: the interfaces and aliases it declares with
 * `export`, and the ones it passes on with `export type { … } from`. Read from
 * the syntax tree, so a name in a comment or a string is not counted.
 */
function exportedTypes(path: string): string[] {
  const names: string[] = []
  for (const statement of parse(path).statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      const modifiers = ts.getModifiers(statement) ?? []
      if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
        names.push(statement.name.text)
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements)
        if (statement.isTypeOnly || element.isTypeOnly) names.push(element.name.text)
    }
  }
  return names
}

describe('a member’s types come with it', () => {
  const INDEX = resolve(PACKAGE, manifest.exports[ROOT_ENTRY]!)
  const root = new Set(exportedNames(INDEX))
  /** Every module the index exports a member from, by the path the index writes. */
  const modules = new Set<string>()
  for (const statement of parse(INDEX).statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue
    const from = statement.moduleSpecifier
    if (from !== undefined && ts.isStringLiteral(from) && from.text.startsWith('./'))
      modules.add(from.text)
  }

  it('finds the member modules, so a pass is not vacuous', () => {
    expect(modules.size).toBeGreaterThan(80)
  })

  /*
   * A prop's type is written with names the member's module exports: an item
   * of `items`, a tone, an entry of a menu. An application that builds the
   * value in a variable, or passes it through a function of its own, has to
   * name that type. A name the index leaves out sends it to a deep path, which
   * the exports map refuses, or to `ComponentProps<…>['items'][number]`.
   */
  it('exports every type a member module exports, from the root', () => {
    const missing: string[] = []
    for (const specifier of modules) {
      const base = resolve(SRC, specifier)
      const file = [`${base}.tsx`, `${base}.ts`].find((candidate) => existsSync(candidate))
      if (file === undefined) continue
      for (const name of exportedTypes(file))
        if (!root.has(name)) missing.push(`${name} (${specifier})`)
    }
    expect(missing).toEqual([])
  })
})

describe('what the shipped source imports, the manifest declares', () => {
  it('resolves every bare specifier from dependencies or peers', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    const undeclared = new Set<string>()

    for (const path of shippedSources()) {
      for (const statement of parse(path).statements) {
        const specifier =
          (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
          statement.moduleSpecifier !== undefined &&
          ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : undefined
        if (specifier === undefined || specifier.startsWith('.')) continue

        // `react/jsx-runtime` comes with the `react` peer.
        const name = packageOf(specifier)
        if (!declared.has(name)) undeclared.add(`${name} ← ${relative(PACKAGE, path)}`)
      }
    }

    // Under pnpm an undeclared import resolves only where hoisting puts it,
    // which is this workspace, not the product that links this package.
    expect([...undeclared].sort()).toEqual([])
  })

  it('reaches the engine only through the React foundation', () => {
    // A member imports `@polymorph/react` and nothing deeper, and the engine
    // arrives through it. Here the engine is a dev dependency, for the tests'
    // theme setup, and never one a consumer installs for this package.
    expect(Object.keys(manifest.dependencies)).toContain('@polymorph/react')
    expect(Object.keys(manifest.dependencies)).not.toContain('@polymorph/engine')
  })
})

describe('the recipes come from their own package', () => {
  /** Every `@polymorph/recipes/…` specifier in the shipped source, with the file that names it. */
  const imports = shippedSources().flatMap((path) =>
    parse(path)
      .statements.filter(ts.isImportDeclaration)
      .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text)
      .filter((specifier) => specifier.startsWith(`${recipes.name}/`))
      .map((specifier) => ({ path, specifier })),
  )

  it('finds the imports, so a pass is not vacuous', () => {
    expect(imports.length).toBeGreaterThan(100)
  })

  it('resolves every recipe import through the recipes package’s exports map', () => {
    // A linked consumer's bundler resolves the specifier through that map, so
    // a path the map does not name, or names and does not have, breaks only
    // there.
    const broken = imports
      .filter(({ specifier }) => {
        const target = recipeTarget(`.${specifier.slice(recipes.name.length)}`)
        return target === null || !existsSync(target)
      })
      .map(({ path, specifier }) => `${relative(PACKAGE, path)}: ${specifier}`)
    expect(broken).toEqual([])
  })

  it('keeps no stylesheet in the vocabulary', () => {
    // A recipe has no framework in it, and every framework's members import it
    // from `@polymorph/recipes`. A stylesheet left here would be one the other
    // frameworks cannot reach.
    const sheets = filesUnder(SRC).filter((path) => path.endsWith('.css'))
    expect(sheets.map((path) => relative(PACKAGE, path))).toEqual([])
  })
})
