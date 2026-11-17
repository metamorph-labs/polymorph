import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildReactUi, lockReactUiDist } from './dist-lock'

/**
 * Tests the vocabulary's published build.
 *
 * Inside this repository everything consumes `src/`, so nothing else would
 * notice a build that dropped a stylesheet, a `'use client'` directive or a
 * declaration file, or that gave Node a module importing a stylesheet. The only
 * symptom would be a consumer's unstyled or broken screen, or a test suite that
 * cannot import the package. This runs the real build (`vite.build.config.ts`)
 * and checks what a consumer's toolchain would. `packages/engine/packaging.test.ts`
 * is the same law for the engine, and `server-render.test.ts` loads this build
 * in Node and renders every member with it.
 */

const PACKAGE = import.meta.dirname
const dist = (path: string) => resolve(PACKAGE, path)

/** `scripts/published-side-effects.mjs`, the publish step's rewrite of `sideEffects`. */
const { publishedSideEffects } = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(PACKAGE, '../../scripts/published-side-effects.mjs'))
    .href
)) as { publishedSideEffects: (sideEffects: string[], directory: string) => string[] }
const manifest = JSON.parse(readFileSync(dist('package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  files: string[]
  sideEffects: string[]
  imports: Record<string, Record<string, string>>
  exports: Record<string, string>
  publishConfig: { exports: Record<string, unknown> }
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

const read = (path: string) => readFileSync(dist(path), 'utf8')

/** The JavaScript entry points, by built file name. */
const ENTRIES = ['index', 'identity', 'identity-signup', 'galleries']

/** The subpath import a built module loads a stylesheet through. */
const STYLESHEET = '#stylesheet/'

/** Every built module, as a path from the package: `dist/controls/Button.js`. */
const modules = () =>
  files(dist('dist'))
    .filter((path) => path.endsWith('.js'))
    .map((path) => path.slice(PACKAGE.length + 1))

/**
 * The specifier of every stylesheet a module imports, in order. A stylesheet is
 * imported for its effect alone, so the statement names no binding.
 */
const stylesheetImports = (path: string) =>
  [...read(path).matchAll(/^import ['"]([^'"]+\.css)['"];?$/gm)].map((match) => match[1] as string)

/**
 * The lock is held for the whole file, not only around the build.
 *
 * This file runs the build itself, so a pass does not depend on a stale `dist/`.
 * `packages/cli/init.test.ts` runs the same build, vitest runs the two files in
 * parallel workers, and every assertion below reads the tree the build writes.
 * `dist-lock.ts` describes the failure modes and why this shape prevents them.
 */
let release: (() => void) | undefined

beforeAll(async () => {
  release = await lockReactUiDist('packaging.test.ts')
  buildReactUi()
}, 900_000)

afterAll(() => {
  release?.()
})

describe('the published surface exists', () => {
  it('resolves every export target to a real file', () => {
    const targets: string[] = []
    const walk = (value: unknown): void => {
      if (typeof value === 'string') targets.push(value)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(manifest.publishConfig.exports)
    expect(targets.filter((target) => !existsSync(dist(target)))).toEqual([])
  })

  it('ships only what a consumer installs', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'CHANGELOG.md'])
  })
})

describe('a member brings its own styles', () => {
  it('imports its compiled stylesheet from the module that uses it', () => {
    expect(read('dist/controls/Button.js')).toMatch(/from ["']\.\/button\.module\.js["']/)
    expect(stylesheetImports('dist/controls/button.module.js')).toEqual([
      `${STYLESHEET}base.css`,
      `${STYLESHEET}controls/button.css`,
    ])
    expect(read('dist/controls/button.css')).toMatch(/\._button_/)
  })

  it('names no built stylesheet `.module.css`', () => {
    // A consumer's bundler compiles any `*.module.css` as a CSS Module again,
    // re-hashing class names the JavaScript already has and dropping a bare
    // `import` of one. The built files are plain CSS and are named that way.
    const named = files(dist('dist')).filter((path) => path.endsWith('.module.css'))
    expect(named).toEqual([])
  })

  it('imports every stylesheet through the imports map, and each one exists', () => {
    // A relative `.css` import is one Node cannot load. The subpath import is
    // resolved by condition (below), and under every condition that gives a
    // stylesheet it gives `dist/<the path after the prefix>`.
    const wrong: string[] = []
    const imported = new Set<string>()
    for (const path of modules()) {
      for (const specifier of stylesheetImports(path)) {
        const file = specifier.slice(STYLESHEET.length)
        if (!specifier.startsWith(STYLESHEET) || !existsSync(dist(`dist/${file}`))) {
          wrong.push(`${path}: ${specifier}`)
        }
        imported.add(file)
      }
    }
    expect(wrong).toEqual([])
    // Every stylesheet the build wrote has a module that imports it, so none
    // waits for an application to import it by hand.
    const built = files(dist('dist'))
      .filter((path) => path.endsWith('.css'))
      .map((path) => path.slice(dist('dist').length + 1))
    expect(built.filter((file) => !imported.has(file))).toEqual([])
    expect(built.length).toBeGreaterThan(50)
  })

  it('brings the base layer with every recipe, before the recipe’s own stylesheet', () => {
    // No entry point imports the base layer (below), so the module that brings
    // a member's stylesheet brings the base layer too.
    const styled = modules().filter((path) => stylesheetImports(path).length > 0)
    expect(styled.length).toBeGreaterThan(50)
    expect(styled.filter((path) => stylesheetImports(path)[0] !== `${STYLESHEET}base.css`)).toEqual(
      [],
    )
    expect(existsSync(dist('dist/base.css'))).toBe(true)
  })

  it('outweighs the base layer with every rule a recipe writes', () => {
    // A bundler decides where the base layer lands among the recipes'
    // stylesheets, and it may differ between a development server and a
    // production build. The base layer selects elements, pseudo-elements and
    // the universal selector only. A recipe's rule that selected by element
    // alone would tie with it, and the order would then decide the winner.
    const elementOnly = (selector: string) => !/[.[#]|(?<!:):(?!:|before|after)/.test(selector)
    const selectors = (css: string) =>
      [...css.replace(/@[\w-]+[^{;]*;/g, '').matchAll(/(?:^|[{}])([^{}@]+)\{/g)].flatMap((match) =>
        (match[1] as string).split(','),
      )
    expect(selectors(read('dist/base.css')).filter((selector) => !elementOnly(selector))).toEqual(
      [],
    )
    const ties = files(dist('dist'))
      .filter((path) => path.endsWith('.css') && path !== dist('dist/base.css'))
      .flatMap((path) =>
        selectors(readFileSync(path, 'utf8'))
          // A keyframe's selector is a position in the animation, not an element.
          .filter((selector) => !/^(?:from|to|[\d.]+%)$/.test(selector.trim()))
          .filter(elementOnly)
          .map((selector) => `${path.slice(dist('dist').length + 1)}: ${selector}`),
      )
    expect(ties).toEqual([])
  })

  it('compiles each recipe beside its member, and imports nothing from the recipes package', () => {
    // A member imports its recipe from `@polymorph/recipes`. The build compiles
    // it into the member's directory. A module that still imported the package
    // would hand a consumer's bundler a CSS Module it may not compile, and Node
    // a stylesheet it cannot load, and the declared dependency would hide it
    // from the check on undeclared imports below.
    const importing = modules().filter((path) => /['"]@polymorph\/recipes\//.test(read(path)))
    expect(importing).toEqual([])
    expect(existsSync(dist('dist/controls/button.module.js'))).toBe(true)
    expect(existsSync(dist('dist/conventions/base.css'))).toBe(false)
  })
})

describe('a recipe means the same after the build’s minifier', () => {
  /** Every built stylesheet, by its path in `dist/`. */
  const sheets = () =>
    files(dist('dist'))
      .filter((path) => path.endsWith('.css'))
      .map((path) => [path.slice(dist('dist').length + 1), readFileSync(path, 'utf8')] as const)

  it('leaves the duration of a scroll-driven animation at `auto`', () => {
    // The minifier writes an `animation` shorthand out as longhands, with the
    // `0s` the shorthand resets the duration to. A scroll-driven animation
    // with a duration of `0s` switches at the start of its range instead of
    // following the scroll, which only a built stylesheet shows. So a recipe
    // that names an `animation-timeline` writes its animation as longhands.
    const driven = sheets().filter(([, css]) => css.includes('animation-timeline:'))
    expect(driven.map(([path]) => path)).toContain('overlays/tabs.css')
    expect(
      driven.filter(([, css]) => /animation-duration:0s/.test(css)).map(([path]) => path),
    ).toEqual([])
  })

  it('reads the Tabs strip’s direction from the root’s own `dir`', () => {
    // The minifier rewrites `:dir(rtl)` as a list of languages, and a language
    // is not the strip's direction: Radix writes `dir="ltr"` on the root of a
    // strip in an Arabic page unless it is told otherwise.
    const tabs = read('dist/overlays/tabs.css')
    expect(tabs).toMatch(/\[data-orientation=horizontal\]\[dir=rtl\]/)
    expect(tabs).not.toContain(':lang(')
  })
})

describe('a bundler follows a name through an entry point to its module', () => {
  it('imports no stylesheet from an entry point', () => {
    // An entry point that imported a stylesheet would have to be declared as
    // having side effects, and a bundler keeps such a module whole: every
    // member it re-exports, and every stylesheet those bring, on a page that
    // renders one Button.
    expect(ENTRIES.filter((entry) => stylesheetImports(`dist/${entry}.js`).length > 0)).toEqual([])
  })

  it('publishes no built entry point as having side effects', () => {
    const published = publishedSideEffects(manifest.sideEffects, PACKAGE)
    expect(published).toEqual(['**/*.css'])
  })

  it('declares every source entry point that imports a stylesheet, which the workspace bundles', () => {
    // Inside this repository `exports` points at `src/`, so an app here bundles
    // the source entries. A bundler that believes a re-exporting module has no
    // side effects skips it, which would drop the base layer it imports.
    const undeclared = Object.values(manifest.exports).filter(
      (entry) =>
        /^import ['"][^'"]+\.css['"];?$/m.test(readFileSync(dist(entry), 'utf8')) &&
        !manifest.sideEffects.includes(entry),
    )
    expect(undeclared).toEqual([])
  })
})

describe('Node loads the build without a stylesheet', () => {
  // Node cannot import a `.css` file, and Vitest and a server render hand
  // `node_modules` to Node. `server-render.test.ts` loads the build that way.

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

  it('builds no second copy of the modules for Node', () => {
    // `consumption.test.ts` holds the published `exports` to one target per
    // entry point. This holds the build to one tree.
    expect(existsSync(dist('dist/node'))).toBe(false)
    expect(modules().filter((path) => /^dist\/(?:node|server|browser)\//.test(path))).toEqual([])
  })
})

describe('the client directives survive the build', () => {
  const directive = (path: string) => /^["']use client["']/.test(read(path))

  it('keeps one on a module that needs a browser', () => {
    expect(directive('dist/controls/Button.js')).toBe(true)
    expect(directive('dist/overlays/Dialog.js')).toBe(true)
  })

  it('adds none to a module that does not', () => {
    expect(directive('dist/structure/Heading.js')).toBe(false)
  })

  it('keeps the directive first in a module that imports a stylesheet', () => {
    // A directive counts only as the first statement of its module.
    const late = modules().filter(
      (path) => /^["']use client["']/m.test(read(path)) && !directive(path),
    )
    expect(late).toEqual([])
  })
})

describe('what the build leaves for the consumer to resolve', () => {
  it('is a production build, whatever NODE_ENV the build ran under', () => {
    // React's development JSX runtime in a published package makes every
    // consumer's app slower and noisier. The build script pins NODE_ENV, and
    // this checks that it stays pinned, because vitest runs with NODE_ENV=test.
    const dev = files(dist('dist')).filter(
      (path) => path.endsWith('.js') && readFileSync(path, 'utf8').includes('jsx-dev-runtime'),
    )
    expect(dev).toEqual([])
  })

  it('declares every package it still imports', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    const bare = new Set<string>()
    for (const path of files(dist('dist')).filter((file) => file.endsWith('.js'))) {
      for (const match of readFileSync(path, 'utf8').matchAll(
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
    expect([...bare].filter((name) => !declared.has(name)).sort()).toEqual([])
  })

  it('ships declarations that name no unpublished workspace package', () => {
    expect(existsSync(dist('dist/types/index.d.ts'))).toBe(true)
    // Only `@polymorph/react` passes. The engine is only a dev dependency of
    // this package, for the tests' theme setup. A declaration that named it
    // resolves here through the workspace, and a consumer's compiler resolves it
    // from this package's dependencies, where it is missing. Members reach the
    // engine through `@polymorph/react`. A type the compiler inferred is written
    // as `import("…")`, so those specifiers are read as well as `from`.
    const internal = files(dist('dist/types'))
      .filter((path) => path.endsWith('.d.ts'))
      .filter((path) =>
        /(?:\bfrom\s*|\bimport\s*\(\s*)['"]@polymorph\/(?!react['"/])/.test(
          readFileSync(path, 'utf8'),
        ),
      )
    expect(internal).toEqual([])
  })
})
