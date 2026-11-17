import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildRules, lockRulesDist } from './dist-lock'

/**
 * The packaging laws: checks on the real build output.
 *
 * The workspace consumes source, and every other test runs against source, so
 * a broken build would go unnoticed here and fail in a consumer's lint config:
 * an export target that names a file the build never wrote, a dependency the
 * build left as an import without the manifest declaring it, or a declaration
 * that does not typecheck under a stricter compiler than this repository's.
 *
 * This file runs the real build and checks what a consumer's toolchain needs:
 * the published entry points exist and import in node, every bare import is a
 * declared dependency, and the declarations typecheck.
 *
 * It lives at the package root, not in `src/`, because it is about the built
 * files on disk rather than about the rules' source.
 */

const PACKAGE = import.meta.dirname
const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  name: string
  dependencies?: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  publishConfig: { exports: Record<string, unknown> }
}

const dist = (path: string) => resolve(PACKAGE, path)

/**
 * This file runs the build itself, so a pass does not depend on a stale
 * `dist/`. `packages/cli/scratch.test.ts` builds this package too, so the build
 * runs under the lock in `dist-lock.ts`, held until the last read of `dist`.
 */
let release: (() => void) | undefined

beforeAll(async () => {
  release = await lockRulesDist('packaging.test.ts')
  buildRules()
}, 900_000)

afterAll(() => {
  release?.()
})

/** Every path a published `exports` map points at, flattened. */
function exportTargets(): string[] {
  const found: string[] = []
  const walk = (value: unknown): void => {
    if (typeof value === 'string') found.push(value)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(manifest.publishConfig.exports)
  return found
}

/** Every built module, outside the declarations. */
function builtModules(): string[] {
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'types' && entry.name !== '.tsc') walk(path)
      } else if (entry.name.endsWith('.js')) found.push(path)
    }
  }
  walk(dist('dist'))
  return found
}

