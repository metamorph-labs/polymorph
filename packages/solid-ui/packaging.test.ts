import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildSolid, lockSolidDist } from '../solid/dist-lock'

import { buildSolidUi, lockSolidUiDist } from './dist-lock'

/**
 * The published build of `@polymorph/solid-ui` and the manifest that ships it.
 *
 * What a consumer's toolchain reads: every bare import in the shipped source is
 * a dependency or a peer the manifest declares; each member's module imports
 * its compiled recipe, which imports its stylesheet; the entry imports the base
 * layer and the foundation's stylesheet; the server's build, which the `node`
 * condition names, is compiled to strings and imports no stylesheet, so plain
 * Node loads it and renders a member; and every member has its declarations.
 * It is at the package root, in the `logic` project, because it reads files on
 * disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')
const FOUNDATION = resolve(PACKAGE, '../solid')

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
    /\.(ts|tsx)$/.test(path) &&
    !/\.(test|states)\.tsx?$/.test(path) &&
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
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      )
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

  it('pins every Zag package to the version of the foundation’s machine adapter', () => {
    // The foundation's `useMachine` interprets every machine with its own `@zag-js/core`, pinned
    // to the version it is copied from. A machine of another version would run on a core it was
    // not built with, a pairing no install in this workspace runs.
    const foundation = JSON.parse(readFileSync(resolve(FOUNDATION, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const core = foundation.dependencies['@zag-js/core'] ?? ''
    expect(core).toMatch(/^\d+\.\d+\.\d+$/)
    const zag = Object.entries(manifest.dependencies).filter(([name]) =>
      name.startsWith('@zag-js/'),
    )
    expect(zag.map(([name]) => name)).toContain('@zag-js/solid')
    expect(
      zag.filter(([, range]) => range !== core).map(([name, range]) => `${name}@${range}`),
    ).toEqual([])
  })

  it('keeps every stylesheet a bundler may not drop', () => {
    expect(manifest.sideEffects).toContain('**/*.css')
  })

  it('declares Solid 1.9 as a peer, not a dependency', () => {
    expect(manifest.peerDependencies['solid-js']).toBe('^1.9.0')
    expect(Object.keys(manifest.dependencies)).not.toContain('solid-js')
  })
})

/**
 * Every published target, a pattern's expanded to each member's module the
 * build wrote for it: `./dist/controls/*.js` is every member's module under
 * `controls/`, by its PascalCase name. The recipe modules beside them are what
 * the members import. A pattern that matches no file expands to itself, which
 * no file is.
 */
function expanded(target: string): string[] {
  if (!target.includes('*')) return [target]
  const [head, tail] = target.split('*') as [string, string]
  const dir = resolve(PACKAGE, head)
  if (!existsSync(dir)) return [target]
  const found = readdirSync(dir)
    .filter(
      (name) => /^[A-Z]/.test(name) && name.endsWith(tail) && statSync(resolve(dir, name)).isFile(),
    )
    .map((name) => `${head}${name}`)
  return found.length === 0 ? [target] : found
}

