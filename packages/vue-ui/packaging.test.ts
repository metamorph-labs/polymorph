import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildVueUi, lockVueUiDist } from './dist-lock'

/**
 * The published build of `@polymorph/vue-ui` and the manifest that ships it.
 *
 * What a consumer's toolchain reads: every bare import in the shipped source is
 * a dependency or a peer the manifest declares; each member's module imports
 * its compiled recipe, which imports its stylesheet; the entry imports the base
 * layer and the foundation's stylesheet; the `node` copies import no
 * stylesheet, so Node and a server render load them; and every member has its
 * declarations. It is at the package root, in the `logic` project, because it
 * reads files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
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

/** Shipped source: what the index reaches, so no test, fixture, galleries or adapter. */
const shipped = filesUnder(SRC).filter(
  (path) =>
    /\.(ts|vue)$/.test(path) &&
    !/\.(test|states)\.ts$/.test(path) &&
    !/\/(test-setup|mount|galleries)\.ts$/.test(path) &&
    !relative(SRC, path).startsWith('conformance'),
)

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
      const text = readFileSync(path, 'utf8')
      const script = path.endsWith('.vue')
        ? (/<script setup lang="ts"(?: generic="[^"]*")?>([\s\S]*?)<\/script>/.exec(text)?.[1] ??
          '')
        : text
      const source = ts.createSourceFile(path, script, ts.ScriptTarget.ESNext, true)
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
        const specifier = statement.moduleSpecifier
        if (specifier === undefined || !ts.isStringLiteral(specifier)) continue
        if (specifier.text.startsWith('.')) continue
        if (!declared.has(packageOf(specifier.text))) {
          undeclared.push(`${packageOf(specifier.text)} ← ${relative(PACKAGE, path)}`)
        }
      }
    }
    expect(undeclared).toEqual([])
  })

  it('keeps every stylesheet a bundler may not drop', () => {
    expect(manifest.sideEffects).toContain('**/*.css')
  })
})

describe('the published build', () => {
  let release: () => void

  beforeAll(async () => {
    release = await lockVueUiDist('packages/vue-ui/packaging.test.ts')
    buildVueUi()
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

  it('points every published entry at a file the build wrote', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      expect(Object.keys(conditions), entry).toEqual(['types', 'node', 'import'])
      for (const target of Object.values(conditions)) {
        expect(existsSync(resolve(PACKAGE, target)), `${entry} → ${target}`).toBe(true)
      }
    }
  })

  it('imports the base layer and the foundation’s stylesheet from the entry', () => {
    const entry = readFileSync(resolve(DIST, 'index.js'), 'utf8')
    expect(entry).toContain(`import '@polymorph/vue/style.css'`)
    expect(entry).toContain(`import './base.css'`)
  })

  it('compiles each recipe beside its member, importing its stylesheet', () => {
    const recipes = filesUnder(DIST).filter(
      (path) => path.endsWith('.module.js') && !path.includes('/node/'),
    )
    expect(recipes.length).toBeGreaterThan(20)
    for (const recipe of recipes) {
      const text = readFileSync(recipe, 'utf8')
      const css = /^import '\.\/([^']+\.css)';/m.exec(text)?.[1]
      expect(css, relative(DIST, recipe)).toBeDefined()
      expect(existsSync(resolve(recipe, '..', css as string)), relative(DIST, recipe)).toBe(true)
    }
  })

  it('gives Node copies that import no stylesheet', () => {
    const copies = filesUnder(resolve(DIST, 'node')).filter((path) => path.endsWith('.js'))
    expect(copies.length).toBeGreaterThan(20)
    for (const copy of copies) {
      expect(readFileSync(copy, 'utf8'), relative(DIST, copy)).not.toMatch(/^import '[^']+\.css';/m)
    }
  })

  it('declares every member it ships', () => {
    const members = filesUnder(SRC)
      .filter((path) => path.endsWith('.vue'))
      .map((path) => relative(SRC, path))
    for (const member of members) {
      expect(existsSync(resolve(DIST, 'types', `${member}.d.ts`)), member).toBe(true)
    }
  })
})
