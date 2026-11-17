import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildEngine, lockEngineDist } from './dist-lock'

/**
 * The packaging laws: checks on the real build output.
 *
 * Everything here can fail without any other test noticing. A naive build emits
 * one chunk per entry and zero `'use client'` directives, because Rollup drops a
 * directive it cannot hoist to a whole chunk. The workspace consumes source and
 * every other test runs against source, so the only symptom would be a
 * consumer's build failing on an import.
 *
 * This file runs the real build and checks what a consumer's toolchain needs:
 * the published entry points exist and import in plain Node, the directives are
 * present, no framework and no stylesheet is in the package, and the
 * declarations stand on their own.
 *
 * It lives at the package root, not in `src/`, because `src/**` is the engine's
 * browser project and this is a node test about files on disk.
 */

const PACKAGE = import.meta.dirname
const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  publishConfig: { exports: Record<string, unknown> }
}

const dist = (path: string) => resolve(PACKAGE, path)

/**
 * The lock is held for the whole file, not only around the build.
 *
 * This file runs the build itself, so a pass does not depend on a stale `dist/`.
 * `packages/cli/scratch.test.ts` runs the same build, vitest runs the two files
 * in parallel workers, and every assertion below reads the tree the build writes.
 * The lock is taken before the build and released after the last read. A mutex
 * around the build command alone would still let the other build empty `dist/`
 * during the assertions. `dist-lock.ts` describes both failure modes and why
 * this shape prevents them.
 */
let release: (() => void) | undefined

beforeAll(async () => {
  release = await lockEngineDist('packaging.test.ts')
  buildEngine()
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

/** Every file the bundler wrote, relative to the package. The declarations are left out. */
function builtFiles(): string[] {
  const found: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (!entry.isDirectory()) found.push(relative(PACKAGE, path))
      else if (entry.name !== 'types' && entry.name !== '.tsc') walk(path)
    }
  }
  walk(dist('dist'))
  return found
}

/**
 * The packages the built JavaScript still imports, by name.
 *
 * This reads the built files, not the source, because only the build shows
 * which imports survive bundling. The engine bundles `@polymorph/theme`, so the
 * theme's runtime dependencies become the engine's.
 */
