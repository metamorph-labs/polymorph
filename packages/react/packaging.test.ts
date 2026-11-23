import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildReact, lockReactDist } from './dist-lock'

/**
 * The packaging laws: checks on the real build output.
 *
 * Everything here can fail without any other test noticing. A naive build emits
 * two entries and zero `'use client'` directives, because Rollup drops a
 * directive it cannot hoist to a whole chunk. The workspace consumes source and
 * every other test runs against source, so the only symptom would be an RSC
 * consumer's build failing on an import.
 *
 * This file runs the real build and checks what a consumer's toolchain needs:
 * the published entry points exist and import in node, the engine and the
 * run-time screen core stay dependencies instead of being bundled, the motion
 * surface and the screen renderer stay on their subpaths, the directives are
 * present, the stylesheet is there, and the declarations typecheck.
 *
 * It lives at the package root, not in `src/`, because `src/**` is this
 * package's browser project and this is a node test about files on disk.
 */

const PACKAGE = import.meta.dirname
const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  imports: Record<string, Record<string, string>>
  publishConfig: { exports: Record<string, unknown> }
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

/** The built modules, without the declarations. */
const modules = () =>
  files('dist').filter((path) => path.endsWith('.js') && !path.startsWith('dist/types/'))

/**
 * The lock is held for the whole file, not only around the build.
 *
 * This file runs the build itself, so a pass does not depend on a stale `dist/`.
 * `packages/cli/scratch.test.ts` runs the same build, vitest runs the two files
 * in parallel workers, and every assertion below reads the tree the build writes.
 * The lock is taken before the build and released after the last read.
 * `dist-lock.ts` describes the failure modes and why this shape prevents them.
 */
let release: (() => void) | undefined

