import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildScreen, lockScreenDist } from './dist-lock'

/**
 * The packaging laws of `@polymorph/screen`: checks on the manifest and on
 * the real build.
 *
 * The workspace consumes source, and every other test runs against source,
 * so a fault here shows only in a host's install: an export the build did not
 * write, a module that still imports `@polymorph/spec` or `@polymorph/registry`
 * (which are not published), a dependency at all, an entry that loads more
 * than it needs, or declarations that leave a type `any`. It runs the build
 * itself and holds the lock over `dist/` from the build to its last read. It
 * lives at the package root, in the `logic` project, because it reads files
 * on disk.
 */

const PACKAGE = import.meta.dirname
const DIST = resolve(PACKAGE, 'dist')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, string>
  files: string[]
  dependencies: Record<string, string>
  peerDependencies?: Record<string, string>
  sideEffects: unknown
  publishConfig: { exports: Record<string, Record<string, string>> }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** Every specifier a built module imports, statically or dynamically. */
function importsOf(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [
    ...source.matchAll(/^(?:import|export)\b[^;'"]*?["']([^"']+)["']/gm),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1] as string)
}

/** Every built module an entry loads, itself included. */
function reached(entry: string): string[] {
  const seen = new Set<string>()
  const visit = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    for (const specifier of importsOf(path)) {
      if (specifier.startsWith('.')) visit(resolve(path, '..', specifier))
    }
  }
  visit(resolve(DIST, entry))
  return [...seen].map((path) => relative(DIST, path)).sort()
}

describe('the manifest', () => {
  it('publishes every workspace entry, and no other', () => {
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(
      Object.keys(manifest.exports).sort(),
    )
    for (const target of Object.values(manifest.publishConfig.exports)) {
      expect(Object.keys(target)).toEqual(['types', 'import'])
    }
  })

  it('has no side effects, so a bundler drops every module a host does not import', () => {
    expect(manifest.sideEffects).toBe(false)
  })

  it('depends only on the workspace packages its build inlines', () => {
    // `scripts/publish-packages.mjs` removes both from the published manifest (`bundled`).
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@polymorph/registry',
      '@polymorph/spec',
    ])
    expect(manifest.peerDependencies).toBeUndefined()
    const script = readFileSync(resolve(PACKAGE, '../../scripts/publish-packages.mjs'), 'utf8')
    expect(script).toContain(
      "{ dir: 'packages/screen', bundled: ['@polymorph/registry', '@polymorph/spec'] }",
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
    release = await lockScreenDist('packages/screen/packaging.test.ts')
    buildScreen()
  }, 600_000)

  afterAll(() => release?.())

  const modules = () =>
    filesUnder(DIST).filter(
      (path) => path.endsWith('.js') && !relative(DIST, path).startsWith('types'),
    )

  it('writes every file an entry points at', () => {
    for (const [entry, target] of Object.entries(manifest.publishConfig.exports)) {
      for (const file of Object.values(target)) {
        expect(existsSync(resolve(PACKAGE, file)), `${entry} → ${file}`).toBe(true)
      }
    }
  })

  it('imports no package at all', () => {
    for (const path of modules()) {
      const bare = importsOf(path).filter((specifier) => !specifier.startsWith('.'))
      expect(bare, relative(DIST, path)).toEqual([])
    }
  })

  it('loads only what each entry needs', () => {
    // parsePartial is one module that imports nothing.
    expect(reached('partial.js')).toEqual(['partial.js'])
    const table = (files: string[]) =>
      files.some((file) =>
        /JSON\.parse\(["']\{\\?"version/.test(readFileSync(resolve(DIST, file), 'utf8')),
      )
    const validator = (files: string[]) =>
      files.some((file) =>
        readFileSync(resolve(DIST, file), 'utf8').includes('the emitted file would both declare'),
      )
    const card = (files: string[]) =>
      files.some((file) => readFileSync(resolve(DIST, file), 'utf8').includes('## What you write'))
    // The walk is handed a table: it loads none, and neither the validator nor the card.
    expect(table(reached('walk.js'))).toBe(false)
    expect(validator(reached('walk.js'))).toBe(false)
    expect(card(reached('walk.js'))).toBe(false)
    // checkScreen loads the table and the validator, and not the card.
    expect(table(reached('check.js'))).toBe(true)
    expect(validator(reached('check.js'))).toBe(true)
    expect(card(reached('check.js'))).toBe(false)
    expect(card(reached('card.js'))).toBe(true)
  })

  it('runs in plain Node, from the built files', () => {
    const probe = `
      const root = await import('./dist/index.js')
      const partial = await import('./dist/partial.js')
      const check = await import('./dist/check.js')
      const walk = await import('./dist/walk.js')
      const vocabulary = await import('./dist/vocabulary.js')
      const card = await import('./dist/card.js')
      const document = {
        spec: 'polymorph-screen/1', name: 'Probe', purpose: 'A probe.', inputs: [],
        root: { component: 'Button', props: { label: 'Save' } },
      }
      const screen = walk.createScreen({ document, vocabulary: vocabulary.VOCABULARY })
      console.log(JSON.stringify({
        same: root.checkScreen === check.checkScreen,
        parsed: partial.parsePartial('{"name":"A"').document,
        lawful: check.checkScreen(document).ok,
        unknown: check.checkScreen({ ...document, root: { component: 'Buton' } }).ok,
        drawn: screen.root.component,
        members: vocabulary.VOCABULARY.components.length > 100,
        card: card.runtimeCard().includes('## What you write'),
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()
    expect(JSON.parse(out)).toEqual({
      same: true,
      parsed: { name: 'A' },
      lawful: true,
      unknown: false,
      drawn: 'Button',
      members: true,
      card: true,
    })
  }, 30_000)

  it('carries the declarations of the modules it inlines', () => {
    expect(readdirSync(resolve(DIST, 'types/_internal')).sort()).toEqual(['registry', 'spec'])
  })

  /** As a strict consumer's compiler reads them: no `skipLibCheck`, no DOM, no node. */
  it('has declarations a strict consumer reads with nothing else installed', () => {
    const entries = Object.values(manifest.publishConfig.exports).map((target) =>
      resolve(PACKAGE, target['types'] as string),
    )
    const program = ts.createProgram(entries, {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2023.d.ts'],
      types: [],
    })
    const own = (fileName: string) => fileName.startsWith(`${DIST}/`)
    expect(program.getSourceFiles().filter(({ fileName }) => own(fileName)).length).toBeGreaterThan(
      10,
    )
    const faults = ts
      .getPreEmitDiagnostics(program)
      .filter(({ file }) => file === undefined || own(file.fileName))
      .map(({ code, file, messageText }) => {
        const where = file === undefined ? '' : `${relative(PACKAGE, file.fileName)}: `
        return `${where}TS${code} ${ts.flattenDiagnosticMessageText(messageText, ' ')}`
      })
    expect(faults).toEqual([])
  }, 60_000)
})
