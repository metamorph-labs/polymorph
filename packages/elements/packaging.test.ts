import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildElements, lockElementsDist } from './dist-lock'

/**
 * The packaging laws of `@polymorph/elements`: checks on the manifest and on
 * the real build, as the other foundations' `packaging.test.ts` make them.
 *
 * The workspace consumes source and every other test runs against source, so
 * a fault here shows only in a consumer's install: an export target the build
 * did not write, a dependency the shipped source imports and the manifest
 * does not declare, a bundled copy of Solid or of the Solid foundation (whose
 * slot conventions the bridge and the Solid members must share as one
 * module), the index without the stylesheets every element brings, or the
 * loader carrying an element. It runs the build itself and holds the lock
 * over `dist/` from the build to its last read. It lives at the package root,
 * in the `logic` project, because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')

/** `scripts/published-side-effects.mjs`, the publish step's rewrite of `sideEffects`. */
const { publishedSideEffects } = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(PACKAGE, '../../scripts/published-side-effects.mjs'))
    .href
)) as { publishedSideEffects: (sideEffects: string[], directory: string) => string[] }

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  files: string[]
  dependencies: Record<string, string>
  peerDependencies?: Record<string, string>
  sideEffects: string[]
  publishConfig: { exports: Record<string, string | Record<string, string>> }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const packageOf = (specifier: string) => {
  const [first, second] = specifier.split('/')
  return specifier.startsWith('@') ? `${first}/${second}` : (first ?? specifier)
}

/** Every module specifier a file imports or re-exports. */
function importsOf(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  )
  return source.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  )
}

describe('what the shipped source imports, the manifest declares', () => {
  const shipped = filesUnder(SRC).filter((path) => path.endsWith('.ts') && !path.endsWith('.d.ts'))

  it('resolves every bare specifier from dependencies', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
    const undeclared = shipped.flatMap((path) =>
      importsOf(path)
        .filter((specifier) => !specifier.startsWith('.') && !declared.has(packageOf(specifier)))
        .map((specifier) => `${packageOf(specifier)} ← ${relative(PACKAGE, path)}`),
    )
    expect(undeclared).toEqual([])
  })

  it('depends on Solid and the Solid foundation, which a page with no build never installs', () => {
    // The elements are a page's only framework, so Solid is the elements' dependency, not a peer
    // the page provides.
    expect(Object.keys(manifest.dependencies)).toEqual(
      expect.arrayContaining(['solid-js', '@polymorph/solid', '@polymorph/engine']),
    )
    expect(manifest.peerDependencies).toBeUndefined()
  })

  it('keeps every stylesheet and every module that defines an element as a side effect', () => {
    expect(manifest.sideEffects).toEqual(
      expect.arrayContaining(['**/*.css', './dist/index.js', './dist/icon/Icon.js']),
    )
  })

  it('ships its build, its readme and its changelog', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
    for (const file of ['README.md', 'CHANGELOG.md']) {
      expect(existsSync(resolve(PACKAGE, file)), file).toBe(true)
    }
  })
})

describe('the published build', () => {
  let release: (() => void) | undefined

  beforeAll(async () => {
    release = await lockElementsDist('packages/elements/packaging.test.ts')
    buildElements()
  }, 600_000)

  afterAll(() => release?.())

  const modules = () =>
    filesUnder(DIST).filter(
      (path) => path.endsWith('.js') && !relative(DIST, path).startsWith('types'),
    )

  it('points every published entry at a file the build wrote, with its declarations', () => {
    for (const [entry, target] of Object.entries(manifest.publishConfig.exports)) {
      // Every workspace entry is published, and every published one exists in the workspace.
      expect(manifest.exports[entry], entry).toBeDefined()
      const targets = typeof target === 'string' ? [target] : Object.values(target)
      if (typeof target !== 'string')
        expect(Object.keys(target), entry).toEqual(['types', 'import'])
      for (const file of targets)
        expect(existsSync(resolve(PACKAGE, file)), `${entry} → ${file}`).toBe(true)
    }
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(
      Object.keys(manifest.exports).sort(),
    )
  })

  it('imports the base layer and the foundation’s stylesheets from the index, and ships them', () => {
    const index = readFileSync(resolve(DIST, 'index.js'), 'utf8')
    expect(index).toContain(`import "@polymorph/recipes/base.css"`)
    // Icon's stylesheet, which the Solid foundation publishes beside its modules.
    expect(index).toContain(`import "@polymorph/solid/style.css"`)
    const solid = JSON.parse(readFileSync(resolve(PACKAGE, '../solid/package.json'), 'utf8')) as {
      publishConfig: { exports: Record<string, unknown> }
    }
    expect(solid.publishConfig.exports['./style.css']).toBe('./dist/solid.css')
    expect(index).toContain(`import "./host.css"`)
    expect(index).toContain(`import "./pending.css"`)
    for (const sheet of ['host.css', 'pending.css']) {
      expect(readFileSync(resolve(DIST, sheet), 'utf8'), sheet).toBe(
        readFileSync(resolve(SRC, sheet), 'utf8'),
      )
    }
  })

  it('bundles neither Solid, nor the Solid foundation, nor the engine', () => {
    // One copy of the Solid foundation: `hostMember`, which the bridge calls, and `hold`, which the
    // Solid members call, share the record of which element holds which member.
    for (const path of modules()) {
      const text = readFileSync(path, 'utf8')
      expect(text, relative(DIST, path)).not.toMatch(
        /\/\/#region .*(node_modules|\.\.\/solid\/|\.\.\/engine\/)/,
      )
    }
    expect(importsOf(resolve(DIST, 'element.js'))).toEqual(
      expect.arrayContaining(['solid-js', 'solid-js/web', '@polymorph/solid']),
    )
  })

  it('keeps the loader free of every element and every stylesheet', () => {
    // A page with no build loads the loader first: it defines the tags and names no member.
    const reached = new Set<string>()
    const visit = (path: string) => {
      if (reached.has(path)) return
      reached.add(path)
      for (const specifier of importsOf(path)) {
        if (specifier.startsWith('.')) visit(resolve(path, '..', specifier))
      }
    }
    visit(resolve(DIST, 'loader.js'))
    const names = [...reached].map((path) => relative(DIST, path)).sort()
    expect(names).not.toContain('icon/Icon.js')
    expect(names).not.toContain('index.js')
    // The temporal codecs and the engine's dates load with a member that reads a date or a time.
    expect(names).toContain('attributes.js')
    expect(names).not.toContain('temporal.js')
    expect(names).not.toContain('codecs.js')
    for (const path of reached) expect(importsOf(path)).not.toContain('@polymorph/engine')
    for (const path of reached)
      expect(importsOf(path).filter((name) => name.endsWith('.css'))).toEqual([])
  })

  it('loads the definitions in plain Node, which has no DOM', () => {
    const out = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `const d = await import('./dist/definition.js'); console.log(d.tagOf('TabsContent'), d.eventOf('onOpenChange'))`,
      ],
      { cwd: PACKAGE, stdio: 'pipe' },
    )
      .toString()
      .trim()
    expect(out).toBe('poly-tabs-content poly-open-change')
  })

  it('publishes the side effects of the modules it builds', () => {
    expect(publishedSideEffects(manifest.sideEffects, PACKAGE)).toEqual(
      expect.arrayContaining(['**/*.css', './dist/index.js', './dist/icon/Icon.js']),
    )
  })
})
