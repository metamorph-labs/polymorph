import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildSolid, lockSolidDist } from './dist-lock'

/**
 * The packaging laws of `@polymorph/solid`: checks on the real build output, as
 * `packages/vue/packaging.test.ts` makes them for the Vue foundation.
 *
 * The workspace consumes source and every other test runs against source, so
 * a fault here shows only in a consumer's install: an export target the build
 * did not write, a server entry that cannot load in plain Node or render, a
 * bundled copy of the engine or of Solid, the presence primitives reaching the
 * root, a stylesheet missing, or a declaration that fails a strict consumer's
 * typecheck. Solid compiles JSX once for a browser (`dist/`) and once for a
 * server (`dist/server/`), so both builds are read, and the source a
 * consumer's Solid compiles (`dist/source/`) is read as source.
 *
 * It runs the build itself, so a pass does not depend on a stale `dist/`, and
 * holds the lock over `dist/` (`dist-lock.ts`) from the build to its last read,
 * because the vocabulary's packaging law builds this package too. It lives at
 * the package root, in the `logic` project, because it reads files on disk.
 */

const PACKAGE = import.meta.dirname

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  publishConfig: { exports: Record<string, string | Record<string, string>> }
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

/** The built modules of both builds, without the declarations and the source. */
const modules = () =>
  files('dist').filter(
    (path) =>
      path.endsWith('.js') && !path.startsWith('dist/types/') && !path.startsWith('dist/source/'),
  )

let release: (() => void) | undefined

beforeAll(async () => {
  release = await lockSolidDist('packages/solid/packaging.test.ts')
  buildSolid()
}, 900_000)

afterAll(() => release?.())

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