/** The specifiers of a built module's import and export statements. */
const specifiersOf = (source: string): string[] =>
  [...source.matchAll(/^(?:import|export)\b[^;'"]*?["']([^"']+)["']/gm)].map(
    (match) => match[1] as string,
  )

describe('the published surface exists', () => {
  it('resolves every export target to a real file', () => {
    const missing = exportTargets().filter((target) => !existsSync(dist(target)))
    expect(missing, 'a consumer resolving these would get a module-not-found').toEqual([])
  })

  it('ships only what a consumer installs', () => {
    // Source, tests and fixtures stay in the repository; `files` is the list.
    // The owner map is data a consumer's config reads, so it ships as a file.
    expect(manifest.files).toEqual([
      'dist',
      'scoped-token-owners.json',
      'README.md',
      'CHANGELOG.md',
    ])
  })

  /**
   * A separate node process imports the files from the package directory. An
   * `await import()` inside vitest goes through Vite's transform pipeline, so it
   * would test whether Vite can load the files, which no consumer needs. It would
   * also resolve bare specifiers against this repository instead of against the
   * package's own dependencies.
   *
   * The engine is the exception. It is a peer the consumer installs, and in this
   * workspace it resolves to TypeScript source, which plain node cannot load.
   * The probe answers it with a stand-in that exports the names the build
   * imports from it, so the rest of each entry's graph loads exactly as a
   * consumer's node loads it. The engine's own packaging law checks that its
   * build imports in node.
   */
  it('imports every entry in node, from the built files rather than from source', () => {
    const fromEngine = new Set<string>()
    for (const file of builtModules()) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(
        /^import\s*\{([^}]*)\}\s*from\s*["']@polymorph\/engine["']/gm,
      )) {
        for (const binding of (match[1] as string).split(',')) {
          const name = binding.trim().split(/\s+as\s+/)[0]
          if (name) fromEngine.add(name)
        }
      }
    }
    // The Stylelint token list composes a theme with the engine.
    expect([...fromEngine]).toContain('emitThemeCSS')

    const standIn = [...fromEngine].map((name) => `export const ${name} = () => {}`).join('\n')
    const probe = `
      import { registerHooks } from 'node:module'
      registerHooks({
        resolve(specifier, context, next) {
          if (specifier !== '@polymorph/engine') return next(specifier, context)
          return {
            url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(standIn)}),
            shortCircuit: true,
          }
        },
      })
      const root = await import('./dist/index.js')
      const eslint = await import('./dist/eslint.js')
      const stylelint = await import('./dist/stylelint.js')
      const emitted = await import('./dist/stylelint-emitted.js')
      const ladder = await import('./dist/ladder.js')
      const containment = await import('./dist/containment.js')
      const inventory = await import('./dist/inventory.js')
      const specApi = await import('./dist/spec-api.js')
      const verify = await import('./dist/verify.js')
      console.log(JSON.stringify({
        name: root.plugin.meta.name,
        version: root.plugin.meta.version,
        rules: Object.keys(eslint.default.rules),
        parser: typeof eslint.parser.parseForESLint,
        vocabulary: root.VOCABULARY_MODULE,
        stylelint: Array.isArray(stylelint.default) && stylelint.default.length,
        ruleNames: Object.keys(stylelint.RULE_NAMES).length,
        emittedTokens: typeof emitted.emittedTokens,
        climb: Object.keys(ladder.RULE_CLIMB).length,
        iconMap: containment.ICON_MAP_FILE,
        collectExceptions: typeof inventory.collectExceptions,
        auditSpecApi: typeof specApi.auditSpecApi,
        verifyCode: typeof verify.verifyCode,
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    const loaded = JSON.parse(out) as Record<string, unknown> & { rules: string[] }
    expect(loaded).toMatchObject({
      // The manifest is bundled, so the plugin names the package it ships in.
      name: manifest.name,
      version: expect.any(String),
      parser: 'function',
      vocabulary: '@polymorph/react-ui',
      emittedTokens: 'function',
      iconMap: 'packages/react/src/icon/map.tsx',
      collectExceptions: 'function',
      auditSpecApi: 'function',
      verifyCode: 'function',
    })
    expect(loaded.rules).toContain('vendorable-imports')
    expect(loaded['stylelint']).toBeGreaterThan(0)
    expect(loaded['ruleNames']).toBeGreaterThan(0)
    expect(loaded['climb']).toBeGreaterThan(0)
    /*
     * Spawning node and importing every entry takes over a second on an idle
     * machine and several on a busy one, longer than Vitest's default per-test
     * timeout under the full suite's load. That failure is unrelated to the
     * assertions, so the timeout is raised.
     */
  }, 30_000)

  it('bundles no copy of a dependency', () => {
    // Every dependency is external. A `dist/node_modules` means an external
    // pattern missed a subpath and the build inlined a package.
    expect(existsSync(dist('dist/node_modules'))).toBe(false)
  })

  /**
   * Every bare import left in the build must be a package the consumer has.
   *
   * A published file that imports a package without declaring it resolves here,
   * where pnpm hoists it into the workspace, and fails in the consumer's
   * repository. This test reads the built files, not the source, because only
   * the build shows which imports remain.
   */
  it('declares every package it still imports', () => {
    const bare = new Set<string>()
    for (const file of builtModules()) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
        bare.add(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : (specifier.split('/')[0] as string),
        )
      }
    }
    // The build was read, so an empty difference is meaningful.
    expect(bare).toContain('eslint')

    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies),
    ])
    expect([...bare].filter((name) => !declared.has(name)).sort()).toEqual([])
  })

  it('reads nothing from outside the package at runtime', () => {
    // The icon rule's role map and the package's own JSON are bundled. A
    // relative import that climbs out of `dist/` names a file no consumer has.
    const escaping = builtModules().flatMap((file) =>
      specifiersOf(readFileSync(file, 'utf8'))
        .filter((specifier) => specifier.startsWith('.'))
        .filter((specifier) =>
          relative(dist('dist'), resolve(file, '..', specifier)).startsWith('..'),
        )
        .map((specifier) => `${relative(PACKAGE, file)}: ${specifier}`),
    )
    expect(escaping).toEqual([])
  })
})

/**
 * The declarations, checked the way a consumer's compiler checks them.
 *
 * Nothing in this repository reads `dist/types`. The workspace typechecks
 * source with `skipLibCheck` on. A consumer with it off reads every published
 * declaration, including the hand-written ones copied in beside the generated
 * ones, so a declaration that imports a file the package does not ship is an
 * error in their typecheck.
 *
 * `resolveJsonModule` stays off. A published declaration that needs a JSON
 * import is already broken, whether or not this repository holds the file.
 */
describe('the declarations typecheck as a strict consumer reads them', () => {
  it('checks every published entry under a strict consumer', () => {
    const entries = exportTargets()
      .filter((target) => target.endsWith('.d.ts'))
      .map(dist)
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
    // Only diagnostics in the package's own files, or with no file, count.
    // Faults inside a dependency's declarations belong to that dependency.
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const read = program.getSourceFiles().map(({ fileName }) => fileName)
    // The program found the generated and the hand-written declarations, so an
    // empty fault list is meaningful.
    expect(read.filter(own).map((fileName) => relative(PACKAGE, fileName))).toEqual(
      expect.arrayContaining([
        'dist/types/index.d.ts',
        'dist/types/verify.d.ts',
        'dist/types/stylelint/index.d.ts',
        'dist/types/inventory.d.ts',
      ]),
    )

    const faults = ts
      .getPreEmitDiagnostics(program)
      .filter(({ file }) => file === undefined || own(file.fileName))
      .map(({ code, file, messageText }) => {
        const where = file === undefined ? '' : `${relative(PACKAGE, file.fileName)}: `
        return `${where}TS${code} ${ts.flattenDiagnosticMessageText(messageText, ' ')}`
      })
    expect(faults).toEqual([])
    // A program over every declaration and its dependencies takes seconds, and
    // longer under the full suite's load.
  }, 60_000)
})