function bareImports(): string[] {
  const bare = new Set<string>()
  for (const file of builtFiles().filter((path) => path.endsWith('.js'))) {
    const source = readFileSync(dist(file), 'utf8')
    // Statements only. The Vite entry has `from '@polymorph/engine/runtime'`
    // inside a string, in the module it generates for the application.
    for (const match of source.matchAll(/^(?:import|export)\b[^;'"]*?["']([^"']+)["']/gm)) {
      const specifier = match[1] as string
      // Keep only bare specifiers. Bundled source also has other quoted text
      // after the word `from`.
      if (!/^(@[a-z0-9-][\w.-]*\/)?[a-z0-9-][\w.-]*(\/.+)?$/i.test(specifier)) continue
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
      bare.add(
        specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] as string),
      )
    }
  }
  return [...bare].sort()
}

describe('the published surface exists', () => {
  it('resolves every export target to a real file', () => {
    const missing = exportTargets().filter((target) => !existsSync(dist(target)))
    expect(missing, 'a consumer resolving these would get a module-not-found').toEqual([])
  })

  it('ships no stylesheet', () => {
    // A `.css` import throws in plain Node, where the theme engine and the Vite
    // plugin run. Stylesheets belong to the packages that render.
    expect(builtFiles().filter((path) => path.endsWith('.css'))).toEqual([])
    expect(exportTargets().filter((target) => target.endsWith('.css'))).toEqual([])
  })

  it('ships only what a consumer installs', () => {
    // Source, tests and fixtures stay in the repository; `files` is the list.
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })

  /**
   * A separate node process imports the files from the package directory. An
   * `await import()` inside vitest goes through Vite's transform pipeline, so it
   * would test whether Vite can load the files, which no consumer needs. It would
   * also resolve bare specifiers against this repository instead of against the
   * package's own dependencies.
   */
  it('imports in node, from the built files rather than from source', () => {
    const probe = `
      const root = await import('./dist/index.js')
      const motion = await import('./dist/motion.js')
      const runtime = await import('./dist/runtime.js')
      const vite = await import('./dist/vite.js')
      const testing = await import('./dist/testing.js')
      const qr = await import('./dist/qr.js')
      const charts = await import('./dist/charts.js')
      const markdown = await import('./dist/markdown.js')
      const agent = await import('./dist/agent.js')
      const webmcp = await import('./dist/webmcp.js')
      console.log(JSON.stringify({
        dataAttrs: typeof root.dataAttrs,
        gallerySlug: typeof root.gallerySlug,
        resolveTheme: typeof root.resolveTheme,
        axes: Array.isArray(root.AXIS_NAMES),
        iconRoles: Array.isArray(root.ICON_ROLES),
        motionAtRoot: root.resolveBinding !== undefined || root.animateTo !== undefined,
        resolveBinding: typeof motion.resolveBinding,
        animateTo: typeof motion.animateTo,
        setSystem: typeof runtime.setSystem,
        engineInRuntime: runtime.resolveTheme !== undefined,
        polymorphTheme: typeof vite.polymorphTheme,
        installTestTheme: typeof testing.installTestTheme,
        agentRegistrations: typeof testing.agentRegistrations,
        qrSymbol: typeof qr.qrSymbol,
        linePath: typeof charts.linePath,
        createReading: typeof charts.createReading,
        barChartModel: typeof charts.barChartModel,
        parseMarkdown: typeof markdown.parseMarkdown,
        agentMember: typeof root.agentMember,
        createAgentBridge: typeof agent.createAgentBridge,
        agentTools: typeof agent.agentTools,
        registerWebMCP: typeof agent.registerWebMCP,
        registerWebMCPOnCall: typeof webmcp.registerWebMCPOnCall,
        applyAgentSetting: typeof webmcp.applyAgentSetting,
        agentAttribute: webmcp.AGENT_ATTRIBUTE,
        bridgeInWebMCP: ['createAgentBridge', 'agentTools', 'registerWebMCP'].filter(
          (name) => name in webmcp,
        ),
        subpathsAtRoot: ['qrSymbol', 'linePath', 'parseMarkdown', 'createAgentBridge', 'agentTools', 'registerWebMCPOnCall', 'applyAgentSetting'].filter(
          (name) => name in root,
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
      dataAttrs: 'function',
      gallerySlug: 'function',
      // The theme engine is re-exported, so one install brings one version.
      resolveTheme: 'function',
      axes: true,
      iconRoles: true,
      // The motion engine is not at the root. Its containment law holds in the
      // build: application code must not reach motion choreography.
      motionAtRoot: false,
      resolveBinding: 'function',
      animateTo: 'function',
      setSystem: 'function',
      // The runtime is the setters without the theme engine, so an application
      // that compiles its themes at build time ships no derivation code.
      engineInRuntime: false,
      polymorphTheme: 'function',
      installTestTheme: 'function',
      agentRegistrations: 'function',
      qrSymbol: 'function',
      linePath: 'function',
      // The chart engine's machines and models, which every framework's charts drive.
      createReading: 'function',
      barChartModel: 'function',
      parseMarkdown: 'function',
      // The agent registry is in the root, which every member reaches, and the
      // bridge that reads it is a subpath.
      agentMember: 'function',
      createAgentBridge: 'function',
      agentTools: 'function',
      registerWebMCP: 'function',
      // The tools registered before the bridge loads, and a page's agent setting, are a subpath
      // of their own that holds none of the bridge.
      registerWebMCPOnCall: 'function',
      applyAgentSetting: 'function',
      agentAttribute: 'data-agent',
      bridgeInWebMCP: [],
      // The QR encoder, the chart paths, the Markdown parser and the agent
      // bridge are subpaths, so an application that imports the root for its
      // theme does not load them.
      subpathsAtRoot: [],
    })
    /*
     * Spawning node and importing ten built entries takes over a second on an
     * idle machine and several on a busy one. Vitest's default per-test timeout
     * is five seconds. `pnpm proof` runs this suite four times while a browser
     * project and a build compete for the same cores, and the default times out
     * there. That failure is unrelated to the assertions, so the timeout is
     * raised.
     */
  }, 30_000)

  it('bundles no copy of a dependency', () => {
    // Dependencies are not bundled. A `dist/node_modules/**` means an external
    // pattern missed a subpath.
    expect(existsSync(dist('dist/node_modules'))).toBe(false)
  })

  /**
   * `@polymorph/engine/webmcp` registers the tools before the bridge loads, so
   * a bundler must reach none of the bridge from it statically: the bridge is
   * the chunk a page fetches on the first call. A page's agent setting runs on
   * every page that loads the elements' no-build script, so its module
   * imports nothing statically and holds no tool's definition.
   */
  it('reaches none of the bridge from the webmcp entry except by a dynamic import', () => {
    const reached = new Set<string>()
    const walk = (file: string): void => {
      if (reached.has(file)) return
      reached.add(file)
      const source = readFileSync(dist(file), 'utf8')
      for (const match of source.matchAll(
        /^(?:import|export)\b[^;'"]*?from\s*["'](\.[^"']+)["']/gm,
      )) {
        walk(relative(PACKAGE, resolve(dist(file), '..', match[1] as string)))
      }
    }
    walk('dist/webmcp.js')
    expect([...reached].sort()).toEqual([
      'dist/agent/context.js',
      'dist/agent/definitions.js',
      'dist/agent/setting.js',
      'dist/agent/webmcp.js',
      'dist/webmcp.js',
    ])
    const setting = readFileSync(dist('dist/agent/setting.js'), 'utf8')
    expect(setting).not.toMatch(/^import\b/m)
    expect(setting).not.toContain('polymorph_snapshot')
    expect(setting).toContain('import("./on-call.js")')
    expect(readFileSync(dist('dist/agent/on-call.js'), 'utf8')).toContain('import("../agent.js")')
  })

  /**
   * Every bare import left in the build must be a package the consumer has.
   *
   * The theme's dependencies become the engine's when the theme is bundled, and
   * nothing else checks that the engine declares them. A published file that
   * imports a package without declaring it resolves here, where pnpm hoists it
   * into the workspace, and fails in the consumer's repository.
   */
  it('declares every package it still imports', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies),
    ])
    expect(bareImports().filter((name) => !declared.has(name))).toEqual([])
  })

  /**
   * The engine is what a consumer installs on any web framework. A UI
   * framework, its DOM renderer, a framework's Zag binding and the icon set
   * belong to the foundations. One import of them here would make every
   * consumer install it, whatever it renders with. So the engine's imports are
   * held to a list of framework-free packages, not checked against a list of
   * frameworks a new one could be missing from. `@polymorph/theme` is bundled
   * into the build, and `vite` is the peer the Vite plugin runs inside.
   */
  it('imports no UI framework and no icon set: only the packages listed here', () => {
    const allowed = new Set([
      '@internationalized/date',
      'culori',
      'd3-array',
      'd3-scale',
      'd3-shape',
      'zod',
      'vite',
    ])
    const named = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies),
    ].filter((name) => name !== '@polymorph/theme')
    expect(bareImports().filter((name) => !allowed.has(name))).toEqual([])
    expect(named.filter((name) => !allowed.has(name))).toEqual([])
  })
})

