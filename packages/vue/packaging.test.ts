import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The packaging laws of `@polymorph/vue`: checks on the real build output, as
 * `packages/react/packaging.test.ts` makes them for the React foundation.
 *
 * The workspace consumes source and every other test runs against source, so
 * a fault here shows only in a consumer's install: an export target the build
 * did not write, an entry that cannot load in plain Node, a bundled copy of the
 * engine or of Vue, the presence composables reaching the root, a stylesheet
 * missing, or a declaration that fails a strict consumer's typecheck.
 *
 * It runs the build itself, so a pass does not depend on a stale `dist/`. No
 * other test builds this package, so it takes no lock over `dist/`, as the
 * React foundation's laws must. It lives at the package root, in the `logic`
 * project, because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const ROOT = resolve(PACKAGE, '../..')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
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

beforeAll(() => {
  try {
    execFileSync('pnpm', ['--filter', '@polymorph/vue', 'build'], { cwd: ROOT, stdio: 'pipe' })
  } catch (error) {
    // `pipe` keeps a passing run quiet; a failing one must show the compiler's output.
    const failed = error as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `vue: the build failed\n${failed.stdout?.toString() ?? ''}${failed.stderr?.toString() ?? ''}`,
    )
  }
}, 600_000)

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
    // The two entries and the stylesheet, by name, so a shrunken exports map cannot pass.
    expect(exportTargets()).toEqual(
      expect.arrayContaining(['./dist/index.js', './dist/motion.js', './dist/vue.css']),
    )
  })

  it('ships the stylesheet the icon gateway needs', () => {
    expect(read('dist/vue.css')).toContain('--pm-icon-size')
  })

  it('imports the stylesheet from no module', () => {
    // A `.css` import throws in plain Node, so a script or a server render could
    // not load the package. The vocabulary's entry imports the stylesheet for
    // its consumers instead (`packages/vue-ui/vite.build.config.ts`).
    const importers = modules().filter((path) => /^import ["'][^"']+\.css["'];?$/m.test(read(path)))
    expect(importers).toEqual([])
  })

  it('ships only what a consumer installs', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })

  /**
   * A separate node process imports the entries from the package directory, as
   * a consumer's node does; an `await import()` inside vitest would go through
   * Vite's transform pipeline instead. `@polymorph/engine` resolves to
   * TypeScript source in this workspace, which plain node cannot load, so the
   * probe answers its specifiers with stand-ins that export the names the
   * build imports from them, as the React foundation's law does. Vue and this
   * package's own modules load as a consumer's node loads them.
   */
  it('imports both entries in node, from the built files rather than from source', () => {
    const fromEngine: Record<string, Set<string>> = {
      '@polymorph/engine': new Set(),
      '@polymorph/engine/motion': new Set(),
    }
    for (const path of modules()) {
      // A subpath the build re-exports whole (`@polymorph/engine/qr`) gets a stand-in too.
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
    // The scan found the imports, so each stand-in exports what the build names.
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
      const root = await import('./dist/index.js')
      const motion = await import('./dist/motion.js')
      console.log(JSON.stringify({
        icon: typeof root.Icon,
        glyph: typeof root.Glyph,
        controlRef: typeof root.useControlRef,
        rootMotion: ['usePresence', 'useKeyedPresence'].filter((name) => name in root),
        presence: typeof motion.usePresence,
        keyedPresence: typeof motion.useKeyedPresence,
        resolveBinding: typeof motion.resolveBinding,
        internals: ['animateTo', 'animateProperty', 'setFrame'].filter((name) => name in motion),
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    expect(JSON.parse(out)).toEqual({
      icon: 'object',
      glyph: 'function',
      controlRef: 'function',
      rootMotion: [],
      presence: 'function',
      keyedPresence: 'function',
      resolveBinding: 'function',
      internals: [],
    })
  }, 30_000)
})

/**
 * The presence composables are for member internals, so they live on
 * `./motion` and never on the root, and that subpath re-exports the engine's
 * motion module by name, without the animator the composables run on. Comments
 * are stripped first, because a declaration keeps its source's docblocks.
 */
describe('the motion surface stays on its subpath', () => {
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('keeps the presence composables out of the root entry', () => {
    const named = ['dist/index.js', 'dist/types/index.d.ts'].flatMap((path) =>
      ['usePresence', 'useKeyedPresence', './motion/']
        .filter((name) => code(path).includes(name))
        .map((name) => `${path}: ${name}`),
    )
    expect(named).toEqual([])
  })

  it('re-exports none of the engine internals the composables run on', () => {
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

describe('the engine and Vue stay dependencies', () => {
  it('re-exports the engine from both entries', () => {
    expect(read('dist/index.js')).toMatch(/^export \* from ["']@polymorph\/engine["'];?$/m)
    expect(read('dist/motion.js')).toMatch(/from ["']@polymorph\/engine\/motion["']/)
  })

  /**
   * A module from outside `src/` in the build means an external pattern missed
   * a specifier: with `preserveModules`, a bundled copy of the engine or of Vue
   * lands beside this package's modules instead of failing the build. A
   * single-file component is built as the component and its script, both named
   * after the `.vue` file.
   */
  it('builds only modules that mirror a source file', () => {
    const entries: Record<string, string> = {
      'dist/index.js': 'src/index.ts',
      'dist/motion.js': 'src/motion/index.ts',
    }
    const foreign = modules().filter((path) => {
      if (entries[path]) return !existsSync(dist(entries[path]))
      const stem = path
        .replace(/^dist\//, 'src/')
        .replace(/\.js$/, '')
        .replace(/\.vue_vue_type_[a-z_]+$/, '')
      return !['.ts', '.vue', '.css'].some((extension) => existsSync(dist(`${stem}${extension}`)))
    })
    expect(foreign).toEqual([])
    // The single-file component was read, so the rule above covered it.
    expect(modules()).toContain('dist/icon/Icon.js')
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
    expect([...bare]).toEqual(expect.arrayContaining(['@polymorph/engine', 'vue']))
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
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    })
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const loaded = program.getSourceFiles().map(({ fileName }) => fileName)
    // The program found the declarations, the component's among them, and the engine.
    expect(loaded.filter(own).map((fileName) => relative(PACKAGE, fileName))).toContain(
      'dist/types/icon/Icon.vue.d.ts',
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

describe('the Vue peer range', () => {
  it('declares Vue 3.5 as a peer, not a dependency', () => {
    expect(manifest.peerDependencies['vue']).toBe('^3.5.0')
    expect(Object.keys(manifest.dependencies)).not.toContain('vue')
  })
})
