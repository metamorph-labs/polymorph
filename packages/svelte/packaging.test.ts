import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { compile, compileModule } from 'svelte/compiler'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The packaging laws of `@polymorph/svelte`: checks on the real build output,
 * as `packages/vue/packaging.test.ts` makes them for the Vue foundation.
 *
 * The workspace consumes source and every other test runs against source, so
 * a fault here shows only in a consumer's install: an export target the build
 * did not write, a relative import that names no shipped file, a component or
 * a rune module that does not compile for the browser or for a server render,
 * the presences reaching the root, a package imported and not declared, or a
 * declaration that fails a strict consumer's typecheck.
 *
 * It runs the build itself, so a pass does not depend on a stale `dist/`. No
 * other test builds this package, so it takes no lock over `dist/`. It lives
 * at the package root, in the `logic` project, because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const ROOT = resolve(PACKAGE, '../..')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  publishConfig: { exports: Record<string, Record<string, string>> }
}

const dist = (path: string) => resolve(PACKAGE, path)
const read = (path: string) => readFileSync(dist(path), 'utf8')

/** Every file under `directory`, as paths relative to the package. */
function files(directory: string): string[] {
  return readdirSync(dist(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? files(path) : [path]
  })
}

beforeAll(() => {
  try {
    execFileSync('pnpm', ['--filter', '@polymorph/svelte', 'build'], { cwd: ROOT, stdio: 'pipe' })
  } catch (error) {
    // `pipe` keeps a passing run quiet; a failing one must show the build's output.
    const failed = error as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `svelte: the build failed\n${failed.stdout?.toString() ?? ''}${failed.stderr?.toString() ?? ''}`,
    )
  }
}, 600_000)

/** A module's text, a component's scripts only. */
const scriptOf = (path: string) =>
  path.endsWith('.svelte')
    ? [...read(path).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map((match) => match[1])
        .join('\n')
    : read(path)

/** Every module specifier a shipped file imports or re-exports. */
function specifiersOf(path: string): string[] {
  const source = ts.createSourceFile(path, scriptOf(path), ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (specifier !== undefined && ts.isStringLiteral(specifier)) found.push(specifier.text)
  }
  return found
}

const shippedModules = () => files('dist').filter((path) => /\.(js|svelte)$/.test(path))

describe('the published surface exists', () => {
  it('resolves every export target to a real file, for Svelte and for its types', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      expect(Object.keys(conditions), entry).toEqual(['types', 'svelte', 'default'])
      for (const target of Object.values(conditions)) {
        expect(existsSync(dist(target)), `${entry} → ${target}`).toBe(true)
      }
    }
    expect(Object.keys(manifest.publishConfig.exports)).toEqual(['.', './motion'])
  })

  it('ships only what a consumer installs', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })

  it('ships the stylesheet the icon gateway draws with, beside it', () => {
    expect(read('dist/icon/icon.module.css')).toContain('--pm-icon-size')
  })

  it('mirrors its source: every shipped file is a source file, written for a consumer', () => {
    const foreign = files('dist').filter((path) => {
      const stem = path.replace(/^dist\//, 'src/')
      const source = stem.replace(/\.d\.ts$/, '').replace(/\.js$/, '')
      return ![stem, `${source}.ts`, source].some((candidate) => existsSync(dist(candidate)))
    })
    expect(foreign).toEqual([])
    expect(files('dist')).toEqual(
      expect.arrayContaining(['dist/icon/Icon.svelte', 'dist/conventions/slotted.svelte.js']),
    )
  })

  it('names, in every relative import, a file the package ships', () => {
    const unresolved: string[] = []
    for (const path of [
      ...shippedModules(),
      ...files('dist').filter((file) => file.endsWith('.d.ts')),
    ]) {
      for (const specifier of specifiersOf(path)) {
        if (!specifier.startsWith('.')) continue
        const target = resolve(dirname(dist(path)), specifier)
        const declaration = path.endsWith('.d.ts')
          ? [target.replace(/\.js$/, '.d.ts'), `${target}.d.ts`]
          : []
        if (![target, ...declaration].some((candidate) => existsSync(candidate))) {
          unresolved.push(`${specifier} ← ${path}`)
        }
      }
    }
    expect(unresolved).toEqual([])
  })

  it('compiles every component and rune module for the browser and for a server render', () => {
    const faults: string[] = []
    for (const path of shippedModules()) {
      for (const generate of ['client', 'server'] as const) {
        try {
          if (path.endsWith('.svelte')) compile(read(path), { filename: path, generate })
          else if (path.endsWith('.svelte.js'))
            compileModule(read(path), { filename: path, generate })
        } catch (error) {
          faults.push(`${path} (${generate}): ${String(error)}`)
        }
      }
    }
    expect(faults).toEqual([])
  })
})

/**
 * The presences are for member internals, so they live on `./motion` and
 * never on the root, and that subpath re-exports the engine's motion module by
 * name, without the animator the presences run on. Comments are stripped
 * first, because a declaration keeps its source's docblocks.
 */
describe('the motion surface stays on its subpath', () => {
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('keeps the presences out of the root entry', () => {
    const named = ['dist/index.js', 'dist/index.d.ts'].flatMap((path) =>
      ['usePresence', 'useKeyedPresence', 'useListPresence', './motion/']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
  })

  it('re-exports none of the engine internals the presences run on', () => {
    const named = ['dist/motion/index.js', 'dist/motion/index.d.ts'].flatMap((path) =>
      ['animateTo', 'animateProperty', 'setFrame']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
    expect(code('dist/motion/index.js')).not.toMatch(/^export \*/m)
    expect(code('dist/motion/index.d.ts')).toContain('resolveBinding')
  })
})

describe('the engine and Svelte stay dependencies', () => {
  it('re-exports the engine from the root', () => {
    expect(read('dist/index.js')).toMatch(/^export \* from ["']@polymorph\/engine["'];?$/m)
    expect(read('dist/motion/index.js')).toMatch(/from ["']@polymorph\/engine\/motion["']/)
  })

  it('declares every package it imports', () => {
    const bare = new Set<string>()
    for (const path of shippedModules()) {
      for (const specifier of specifiersOf(path)) {
        if (specifier.startsWith('.')) continue
        bare.add(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : (specifier.split('/')[0] as string),
        )
      }
    }
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    expect([...bare].filter((name) => !declared.has(name)).sort()).toEqual([])
    expect([...bare]).toEqual(expect.arrayContaining(['@polymorph/engine', 'svelte']))
  })
})

/**
 * The declarations, checked the way a consumer's compiler checks them, with
 * `skipLibCheck` off. `@polymorph/engine` resolves through this package's
 * workspace link to the engine's source, the types its published declarations
 * are emitted from; `resolveJsonModule` is on only for that source, which reads
 * two decisions from `design/`.
 */
describe('the declarations typecheck as a strict consumer reads them', () => {
  it('checks every published entry under a strict consumer', () => {
    const entries = Object.values(manifest.publishConfig.exports).map((conditions) =>
      dist(conditions.types as string),
    )
    const program = ts.createProgram(entries, {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      resolveJsonModule: true,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    })
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const loaded = program.getSourceFiles().map(({ fileName }) => fileName)
    expect(loaded.filter(own).map((fileName) => relative(PACKAGE, fileName))).toContain(
      'dist/icon/Icon.svelte.d.ts',
    )
    expect(loaded.some((fileName) => fileName.endsWith('/engine/src/index.ts'))).toBe(true)

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
