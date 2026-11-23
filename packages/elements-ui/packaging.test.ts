import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { tagOf } from '@polymorph/elements/definition'
import { PREPAINT_SCRIPT } from '@polymorph/engine'
import { NO_BUILD_FILES } from '@polymorph/registry'

import { buildElementsUi, lockElementsUiDist } from './dist-lock'
import { DEFINITIONS } from './src/definitions'

/**
 * The packaging laws of `@polymorph/elements-ui`: checks on the manifest and
 * on the real build, as the other vocabularies' `packaging.test.ts` make them.
 *
 * Two forms ship. A bundler reads `dist/`: one module per source module, each
 * element's definition module importing the foundation and the Solid member
 * it renders, which the build compiles under `dist/solid/` with its recipe
 * through the reach-through transform under `dist/recipes/`; the
 * declarations name each member's props by the member's own module, which the
 * Solid vocabulary publishes. A page with no build loads `dist/cdn/`: `polymorph.js`, which defines every tag and
 * loads each member's chunk when one of its elements first renders, the
 * chunks, `polymorph-all.js`, `polymorph.css`, a theme sheet per house
 * pairing and `prepaint.js`, the names `polymorph init --framework elements`
 * and the docs use. It runs the build itself and holds the lock over `dist/`
 * from the build to its last read. It lives at the package root, in the
 * `logic` project, because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const ROOT = resolve(PACKAGE, '../..')
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')
const CDN = resolve(ROOT, NO_BUILD_FILES.dir)

/** `scripts/published-side-effects.mjs`, the publish step's rewrite of `sideEffects`. */
const { publishedSideEffects } = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(ROOT, 'scripts/published-side-effects.mjs')).href
)) as { publishedSideEffects: (sideEffects: string[], directory: string) => string[] }

interface Manifest {
  exports: Record<string, string>
  files: string[]
  dependencies: Record<string, string>
  peerDependencies?: Record<string, string>
  sideEffects: string[]
  publishConfig: { exports: Record<string, string | Record<string, string>> }
}

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as Manifest
const solidUi = JSON.parse(
  readFileSync(resolve(PACKAGE, '../solid-ui/package.json'), 'utf8'),
) as Manifest

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

/** Every module specifier a file imports or re-exports, statically. */
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

/** The temporal codecs, which a definition module imports for a member that reads a date or a time. */
const TEMPORAL = '@polymorph/elements/temporal'

/** The definition modules: `src/<tier>/<Name>.ts`. */
const definitionModules = filesUnder(SRC).filter((path) =>
  /^[a-z]+\/[A-Z][A-Za-z]+\.ts$/.test(relative(SRC, path)),
)