beforeAll(async () => {
  release = await lockReactDist('packaging.test.ts')
  buildReact()
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

describe('the published surface exists', () => {
  it('resolves every export target to a real file', () => {
    const missing = exportTargets().filter((target) => !existsSync(dist(target)))
    expect(missing, 'a consumer resolving these would get a module-not-found').toEqual([])
    // The three entries and the stylesheet, by name, so a shrunken exports map cannot pass.
    expect(exportTargets()).toEqual(
      expect.arrayContaining([
        './dist/index.js',
        './dist/motion.js',
        './dist/screen.js',
        './dist/react.css',
      ]),
    )
  })

  it('ships the stylesheet the icon gateway needs', () => {
    expect(read('dist/react.css')).toContain('--pm-icon-size')
  })

  it('imports the stylesheet from Icon’s recipe module, through the imports map', () => {
    // Icon brings its own styles, so an application imports no stylesheet by
    // hand. A `.css` import throws in plain Node, so the import is a subpath
    // import the `imports` map resolves by condition (below), and a script or a
    // server render can still load every module.
    const importers = modules().filter((path) => /^import ["'][^"']+\.css["'];?$/m.test(read(path)))
    expect(importers).toEqual(['dist/icon/icon.module.js'])
    expect(read('dist/icon/icon.module.js')).toMatch(/^import '#stylesheet\/react\.css';\n/)
  })

  it('resolves a stylesheet import to the stylesheet for a bundler and to nothing for Node', () => {
    // A resolver takes the first condition it matches. A framework's server
    // components layer matches `react-server` and `node`, and it collects the
    // stylesheets a server component imports, so `react-server` comes first.
    // Plain Node matches `node` alone and gets a module that imports nothing.
    expect(manifest.imports).toEqual({
      '#stylesheet/*': {
        'react-server': './dist/*',
        node: './dist/no-stylesheet.js',
        default: './dist/*',
      },
    })
    expect(Object.keys(manifest.imports['#stylesheet/*']!)).toEqual([
      'react-server',
      'node',
      'default',
    ])
    expect(read('dist/no-stylesheet.js')).not.toMatch(/\b(?:import|require)\b/)
  })

  it('ships only what a consumer installs', () => {
    // Source, tests and fixtures stay in the repository; `files` is the list.
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })

  /**
   * A separate node process imports the entries from the package directory. An
   * `await import()` inside vitest goes through Vite's transform pipeline, so it
   * would test whether Vite can load the files, which no consumer needs.
   *
   * The engine and the run-time screen core are the exception. In this
   * workspace `@polymorph/engine` and `@polymorph/screen` resolve to TypeScript
   * source, which plain node cannot load. The probe answers their specifiers
   * with stand-ins that export the names the build imports from them, the
   * technique `packages/rules/packaging.test.ts` uses, so React, `lucide` and
   * this package's own modules load exactly as a consumer's node loads them.
   * The engine's and the core's own packaging laws check that their builds
   * import in node.
   */
  it('imports every entry in node, from the built files rather than from source', () => {
    const fromEngine: Record<string, Set<string>> = {
      '@polymorph/engine': new Set(),
      '@polymorph/engine/motion': new Set(),
      '@polymorph/screen/walk': new Set(),
    }
    for (const path of modules()) {
      // A subpath the build re-exports whole (`@polymorph/engine/qr`) gets a stand-in too.
      for (const match of read(path).matchAll(
        /^export\s*\*\s*from\s*["'](@polymorph\/engine\/[a-z-]+)["']/gm,
      )) {
        fromEngine[match[1] as string] ??= new Set()
      }
      for (const match of read(path).matchAll(
        /^(?:import|export)\s*\{([^}]*)\}\s*from\s*["'](@polymorph\/(?:engine|screen)(?:\/[a-z-]+)?)["']/gm,
      )) {
        const names = (fromEngine[match[2] as string] ??= new Set())
        for (const binding of (match[1] as string).split(',')) {
          const name = binding.trim().split(/\s+as\s+/)[0]
          if (name) names.add(name)
        }
      }
    }
    // The scan found the imports, so each stand-in exports what the build names.
    expect([...(fromEngine['@polymorph/engine'] ?? [])]).toContain('memberAttr')
    expect([...(fromEngine['@polymorph/engine/motion'] ?? [])]).toContain('animateTo')
    expect([...(fromEngine['@polymorph/screen/walk'] ?? [])]).toContain('createScreen')

    const standIns = Object.fromEntries(
      Object.entries(fromEngine).map(([specifier, names]) => [
        specifier,
        `data:text/javascript,${encodeURIComponent(
          [...names].map((name) => `export const ${name} = () => {}`).join('\n'),
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
      const root = await import('./dist/index.js')
      const motion = await import('./dist/motion.js')
      const screen = await import('./dist/screen.js')
      console.log(JSON.stringify({
        icon: typeof root.Icon,
        brandMark: typeof root.BrandMark,
        rootMotion: ['MotionSurface', 'MotionPresence', 'MotionIndicator'].filter((name) => name in root),
        presence: typeof motion.MotionPresence,
        surface: typeof motion.MotionSurface,
        indicator: typeof motion.MotionIndicator,
        resolveBinding: typeof motion.resolveBinding,
        internals: ['animateTo', 'animateProperty', 'setFrame'].filter((name) => name in motion),
        rootScreen: ['ScreenView', 'useScreen', 'ScreenDrawing'].filter((name) => name in root),
        screen: ['ScreenView', 'useScreen', 'ScreenDrawing', 'componentFor', 'parsePartial'].map(
          (name) => typeof screen[name],
        ),
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    expect(JSON.parse(out)).toEqual({
      icon: 'function',
      brandMark: 'function',
      rootMotion: [],
      presence: 'function',
      surface: 'function',
      indicator: 'function',
      resolveBinding: 'function',
      internals: [],
      rootScreen: [],
      screen: ['function', 'function', 'function', 'function', 'function'],
    })
    // Spawning node and loading React and `lucide` takes over a second on an
    // idle machine and several under the full suite's load.
  }, 30_000)
})

/**
 * The motion presence components are for member internals, so they live on
 * `./motion` and never on the root. That subpath re-exports the engine's motion
 * module by name, without `animateTo`, `animateProperty` and `setFrame`, which
 * only the presence components call (`src/motion/index.ts`). Comments are
 * stripped first, because a declaration keeps its source's docblocks and those
 * name what the entry leaves out.
 */
describe('the motion surface stays on its subpath', () => {
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('keeps the presence components out of the root entry', () => {
    const named = ['dist/index.js', 'dist/types/index.d.ts'].flatMap((path) =>
      ['MotionSurface', 'MotionPresence', 'MotionIndicator', './motion/']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
  })

  it('re-exports none of the engine internals the presence components run on', () => {
    const named = ['dist/motion.js', 'dist/types/motion/index.d.ts'].flatMap((path) =>
      ['animateTo', 'animateProperty', 'setFrame']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
    // `export *` would re-export the three without naming them.
    expect(code('dist/motion.js')).not.toMatch(/^export \*/m)
    expect(code('dist/types/motion/index.d.ts')).not.toMatch(/^export \*/m)
    // The entry was read, so an empty list is meaningful.
    expect(code('dist/types/motion/index.d.ts')).toContain('resolveBinding')
  })
})

/**
 * The renderer of a run-time screen is for an application, and a member never
 * draws one, so it lives on `./screen` and never on the root. A consumer that
 * imports the root loads none of it and none of `@polymorph/screen`.
 */
describe('the screen renderer stays on its subpath', () => {
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('keeps the renderer out of the root entry', () => {
    const named = ['dist/index.js', 'dist/types/index.d.ts'].flatMap((path) =>
      ['ScreenView', 'useScreen', 'ScreenDrawing', './screen/', '@polymorph/screen']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
  })

  it('imports the run-time core only from the renderer’s own modules', () => {
    const importers = modules().filter((path) => /from\s*["']@polymorph\/screen/.test(read(path)))
    // The scan found the renderer, so the list is meaningful.
    expect(importers).toEqual(expect.arrayContaining(['dist/screen.js', 'dist/screen/view.js']))
    expect(
      importers.filter((path) => path !== 'dist/screen.js' && !path.startsWith('dist/screen/')),
    ).toEqual([])
  })
})

describe('the engine stays a dependency', () => {
  it('re-exports the engine from both entries', () => {
    expect(read('dist/index.js')).toMatch(/^export \* from ["']@polymorph\/engine["'];?$/m)
    // The motion entry re-exports the engine's motion module by name.
    expect(read('dist/motion.js')).toMatch(/from ["']@polymorph\/engine\/motion["']/)
  })

  /**
   * A module from outside `src/` in the build means an external pattern missed
   * a specifier. With `preserveModules`, a bundled copy of the engine or of
   * React lands beside this package's own modules instead of failing the build,
   * and the consumer then runs two theme engines or two Reacts.
   */
  it('builds only modules that mirror a source file', () => {
    const entries: Record<string, string> = {
      'dist/index.js': 'src/index.ts',
      'dist/motion.js': 'src/motion/index.ts',
      'dist/screen.js': 'src/screen/index.ts',
    }
    const foreign = modules().filter((path) => {
      // The module a stylesheet import resolves to in Node. The build writes it.
      if (path === 'dist/no-stylesheet.js') return false
      if (entries[path]) return !existsSync(dist(entries[path]))
      const stem = path.replace(/^dist\//, 'src/').replace(/\.js$/, '')
      return !['.ts', '.tsx', '.css'].some((extension) => existsSync(dist(`${stem}${extension}`)))
    })
    expect(foreign).toEqual([])
  })

  it('declares every package it still imports', () => {
    const bare = new Set<string>()
    for (const path of modules()) {
      for (const match of read(path).matchAll(
        /^(?:import|export)\b[^;'"]*?["']([^"'.][^"']*)["']/gm,
      )) {
        const specifier = match[1] as string
        // A subpath import is this package's own file, by its `imports` map.
        if (specifier.startsWith('#')) continue
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
    expect([...bare]).toEqual(
      expect.arrayContaining(['@polymorph/engine', '@polymorph/screen', 'react']),
    )
  })

  it('is a production build, whatever NODE_ENV the build ran under', () => {
    // Vitest runs with NODE_ENV=test, and the React plugin follows NODE_ENV. The
    // build script sets it to production so a published file never contains the
    // development JSX runtime.
    const development = modules().filter((path) => read(path).includes('jsx-dev-runtime'))
    expect(development).toEqual([])
  })
})

/**
 * The declarations, checked the way a consumer's compiler checks them.
 *
 * Nothing in this repository reads `dist/types`. The workspace typechecks
 * source with `skipLibCheck` on. A consumer with it off reads every published
 * declaration, and a fault in one is an error in their typecheck.
 *
 * `@polymorph/engine` resolves through this package's workspace link to the
 * engine's source, the same types its published declarations are emitted from.
 * The engine's own packaging test checks those declarations. `resolveJsonModule`
 * is on only for the engine's source, which reads two decisions from `design/`.
 * Without it `IconRole` and `BindingName` would widen to
 * `string | number | symbol` and this check would pass against types no
 * consumer sees. This package's declarations cannot import JSON:
 * `tsconfig.build.json` roots them at `src/`, so a source file that read
 * `design/` fails the build.
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
      jsx: ts.JsxEmit.ReactJSX,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    })
    // Only diagnostics in this package's own files, or with no file, count.
    // Faults inside a dependency belong to that dependency.
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const loaded = program.getSourceFiles().map(({ fileName }) => fileName)
    // The program found the declarations and the engine, so an empty fault
    // list is meaningful.
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
    // A program over every declaration and its dependencies takes seconds, and
    // longer under the full suite's load.
  }, 60_000)

  /**
   * `@polymorph/theme` is bundled into the engine and never published, and the
   * engine and the run-time screen core publish only the subpaths in their
   * `publishConfig.exports`. A declaration that names anything else resolves
   * here, through the workspace, and is a missing module for the consumer. A
   * type the compiler inferred is written as `import("…")`, so those specifiers
   * are read as well as `from`.
   */
  it('names no workspace package but the engine and the screen core, and only their published subpaths', () => {
    const subpaths = (name: string) => {
      const manifest = JSON.parse(
        readFileSync(resolve(PACKAGE, `../${name}/package.json`), 'utf8'),
      ) as { publishConfig: { exports: Record<string, unknown> } }
      return Object.keys(manifest.publishConfig.exports).map((subpath) =>
        subpath === '.' ? `@polymorph/${name}` : `@polymorph/${name}/${subpath.slice(2)}`,
      )
    }
    const published = new Set([...subpaths('engine'), ...subpaths('screen')])
    expect([...published].filter((name) => name.startsWith('@polymorph/engine')).sort()).toEqual([
      '@polymorph/engine',
      '@polymorph/engine/agent',
      '@polymorph/engine/charts',
      '@polymorph/engine/markdown',
      '@polymorph/engine/motion',
      '@polymorph/engine/qr',
      '@polymorph/engine/rich-text',
      '@polymorph/engine/rich-text-editor',
      '@polymorph/engine/runtime',
      '@polymorph/engine/testing',
      '@polymorph/engine/vite',
      '@polymorph/engine/vite-env',
      '@polymorph/engine/webmcp',
    ])

    // A docblock's example (`import * as members from '@polymorph/react-ui'`) is no import, so
    // comments are left out.
    const named = files('dist/types')
      .filter((path) => path.endsWith('.d.ts'))
      .flatMap((path) =>
        [
          ...read(path)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](@polymorph\/[^'"]*)['"]/g),
        ].map((match) => ({ path, specifier: match[1] as string })),
      )
    // The scan found the engine's and the core's names, so an empty list of faults is meaningful.
    expect(named.map(({ specifier }) => specifier)).toEqual(
      expect.arrayContaining([
        '@polymorph/engine',
        '@polymorph/engine/motion',
        '@polymorph/screen/walk',
      ]),
    )
    const internal = named
      .filter(({ specifier }) => !published.has(specifier))
      .map(({ path, specifier }) => `${path}: ${specifier}`)
    expect(internal).toEqual([])
  })
})

describe('the build keeps client directives', () => {
  const startsWithDirective = (path: string) => /^["']use client["']/.test(read(path))

  it('keeps one on a module that needs a browser', () => {
    expect(startsWithDirective('dist/motion/presence.js')).toBe(true)
    expect(startsWithDirective('dist/motion/indicator.js')).toBe(true)
    expect(startsWithDirective('dist/conventions/dev.js')).toBe(true)
    expect(startsWithDirective('dist/conventions/control-ref.js')).toBe(true)
    expect(startsWithDirective('dist/screen/draw.js')).toBe(true)
    expect(startsWithDirective('dist/screen/view.js')).toBe(true)
  })

  it('adds none to a module that does not', () => {
    // Icon takes a role and renders an `<svg>`, so it stays a server component in
    // the build. The entries re-export the engine, and a directive on one would
    // put the engine in every consumer's client bundle.
    expect(startsWithDirective('dist/icon/Icon.js')).toBe(false)
    expect(startsWithDirective('dist/index.js')).toBe(false)
    expect(startsWithDirective('dist/motion.js')).toBe(false)
    // The screen entry re-exports a server-safe parser beside the client components.
    expect(startsWithDirective('dist/screen.js')).toBe(false)
    expect(startsWithDirective('dist/screen/members.js')).toBe(false)
  })
})

describe('the React peer range is 19 only', () => {
  it('declares ^19.0.0', () => {
    expect(manifest.peerDependencies['react']).toBe('^19.0.0')
    expect(manifest.peerDependencies['react-dom']).toBe('^19.0.0')
  })

  /**
   * React 18 is not supported because it would need code changes. The vocabulary
   * takes `ref` as an ordinary prop in two places and has no `forwardRef`. A
   * function component that receives `ref` in props needs React 19. Supporting 18
   * would mean adding `forwardRef` back and changing those components' types, not
   * only widening the peer range.
   */
  it('takes ref as a prop, which React 18 does not support', () => {
    const anchor = readFileSync(
      resolve(PACKAGE, '../react-ui/src/overlays/trigger-anchor.tsx'),
      'utf8',
    )
    const presence = readFileSync(resolve(PACKAGE, 'src/motion/presence.tsx'), 'utf8')

    expect(anchor).toContain('ComponentPropsWithRef')
    expect(presence).toContain('ref?: Ref<HTMLElement>')
    expect(anchor).not.toContain('forwardRef')
    expect(presence).not.toContain('forwardRef')
  })
})