describe('the published surface exists', () => {
  it('resolves every export target to a real file', () => {
    const missing = exportTargets().filter((target) => !existsSync(dist(target)))
    expect(missing, 'a consumer resolving these would get a module-not-found').toEqual([])
    // Both entries in both builds and the stylesheet, by name, so a shrunken exports map
    // cannot pass.
    expect(exportTargets()).toEqual(
      expect.arrayContaining([
        './dist/index.js',
        './dist/motion.js',
        './dist/server/index.js',
        './dist/server/motion.js',
        './dist/solid.css',
      ]),
    )
  })

  it('gives Solid’s compiler the source, a browser its build and plain Node the server’s', () => {
    for (const conditions of Object.values(manifest.publishConfig.exports)) {
      if (typeof conditions === 'string') continue
      expect(Object.keys(conditions)).toEqual(['types', 'solid', 'browser', 'node', 'import'])
      expect(conditions['solid']?.startsWith('./dist/source/')).toBe(true)
      expect(conditions['browser']?.startsWith('./dist/server/')).toBe(false)
      expect(conditions['import']).toBe(conditions['browser'])
      expect(conditions['node']?.startsWith('./dist/server/')).toBe(true)
    }
  })

  it('ships the stylesheet the icon gateway needs, once per form', () => {
    expect(read('dist/solid.css')).toContain('--pm-icon-size')
    // The builds share one stylesheet; the source keeps Icon's CSS Module for its compiler.
    expect(files('dist').filter((path) => path.endsWith('.css'))).toEqual([
      'dist/solid.css',
      'dist/source/icon/icon.module.css',
    ])
  })

  it('keeps the source a consumer’s Solid compiles, its JSX as written and its imports shipped', () => {
    const source = files('dist/source').filter((path) => /\.jsx?$/.test(path))
    expect(source).toEqual(
      expect.arrayContaining(['dist/source/index.js', 'dist/source/icon/Icon.jsx']),
    )
    expect(read('dist/source/icon/Icon.jsx')).toMatch(/<Glyph\b/)
    // Each relative specifier names a shipped file as it is written, extension included: a
    // bundler that reads the package by Node's rules (webpack's `fullySpecified`) adds none.
    const specifiers = source.flatMap((path) =>
      [...read(path).matchAll(/^(?:import|export)\b[^;'"]*?["'](\.{1,2}\/[^"']+)["']/gm)].map(
        (match) => ({ path, target: resolve(dist(path), '..', match[1] as string) }),
      ),
    )
    expect(specifiers.map(({ target }) => relative(PACKAGE, target))).toEqual(
      expect.arrayContaining(['dist/source/conventions/media.js', 'dist/source/icon/Icon.jsx']),
    )
    const unresolved = specifiers
      .filter(({ target }) => !(existsSync(target) && statSync(target).isFile()))
      .map(({ path, target }) => `${path}: ${relative(PACKAGE, target)}`)
    expect(unresolved).toEqual([])
  })

  it('imports the stylesheet from no module', () => {
    // A `.css` import throws in plain Node, so a script or a server render could
    // not load the package. The vocabulary's entry imports the stylesheet for
    // its consumers (`packages/solid-ui/vite.build.config.ts`).
    const importers = modules().filter((path) => /^import ["'][^"']+\.css["'];?$/m.test(read(path)))
    expect(importers).toEqual([])
  })

  it('compiles the browser’s build to elements and the server’s to strings', () => {
    expect(read('dist/icon/Glyph.js')).toMatch(/\btemplate\b|\bcreateComponent\b/)
    expect(read('dist/icon/BrandMark.js')).toMatch(/\btemplate\b/)
    expect(read('dist/server/icon/BrandMark.js')).toMatch(/\bssr\b/)
    expect(read('dist/server/icon/BrandMark.js')).not.toMatch(/\btemplate\b/)
  })

  it('ships only what a consumer installs', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })

  /**
   * A separate node process imports the server's entries from the package
   * directory, as a consumer's node does, and renders `Icon` to a string. The
   * engine resolves to TypeScript source in this workspace, which plain node
   * cannot load, so the probe answers its specifiers with stand-ins that export
   * the names the build imports from them, as the Vue foundation's law does.
   * Solid and this package's own modules load as a consumer's node loads them.
   */
  it('imports both server entries in node and renders a member to a string', () => {
    const fromEngine: Record<string, Set<string>> = {
      '@polymorph/engine': new Set(),
      '@polymorph/engine/motion': new Set(),
    }
    for (const path of modules().filter((module) => module.startsWith('dist/server/'))) {
      for (const match of read(path).matchAll(
        /^export\s*\*\s*from\s*["'](@polymorph\/engine\/[a-z-]+)["']/gm,
      )) {
        fromEngine[match[1] as string] ??= new Set()
      }
      for (const match of read(path).matchAll(
        /^(?:import|export)\s*\{([^}]*)\}\s*from\s*["'](@polymorph\/engine(?:\/[a-z-]+)?)["']/gm,
      )) {
        const names = (fromEngine[match[2] as string] ??= new Set())
        for (const binding of (match[1] as string).split(',')) {
          const name = binding.trim().split(/\s+as\s+/)[0]
          if (name) names.add(name)
        }
      }
    }
    expect([...(fromEngine['@polymorph/engine/motion'] ?? [])]).toContain('animateTo')

    const standIns = Object.fromEntries(
      Object.entries(fromEngine).map(([specifier, names]) => [
        specifier,
        `data:text/javascript,${encodeURIComponent(
          // Each returns an object, because the toast store is created when its module loads.
          [...names].map((name) => `export const ${name} = () => ({})`).join('\n'),
        )}`,
      ]),
    )
    const probe = `
      import { registerHooks } from 'node:module'
      const standIns = ${JSON.stringify(standIns)}
      registerHooks({
        resolve(specifier, context, next) {
          const url = standIns[specifier]
          return url === undefined ? next(specifier, context) : { url, shortCircuit: true }
        },
      })
      const root = await import('./dist/server/index.js')
      const motion = await import('./dist/server/motion.js')
      const { renderToString } = await import('solid-js/web')
      console.log(JSON.stringify({
        icon: typeof root.Icon,
        glyph: typeof root.Glyph,
        controlRef: typeof root.useControlRef,
        rootMotion: ['usePresence', 'useKeyedPresence'].filter((name) => name in root),
        presence: typeof motion.usePresence,
        keyedPresence: typeof motion.useKeyedPresence,
        resolveBinding: typeof motion.resolveBinding,
        internals: ['animateTo', 'animateProperty', 'setFrame'].filter((name) => name in motion),
        rendered: renderToString(() => root.Icon({ name: 'add' })),
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    const result = JSON.parse(out) as Record<string, unknown>
    expect({ ...result, rendered: undefined }).toEqual({
      icon: 'function',
      glyph: 'function',
      controlRef: 'function',
      rootMotion: [],
      presence: 'function',
      keyedPresence: 'function',
      resolveBinding: 'function',
      internals: [],
      rendered: undefined,
    })
    expect(result['rendered']).toMatch(/^<svg [^>]*data-member="icon"/)
  }, 30_000)
})

/**
 * The presence primitives are for member internals, so they live on `./motion`
 * and never on the root, and that subpath re-exports the engine's motion
 * module by name, without the animator the primitives run on. Comments are
 * stripped first, because a declaration keeps its source's docblocks.
 */
describe('the motion surface stays on its subpath', () => {
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('keeps the presence primitives out of the root entry', () => {
    const named = ['dist/index.js', 'dist/server/index.js', 'dist/types/index.d.ts'].flatMap(
      (path) =>
        ['usePresence', 'useKeyedPresence', './motion/']
          .filter((name) => code(path).includes(name))
          .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
  })

  it('re-exports none of the engine internals the primitives run on', () => {
    const named = ['dist/motion.js', 'dist/types/motion/index.d.ts'].flatMap((path) =>
      ['animateTo', 'animateProperty', 'setFrame']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
    expect(code('dist/motion.js')).not.toMatch(/^export \*/m)
    // The entry was read, so an empty list is meaningful.
    expect(code('dist/types/motion/index.d.ts')).toContain('resolveBinding')
  })
})

describe('the engine and Solid stay dependencies', () => {
  it('re-exports the engine from both entries', () => {
    expect(read('dist/index.js')).toMatch(/^export \* from ["']@polymorph\/engine["'];?$/m)
    expect(read('dist/motion.js')).toMatch(/from ["']@polymorph\/engine\/motion["']/)
  })

  /**
   * A module from outside `src/` in the build means an external pattern missed
   * a specifier: with `preserveModules`, a bundled copy of the engine or of
   * Solid lands beside this package's modules instead of failing the build.
   */
  it('builds only modules that mirror a source file', () => {
    const entries: Record<string, string> = {
      'index.js': 'src/index.ts',
      'motion.js': 'src/motion/index.ts',
    }
    const foreign = modules().filter((path) => {
      const inBuild = path.replace(/^dist\/(server\/)?/, '')
      if (entries[inBuild]) return !existsSync(dist(entries[inBuild]))
      const stem = `src/${inBuild.replace(/\.js$/, '')}`
      return !['.ts', '.tsx', '.css'].some((extension) => existsSync(dist(`${stem}${extension}`)))
    })
    expect(foreign).toEqual([])
    // The generated component was read, so the rule above covered it.
    expect(modules()).toEqual(
      expect.arrayContaining(['dist/icon/Icon.js', 'dist/server/icon/Icon.js']),
    )
  })

  it('declares every package it still imports', () => {
    const bare = new Set<string>()
    for (const path of modules()) {
      for (const match of read(path).matchAll(
        /^(?:import|export)\b[^;'"]*?["']([^"'.][^"']*)["']/gm,
      )) {
        const specifier = match[1] as string
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
    // The scan found the imports, so an empty list of undeclared names is meaningful.
    expect([...bare]).toEqual(expect.arrayContaining(['@polymorph/engine', 'solid-js']))
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
      resolveJsonModule: true,
      jsx: ts.JsxEmit.Preserve,
      jsxImportSource: 'solid-js',
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    })
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const loaded = program.getSourceFiles().map(({ fileName }) => fileName)
    // The program found the declarations, the component's among them, and the engine.
    expect(loaded.filter(own).map((fileName) => relative(PACKAGE, fileName))).toContain(
      'dist/types/icon/Icon.d.ts',
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

  /**
   * The engine publishes only the subpaths in its `publishConfig.exports`. A
   * declaration that names any other workspace package, or another subpath,
   * resolves here and is a missing module for the consumer.
   */
  it('names no workspace package but the engine, and only its published subpaths', () => {
    const engine = JSON.parse(readFileSync(resolve(PACKAGE, '../engine/package.json'), 'utf8')) as {
      publishConfig: { exports: Record<string, unknown> }
    }
    const published = new Set(
      Object.keys(engine.publishConfig.exports).map((subpath) =>
        subpath === '.' ? '@polymorph/engine' : `@polymorph/engine/${subpath.slice(2)}`,
      ),
    )
    const named = files('dist/types')
      .filter((path) => path.endsWith('.d.ts'))
      .flatMap((path) =>
        [...read(path).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](@polymorph\/[^'"]*)['"]/g)].map(
          (match) => ({ path, specifier: match[1] as string }),
        ),
      )
    expect(named.map(({ specifier }) => specifier)).toEqual(
      expect.arrayContaining(['@polymorph/engine', '@polymorph/engine/motion']),
    )
    const internal = named
      .filter(({ specifier }) => !published.has(specifier))
      .map(({ path, specifier }) => `${path}: ${specifier}`)
    expect(internal).toEqual([])
  })
})

describe('the Solid peer range', () => {
  it('declares Solid 1.9 as a peer, not a dependency', () => {
    expect(manifest.peerDependencies['solid-js']).toBe('^1.9.0')
    expect(Object.keys(manifest.dependencies)).not.toContain('solid-js')
  })
})