describe('the published build', () => {
  let release: () => void

  beforeAll(async () => {
    release = await lockSolidUiDist('packages/solid-ui/packaging.test.ts')
    buildSolidUi()
  }, 600_000)

  afterAll(() => release?.())

  it('points every published entry at a file the build wrote', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      expect(Object.keys(conditions), entry).toEqual([
        'types',
        'solid',
        'browser',
        'node',
        'import',
      ])
      expect(conditions['solid']?.startsWith('./dist/source/'), entry).toBe(true)
      expect(conditions['node']?.startsWith('./dist/server/'), entry).toBe(true)
      expect(conditions['import'], entry).toBe(conditions['browser'])
      for (const target of Object.values(conditions).flatMap(expanded)) {
        expect(existsSync(resolve(PACKAGE, target)), `${entry} → ${target}`).toBe(true)
      }
    }
  })

  it('publishes each member’s own module, in every form, for a consumer that imports one', () => {
    // The elements import each Solid member by its module (`@polymorph/solid-ui/controls/Button`),
    // so a page that uses one element loads that member and what it composes.
    const members = filesUnder(SRC)
      .filter((path) => path.endsWith('.tsx') && !/\.(states|test)\.tsx$/.test(path))
      .map((path) => relative(SRC, path).replace(/\.tsx$/, ''))
    const tiers = new Set(members.map((member) => member.split('/')[0]))
    expect([...tiers].sort()).toEqual(
      Object.keys(manifest.publishConfig.exports)
        .filter((entry) => entry.endsWith('/*'))
        .map((entry) => entry.slice(2, -2))
        .sort(),
    )
    for (const member of members) {
      const [tier, name] = member.split('/') as [string, string]
      const conditions = manifest.publishConfig.exports[`./${tier}/*`] ?? {}
      expect(manifest.exports[`./${tier}/*`], member).toBe(`./src/${tier}/*.tsx`)
      for (const target of Object.values(conditions)) {
        const file = target.replace('*', name)
        expect(existsSync(resolve(PACKAGE, file)), `${member} → ${file}`).toBe(true)
      }
    }
  })

  it('lists in sideEffects every published entry whose module imports a stylesheet', () => {
    // An entry outside `sideEffects` is side-effect free to a bundler, which then
    // drops its stylesheet imports: a Vite and vite-plugin-solid application,
    // which takes the `solid` condition, would lose the base layer.
    const targets = Object.values(manifest.publishConfig.exports).flatMap((conditions) =>
      Object.values(conditions)
        .filter((target) => target.endsWith('.js'))
        .flatMap(expanded),
    )
    const undeclared = [...new Set(targets)].filter(
      (target) =>
        /^import\s+['"][^'"]+\.css['"];?$/m.test(readFileSync(resolve(PACKAGE, target), 'utf8')) &&
        !manifest.sideEffects.includes(target),
    )
    expect(undeclared).toEqual([])
  })

  it('imports the base layer and the foundation’s stylesheet from the entry', () => {
    const entry = readFileSync(resolve(DIST, 'index.js'), 'utf8')
    expect(entry).toContain(`import '@polymorph/solid/style.css'`)
    expect(entry).toContain(`import './base.css'`)
  })

  it('compiles each recipe beside its member, importing its stylesheet', () => {
    const recipes = filesUnder(DIST).filter(
      (path) =>
        path.endsWith('.module.js') &&
        !relative(DIST, path).startsWith('server/') &&
        !relative(DIST, path).startsWith('source/'),
    )
    expect(recipes.length).toBeGreaterThan(20)
    for (const recipe of recipes) {
      const text = readFileSync(recipe, 'utf8')
      const css = /^import '\.\/([^']+\.css)';/m.exec(text)?.[1]
      expect(css, relative(DIST, recipe)).toBeDefined()
      expect(existsSync(resolve(recipe, '..', css as string)), relative(DIST, recipe)).toBe(true)
    }
  })

  it('gives the server a build compiled to strings that imports no stylesheet', () => {
    const server = filesUnder(resolve(DIST, 'server'))
    const modules = server.filter((path) => path.endsWith('.js'))
    expect(modules.length).toBeGreaterThan(20)
    expect(server.filter((path) => path.endsWith('.css'))).toEqual([])
    for (const module of modules) {
      const text = readFileSync(module, 'utf8')
      expect(text, relative(DIST, module)).not.toMatch(/^import '[^']+\.css';/m)
      expect(text, relative(DIST, module)).not.toMatch(/\btemplate\s*(as \w+\s*)?\}?\s*from/)
    }
    expect(readFileSync(resolve(DIST, 'server/controls/Button.js'), 'utf8')).toMatch(/\bssr\b/)
  })

  /**
   * A separate node process imports the server's entry, as a consumer's node
   * does, and renders a member to a string. The foundation resolves to its own
   * server build, and the engine, which is TypeScript source in this
   * workspace, to stand-ins that export the names the builds import from it.
   */
  it('imports the server’s entry in node and renders a member to a string', async () => {
    const releaseFoundation = await lockSolidDist('packages/solid-ui/packaging.test.ts')
    try {
      buildSolid()
      renderOnTheServer()
    } finally {
      releaseFoundation()
    }
  }, 600_000)

  /** Loads the server's entry with the foundation's server build and renders a Badge. */
  const renderOnTheServer = () => {
    const builds = [
      ...filesUnder(resolve(DIST, 'server')),
      ...filesUnder(resolve(FOUNDATION, 'dist/server')),
    ].filter((path) => path.endsWith('.js'))
    const fromEngine: Record<string, Set<string>> = { '@polymorph/engine': new Set() }
    // A vocabulary module reads the engine's helpers through the foundation's re-export.
    const foundation = readFileSync(resolve(FOUNDATION, 'dist/server/index.js'), 'utf8')
    const own = new Set(
      [...foundation.matchAll(/\bexport\s*\{([^}]*)\}/g)].flatMap((match) =>
        (match[1] as string).split(',').map((binding) =>
          binding
            .trim()
            .split(/\s+as\s+/)
            .at(-1),
        ),
      ),
    )
    for (const path of builds) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(
        /^export\s*\*\s*from\s*["'](@polymorph\/engine\/[a-z-]+)["']/gm,
      )) {
        fromEngine[match[1] as string] ??= new Set()
      }
      for (const match of text.matchAll(
        /^(?:import|export)\s*\{([^}]*)\}\s*from\s*["'](@polymorph\/(?:engine(?:\/[a-z-]+)?|solid))["']/gm,
      )) {
        const target = match[2] === '@polymorph/solid' ? '@polymorph/engine' : (match[2] as string)
        const names = (fromEngine[target] ??= new Set())
        for (const binding of (match[1] as string).split(',')) {
          const name = binding.trim().split(/\s+as\s+/)[0]
          if (name && !(match[2] === '@polymorph/solid' && own.has(name))) names.add(name)
        }
      }
    }
    const standIns: Record<string, string> = Object.fromEntries(
      Object.entries(fromEngine).map(([specifier, names]) => [
        specifier,
        `data:text/javascript,${encodeURIComponent(
          [...names].map((name) => `export const ${name} = () => ({})`).join('\n'),
        )}`,
      ]),
    )
    standIns['@polymorph/solid'] = pathToFileURL(resolve(FOUNDATION, 'dist/server/index.js')).href
    standIns['@polymorph/solid/motion'] = pathToFileURL(
      resolve(FOUNDATION, 'dist/server/motion.js'),
    ).href
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
      const { renderToString } = await import('solid-js/web')
      console.log(JSON.stringify({
        button: typeof root.Button,
        tabs: typeof root.Tabs?.Content,
        rendered: renderToString(() => root.Badge({ children: 'New' })),
      }))
    `
    const out = execFileSync('node', ['--input-type=module', '-e', probe], {
      cwd: PACKAGE,
      stdio: 'pipe',
    })
      .toString()
      .trim()
    const result = JSON.parse(out) as Record<string, string>
    expect(result['button']).toBe('function')
    expect(result['tabs']).toBe('function')
    expect(result['rendered']).toMatch(/data-member="badge"[^>]*>New</)
  }

  it('keeps the source a consumer’s Solid compiles, its JSX as written and its imports shipped', () => {
    const source = filesUnder(resolve(DIST, 'source')).filter((path) => /\.jsx?$/.test(path))
    expect(source.length).toBeGreaterThan(100)
    expect(readFileSync(resolve(DIST, 'source/controls/Button.jsx'), 'utf8')).toMatch(/<button\b/)
    // Each relative specifier names a shipped file as it is written, extension included: a
    // bundler that reads the package by Node's rules (webpack's `fullySpecified`) adds none.
    const specifiers = source.flatMap((path) =>
      [
        ...readFileSync(path, 'utf8').matchAll(
          /^(?:import|export)\b[^;'"]*?["'](\.{1,2}\/[^"']+)["']/gm,
        ),
      ].map((match) => ({ path, target: resolve(path, '..', match[1] as string) })),
    )
    expect(specifiers.map(({ target }) => relative(DIST, target))).toEqual(
      expect.arrayContaining(['source/controls/Button.jsx']),
    )
    const unresolved = specifiers
      .filter(({ target }) => !(existsSync(target) && statSync(target).isFile()))
      .map(({ path, target }) => `${relative(DIST, path)}: ${relative(DIST, target)}`)
    expect(unresolved).toEqual([])
    // No test tooling ships: the fixtures, the galleries, the mount helper and the adapter.
    expect(source.filter((path) => /\.states\.|galleries|mount|conformance/.test(path))).toEqual([])
  })

  it('declares every member it ships', () => {
    const members = filesUnder(SRC)
      .filter((path) => path.endsWith('.tsx') && !/\.(states|test)\.tsx$/.test(path))
      .map((path) => relative(SRC, path).replace(/\.tsx$/, ''))
    expect(members.length).toBeGreaterThan(100)
    for (const member of members) {
      expect(existsSync(resolve(DIST, 'types', `${member}.d.ts`)), member).toBe(true)
    }
  })
})