/** The run-time screen's modules: `src/screen/*.ts`, without its tests. */
const screenModules = filesUnder(resolve(SRC, 'screen')).filter(
  (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'),
)

/** Whether a published `exports` map resolves a subpath, a pattern's `*` included. */
function resolves(exports: Manifest['publishConfig']['exports'], subpath: string): boolean {
  return Object.keys(exports).some((entry) =>
    entry.includes('*')
      ? subpath.startsWith(entry.split('*')[0] as string) &&
        subpath.endsWith(entry.split('*')[1] as string)
      : entry === subpath,
  )
}

describe('what the shipped source imports, the manifest declares', () => {
  it('resolves every bare specifier of an element from dependencies', () => {
    const declared = new Set(Object.keys(manifest.dependencies))
    const shipped = [
      ...definitionModules,
      resolve(SRC, 'index.ts'),
      resolve(SRC, 'loaders.ts'),
      ...screenModules,
    ]
    const undeclared = shipped.flatMap((path) =>
      importsOf(path)
        .filter((specifier) => !specifier.startsWith('.') && !declared.has(packageOf(specifier)))
        .map((specifier) => `${packageOf(specifier)} ← ${relative(PACKAGE, path)}`),
    )
    expect(undeclared).toEqual([])
  })

  it('imports each Solid member by a module the Solid vocabulary publishes', () => {
    // The workspace resolves `@polymorph/solid-ui/controls/Button` through the Solid vocabulary's
    // `exports`, and an installed package's declarations through its published ones.
    expect(definitionModules.length).toBeGreaterThan(100)
    for (const path of definitionModules) {
      const own = relative(SRC, path).replace(/\.ts$/, '')
      const member = importsOf(path).filter((specifier) =>
        specifier.startsWith('@polymorph/solid-ui'),
      )
      expect(member, own).toEqual([`@polymorph/solid-ui/${own}`])
      expect(resolves(solidUi.publishConfig.exports, `./${own}`), own).toBe(true)
      expect(resolves(solidUi.exports, `./${own}`), own).toBe(true)
      expect(existsSync(resolve(PACKAGE, `../solid-ui/src/${own}.tsx`)), own).toBe(true)
    }
  })

  it('imports the temporal codecs exactly where an element reads a date or a time', () => {
    // They bring the date library, which a page loads only with a member that takes a date.
    const dated = definitionModules.filter((path) => {
      const definition = DEFINITIONS[tagOf(basename(path, '.ts'))]
      expect(definition, relative(SRC, path)).toBeDefined()
      return Object.values(definition?.props ?? {}).some(
        (codec) => typeof codec === 'object' && 'temporal' in codec,
      )
    })
    expect(dated.length).toBeGreaterThan(0)
    for (const path of definitionModules) {
      expect(importsOf(path).includes(TEMPORAL), relative(SRC, path)).toBe(dated.includes(path))
    }
  })

  it('keeps every module that defines an element as a side effect', () => {
    expect(manifest.sideEffects).toEqual(
      expect.arrayContaining([
        '**/*.css',
        './dist/index.js',
        './dist/*/[A-Z]*.js',
        './dist/screen/index.js',
        './dist/cdn/**',
      ]),
    )
  })

  it('publishes the run-time screens at `./screen`, on the run-time core', () => {
    expect(manifest.exports['./screen']).toBe('./src/screen/index.ts')
    expect(manifest.dependencies['@polymorph/screen']).toBe('workspace:*')
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
    release = await lockElementsUiDist('packages/elements-ui/packaging.test.ts')
    buildElementsUi()
  }, 900_000)

  afterAll(() => release?.())

  it('points every published entry at a file the build wrote', () => {
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(
      Object.keys(manifest.exports).sort(),
    )
    for (const [entry, target] of Object.entries(manifest.publishConfig.exports)) {
      const targets = typeof target === 'string' ? [target] : Object.values(target)
      if (typeof target !== 'string')
        expect(Object.keys(target), entry).toEqual(['types', 'import'])
      for (const file of targets) {
        // A pattern's target is checked for one module the build wrote under it.
        const [head, tail] = file.split('*') as [string, string | undefined]
        const found =
          tail === undefined
            ? existsSync(resolve(PACKAGE, file))
            : readdirSync(resolve(PACKAGE, head)).some((name) => name.endsWith(tail))
        expect(found, `${entry} → ${file}`).toBe(true)
      }
    }
  })

  it('writes every element’s definition module, with its declarations, for a bundler', () => {
    for (const path of definitionModules) {
      const own = relative(SRC, path).replace(/\.ts$/, '')
      expect(existsSync(resolve(DIST, `${own}.js`)), own).toBe(true)
      // The foundation first, so its stylesheets come before the member's recipe.
      expect(importsOf(resolve(DIST, `${own}.js`)), own).toEqual([
        '@polymorph/elements',
        `../solid/${own}.js`,
        ...(importsOf(path).includes(TEMPORAL) ? [TEMPORAL] : []),
      ])
      const types = resolve(DIST, `types/${own}.d.ts`)
      expect(existsSync(types), own).toBe(true)
      for (const specifier of importsOf(types).filter((name) =>
        name.startsWith('@polymorph/solid-ui'),
      )) {
        expect(specifier, own).toBe(`@polymorph/solid-ui/${own}`)
      }
    }
    // The test tooling does not ship: the fixtures, the galleries, the mount and the laws.
    expect(
      filesUnder(DIST).filter((path) =>
        /\.states\.|galleries|mount|conformance|parity|bridge/.test(relative(DIST, path)),
      ),
    ).toEqual([])
  })

  it('writes the run-time screens’ entry, which imports its renderer and validator when first used', () => {
    const entry = resolve(DIST, 'screen/index.js')
    expect(existsSync(entry)).toBe(true)
    expect(existsSync(resolve(DIST, 'types/screen/index.d.ts'))).toBe(true)
    // `<poly-screen>` imports the renderer when one connects, and the validator when one checks.
    const element = readFileSync(resolve(DIST, 'screen/element.js'), 'utf8')
    expect(importsOf(resolve(DIST, 'screen/element.js'))).toEqual([])
    expect(element).toMatch(/import\(["'`]\.\/drawing\.js["'`]\)/)
    expect(element).toMatch(/import\(["'`]\.\/check\.js["'`]\)/)
    // The core stays one copy in a consumer's bundle: the build imports it, and compiles none in.
    expect(importsOf(resolve(DIST, 'screen/draw.js'))).toContain('@polymorph/screen/walk')
  })

  /** The modules a bundler reads: every `.js` file of `dist/` but the no-build files. */
  const bundled = () =>
    filesUnder(DIST).filter(
      (path) => path.endsWith('.js') && !relative(DIST, path).startsWith('cdn/'),
    )

  it('compiles in only the Solid members and their recipes, and imports what it declares', () => {
    // The foundations, Solid and Zag stay one copy each in a consumer's bundle: the bridge and
    // the members share the Solid foundation's record of which element holds which member.
    const declared = new Set(Object.keys(manifest.dependencies))
    for (const path of bundled()) {
      const name = relative(DIST, path)
      const text = readFileSync(path, 'utf8')
      expect(text, name).not.toMatch(/\/\/#region .*(node_modules|\.\.\/(solid|elements|engine)\/)/)
      if (/\/\/#region \.\.\/solid-ui\//.test(text)) expect(name, name).toMatch(/^solid\//)
      if (/\/\/#region \.\.\/recipes\//.test(text)) expect(name, name).toMatch(/^recipes\//)
      for (const specifier of importsOf(path)) {
        if (specifier.startsWith('.')) {
          expect(existsSync(resolve(path, '..', specifier)), `${name}: ${specifier}`).toBe(true)
        } else expect(declared.has(packageOf(specifier)), `${name}: ${specifier}`).toBe(true)
      }
    }
  })

  it('compiles each member’s recipe through the reach-through transform, beside the member', () => {
    const button = readFileSync(resolve(DIST, 'solid/controls/Button.js'), 'utf8')
    expect(button).toMatch(/from "\.\.\/\.\.\/recipes\/controls\/button\.module\.js"/)
    expect(readFileSync(resolve(DIST, 'recipes/controls/button.module.js'), 'utf8')).toMatch(
      /^import '\.\/button\.css';/,
    )
    // Grid's spans read its children through a host.
    expect(readFileSync(resolve(DIST, 'recipes/layout/layout.css'), 'utf8')).toContain(
      ':where(:state(poly-host))',
    )
  })

  it('publishes the side effects of every module that defines an element', () => {
    expect(publishedSideEffects(manifest.sideEffects, PACKAGE)).toEqual(
      expect.arrayContaining(['**/*.css', './dist/*/[A-Z]*.js', './dist/cdn/**']),
    )
  })

  describe('the files a page with no build loads', () => {
    const cdn = (file: string) => readFileSync(resolve(CDN, file), 'utf8')
    /** The relative modules a module imports statically, as a browser fetches them. */
    const reached = (file: string, seen = new Set<string>()): Set<string> => {
      if (seen.has(file)) return seen
      seen.add(file)
      for (const match of cdn(file).matchAll(
        /(?:^|[;}\s])(?:import|export)\s*(?:[^'"`();]*?from\s*)?["'`](\.[^"'`]+)["'`]/g,
      )) {
        reached(relative(CDN, resolve(CDN, dirname(file), match[1] as string)), seen)
      }
      return seen
    }
    /** Each tag's chunk, as the loader imports it. */
    const chunks = (): Map<string, string> =>
      new Map(
        [
          ...cdn('polymorph.js').matchAll(
            /"(poly-[a-z-]+)":\s*\(\)\s*=>\s*import\(["'`](\.\/[^"'`]+)["'`]\)/g,
          ),
        ].map((match) => [match[1] as string, relative(CDN, resolve(CDN, match[2] as string))]),
      )

    it('are the files the registry and `polymorph init` name', () => {
      expect(existsSync(CDN)).toBe(true)
      for (const file of ['polymorph.js', 'polymorph-all.js', 'polymorph.css', 'prepaint.js']) {
        expect(existsSync(resolve(CDN, file)), file).toBe(true)
      }
      const systems = readdirSync(resolve(ROOT, 'design/systems'))
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.replace(/\.json$/, ''))
      expect(readdirSync(resolve(CDN, 'themes')).sort()).toEqual(
        systems.map((system) => `${system}.css`).sort(),
      )
      for (const system of systems) {
        expect(cdn(`themes/${system}.css`), system).toContain(`[data-system="${system}"]`)
      }
      expect(cdn('prepaint.js').trim()).toBe(PREPAINT_SCRIPT)
    })

    it('define every tag from polymorph.js, each loading a chunk of its own', () => {
      const loaded = chunks()
      expect([...loaded.keys()].sort()).toEqual(Object.keys(DEFINITIONS).sort())
      for (const [tag, chunk] of loaded) expect(existsSync(resolve(CDN, chunk)), tag).toBe(true)
    })

    it('load no member with polymorph.js itself', () => {
      // What a page fetches before its first element renders: the loader and what it imports.
      const first = reached('polymorph.js')
      const members = [...chunks().values()]
      expect(members.filter((chunk) => first.has(chunk))).toEqual([])
      expect([...first].some((file) => cdn(file).includes('customElements.define'))).toBe(true)
    })

    it('load a Button page with no other member than what Button composes', () => {
      // A shared chunk holding the vocabulary's index would bring every compound's parts.
      const button = chunks().get('poly-button') as string
      const page = reached(button, reached('polymorph.js'))
      const others = [...chunks()]
        .filter(([tag]) => !['poly-button', 'poly-icon', 'poly-badge'].includes(tag))
        .map(([, chunk]) => chunk)
      expect(others.filter((chunk) => page.has(chunk))).toEqual([])
      for (const file of page) {
        expect(cdn(file), file).not.toMatch(
          /data-member["']?[,:=]\s*["'`](table-row|tabs-content|toast)/,
        )
      }
    })

    it('load a Button page with no date library, which comes with a member that reads a date', () => {
      // The date library's Gregorian calendar, which names itself `gregory`. The minifier keeps
      // property names, and writes a string in any of the three quotes.
      const library = /\bidentifier\s*=\s*["'`]gregory["'`]/
      const holding = (tag: string) =>
        [...reached(chunks().get(tag) as string, reached('polymorph.js'))].filter((file) =>
          library.test(cdn(file)),
        )
      expect(holding('poly-button')).toEqual([])
      expect(holding('poly-date-picker')).not.toEqual([])
    })

    it('put every element in polymorph-all.js, which imports nothing', () => {
      const all = cdn('polymorph-all.js')
      expect(reached('polymorph-all.js')).toEqual(new Set(['polymorph-all.js']))
      expect(all).not.toMatch(/\bimport\s*\(/)
      // The minifier writes a string in any of the three quotes.
      for (const tag of Object.keys(DEFINITIONS)) {
        expect(all, tag).toMatch(new RegExp(`tag:["'\`]${tag}["'\`]`))
      }
    })

    it('name no `process`, which a browser does not have', () => {
      // The engine's `devWarning` and Zag read `process.env.NODE_ENV`, which a bundler replaces.
      // No bundler reads these files, so the build replaces it; left in place, the first warning
      // on a page throws and its element renders nothing.
      const files = (directory: string): string[] =>
        readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? files(resolve(directory, entry.name))
            : entry.name.endsWith('.js')
              ? [resolve(directory, entry.name)]
              : [],
        )
      const scripts = files(CDN)
      expect(scripts.length).toBeGreaterThan(2)
      for (const file of scripts) {
        expect(readFileSync(file, 'utf8'), relative(CDN, file)).not.toMatch(
          /\bprocess\s*\.\s*env\b/,
        )
      }
    })

    it('export restore, toast, loadAgentBridge and loadScreen from both scripts', () => {
      for (const file of ['polymorph.js', 'polymorph-all.js']) {
        const exported = [...cdn(file).matchAll(/export\s*\{([^}]*)\}/g)].flatMap((match) =>
          (match[1] as string).split(',').map((binding) =>
            binding
              .trim()
              .split(/\s+as\s+/)
              .at(-1),
          ),
        )
        expect(exported.sort(), file).toEqual(['loadAgentBridge', 'loadScreen', 'restore', 'toast'])
      }
    })

    // The name of the event a step dispatches, which the bridge's code holds and the minifier keeps.
    const bridge = /polymorph:agentchange/
    // A tool's name, which the tools' definitions hold.
    const tools = /polymorph_snapshot/
    /** The chunks `polymorph.js` imports when something asks, other than a tag's. */
    const imported = (): string[] => {
      const tags = new Set(chunks().values())
      return [
        ...new Set(
          [...cdn('polymorph.js').matchAll(/import\(["'`](\.\/chunks\/[^"'`]+)["'`]\)/g)].map(
            (match) => relative(CDN, resolve(CDN, match[1] as string)),
          ),
        ),
      ].filter((file) => !tags.has(file))
    }

    /**
     * Strings only one part of the run-time screen holds, which the minifier
     * keeps: the renderer says a node "has no element on this page", the
     * vocabulary table holds each member's purpose (Alert's is "Inline status
     * callout"), the validator suggests a name ("did you mean") and the card
     * opens "# Writing a screen".
     */
    const SCREEN = {
      renderer: /has no element on this page/,
      table: /Inline status callout/,
      validator: /did you mean/,
      card: /# Writing a screen/,
    }
    /** The chunks `polymorph.js` imports for a run-time screen: the ones that reach its renderer or its validator. */
    const screenImports = (): string[] =>
      imported().filter((file) =>
        [...reached(file)].some(
          (reach) => SCREEN.renderer.test(cdn(reach)) || SCREEN.validator.test(cdn(reach)),
        ),
      )

    /** The chunks `polymorph.js` imports for the agent bridge and its setting. */
    const lazy = (): string[] => {
      const screens = new Set(screenImports())
      return imported().filter((file) => !screens.has(file))
    }

    it('keep the run-time screen out of polymorph.js, in chunks a page fetches when it draws or checks one', () => {
      const first = reached('polymorph.js')
      for (const [part, marker] of Object.entries(SCREEN)) {
        expect(
          [...first].filter((file) => marker.test(cdn(file))),
          part,
        ).toEqual([])
      }
      // `<poly-screen>` is defined by polymorph.js, and draws through a chunk it imports.
      expect(cdn('polymorph.js')).toMatch(/["'`]poly-screen["'`]/)
      const imports = screenImports()
      // The drawing, the validator `check()` fetches, and what `loadScreen` resolves to.
      expect(imports).toHaveLength(3)
      const holding = (file: string, marker: RegExp) =>
        [...reached(file)].some((reach) => !first.has(reach) && marker.test(cdn(reach)))
      const drawing = imports.filter(
        (file) => holding(file, SCREEN.renderer) && !holding(file, SCREEN.card),
      )
      expect(drawing).toHaveLength(1)
      // It is the chunk that dispatches `<poly-screen>`'s events.
      expect(cdn(drawing[0] as string)).toMatch(/["'`]poly-action["'`]/)
      // A page that only draws fetches the renderer and the table, and neither the validator nor the card.
      expect(holding(drawing[0] as string, SCREEN.table)).toBe(true)
      expect(holding(drawing[0] as string, SCREEN.validator)).toBe(false)
      expect(holding(drawing[0] as string, SCREEN.card)).toBe(false)
      // What `loadScreen` resolves to holds all four.
      const api = imports.filter((file) => holding(file, SCREEN.card))
      expect(api).toHaveLength(1)
      for (const marker of Object.values(SCREEN))
        expect(holding(api[0] as string, marker)).toBe(true)
      // A Button's chunk holds none of it.
      const button = reached(chunks().get('poly-button') as string, first)
      for (const marker of Object.values(SCREEN)) {
        expect([...button].filter((file) => marker.test(cdn(file)))).toEqual([])
      }
      // polymorph-all.js holds every part.
      for (const marker of Object.values(SCREEN)) expect(cdn('polymorph-all.js')).toMatch(marker)
    })

    it('keep the agent bridge in a chunk a page fetches only when it calls loadAgentBridge or its setting asks', () => {
      const bridged = lazy().filter((file) => bridge.test(cdn(file)))
      expect(bridged).toHaveLength(1)
      // Nothing a page loads at once, and nothing a Button's chunk loads, holds the bridge or the
      // tools' definitions.
      const loaded = reached(chunks().get('poly-button') as string, reached('polymorph.js'))
      expect([...loaded].filter((file) => bridge.test(cdn(file)) || tools.test(cdn(file)))).toEqual(
        [],
      )
      // The members write to the registry the bridge reads: the bridge imports the module the
      // page already loaded, and holds no registry of its own.
      const registry = [...reached(bridged[0] as string)].filter(
        (file) => file !== bridged[0] && loaded.has(file),
      )
      expect(registry).not.toEqual([])
      expect(cdn('polymorph-all.js')).toMatch(bridge)
      expect(cdn('polymorph-all.js')).toMatch(tools)
    })

    it('keep the tools’ definitions in a chunk of their own, which a page fetches only when its agent setting asks', () => {
      const [bridged] = lazy().filter((file) => bridge.test(cdn(file)))
      const setting = lazy().filter((file) => !bridge.test(cdn(file)))
      expect(setting).toHaveLength(1)
      const fetched = reached(setting[0] as string)
      // What `data-agent="on-call"` fetches holds the definitions and none of the bridge, and none
      // of it is a file every page loads.
      const definitions = [...fetched].filter((file) => tools.test(cdn(file)))
      expect(definitions).toHaveLength(1)
      expect([...fetched].filter((file) => bridge.test(cdn(file)))).toEqual([])
      const first = reached('polymorph.js')
      expect([...fetched].filter((file) => first.has(file))).toEqual([])
      // The definitions are in the build once: the bridge imports the same chunk.
      expect(reached(bridged as string).has(definitions[0] as string)).toBe(true)
      const holding = readdirSync(resolve(CDN, 'chunks'))
        .map((name) => `chunks/${name}`)
        .filter((file) => tools.test(cdn(file)) && !bridge.test(cdn(file)))
      expect(holding).toEqual(definitions)
      // `polymorph.js` reads the setting and imports the setting's chunk; `polymorph-all.js` reads
      // it too, and holds what it would fetch.
      expect(cdn('polymorph.js')).toContain('data-agent')
      expect(cdn('polymorph-all.js')).toContain('data-agent')
    })

    it('hold the base layer, every recipe through the reach-through, Icon’s, the host rule and the rules for an element not rendered', () => {
      const css = cdn('polymorph.css')
      expect(css).toContain('::selection')
      expect(css).toContain('--pm-icon-size')
      expect(css).toContain(':state(poly-host):not([hidden])')
      expect(css).toMatch(/poly-dialog:not\(:state\(poly-host\)\)>:not\(\[slot\]\)/)
      expect(css).toContain(':where(:state(poly-host))')
      // Each recipe's classes, by the local names its CSS Module declares.
      const recipes = filesUnder(resolve(ROOT, 'packages/recipes/src')).filter((path) =>
        path.endsWith('.module.css'),
      )
      expect(recipes.length).toBeGreaterThan(100)
      const missing = recipes.filter((path) => {
        const local = /\.([a-z][a-zA-Z0-9]*)\b/.exec(
          readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
        )
        return local !== null && !css.includes(`_${local[1]}_`)
      })
      expect(missing.map((path) => relative(ROOT, path))).toEqual([])
    })
  })
})