/**
 * The declarations, checked the way a consumer's compiler checks them.
 *
 * Nothing in this repository reads `dist/types`. The workspace typechecks
 * source with `skipLibCheck` on. A consumer with it off reads every published
 * declaration. The engine reads two of its decisions from `design/`, so a
 * declaration that imports a file the package does not ship is an error in
 * their typecheck. The closed type it should carry (`IconRole`,
 * `DurationClass`) then widens to `string | number | symbol` everywhere it is
 * used.
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
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    })
    // Only diagnostics in the engine's own files, or with no file, count. Faults
    // inside a dependency's declarations belong to that dependency.
    const own = (fileName: string) => fileName.startsWith(`${dist('dist')}/`)
    const read = program.getSourceFiles().map(({ fileName }) => fileName)
    // The program found the declarations, so an empty fault list is meaningful.
    expect(read.filter(own).map((fileName) => relative(PACKAGE, fileName))).toContain(
      'dist/types/icon/roles.d.ts',
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

  it('carries the declarations of the one package it bundles', () => {
    // `scripts/emit-types.mjs` emits the theme's declarations into `_internal/`
    // and rewrites every `@polymorph/theme` specifier to point there.
    expect(readdirSync(dist('dist/types/_internal'))).toEqual(['theme'])
  })
})

describe('the build keeps client directives', () => {
  const startsWithDirective = (path: string) =>
    /^["']use client["']/.test(readFileSync(dist(path), 'utf8'))

  it('keeps one on a module that needs a browser', () => {
    // The environment reader reads the document's computed style.
    expect(startsWithDirective('dist/motion/environment.js')).toBe(true)
    // The agent bridge reads the mounted members' elements.
    expect(startsWithDirective('dist/agent/bridge.js')).toBe(true)
    // The lookup of the browser's WebMCP API, and a page's agent setting, which reads it too.
    expect(startsWithDirective('dist/agent/context.js')).toBe(true)
    expect(startsWithDirective('dist/agent/setting.js')).toBe(true)
  })

  it('adds none to a module that does not', () => {
    // A server component or a build script can import the root and the binding
    // resolver. Marking every module as client would lose that.
    expect(startsWithDirective('dist/motion/patterns.js')).toBe(false)
    expect(startsWithDirective('dist/index.js')).toBe(false)
    // The tools' definitions are data, and the registration reaches the browser through the lookup.
    expect(startsWithDirective('dist/agent/definitions.js')).toBe(false)
    expect(startsWithDirective('dist/agent/webmcp.js')).toBe(false)
  })
})
