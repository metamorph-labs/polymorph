import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildAngular, lockAngularDist } from '../angular/dist-lock'
import { buildEngine, lockEngineDist } from '../engine/dist-lock'

import { buildAngularUi, lockAngularUiDist } from './dist-lock'

/**
 * The published build of `@polymorph/angular-ui` and the manifest that ships it.
 *
 * An Angular library ships partially compiled code, which the application's
 * Angular links to the Angular it runs, in the Angular package format's flat
 * module, and the Angular CLI compiles no stylesheet a module imports, so the
 * build compiles each member's recipe into its component's styles
 * (`packages/angular/scripts/package.mjs`). What a consumer's toolchain reads:
 * every export target exists; the package is one flat module under
 * `fesm2022/`, holding every member and compound part, and every shipped
 * module keeps its declarations; every component is a partial declaration; a
 * member that draws with a recipe carries the recipe's rules in its styles; no
 * module imports a stylesheet, and the base layer ships as `base.css`; the
 * published `sideEffects` names only shipped files; no test tooling ships;
 * every relative import names a shipped file; and every package the build
 * imports is declared. It is at the package root, in the `logic` project,
 * because it reads files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  sideEffects: string[]
  exports: Record<string, string>
  publishConfig: { exports: Record<string, string | Record<string, string>> }
}

/** `scripts/published-side-effects.mjs`, the publish step's rewrite of `sideEffects`. */
const { publishedSideEffects } = (await import(
  /* @vite-ignore */ pathToFileURL(resolve(PACKAGE, '../../scripts/published-side-effects.mjs'))
    .href
)) as { publishedSideEffects: (sideEffects: string[], directory: string) => string[] }

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** Test tooling: the laws, the fixtures, the galleries, the mount helpers and the adapter. */
const tooling = (local: string) =>
  /\.(test|states)\.ts$/.test(local) ||
  /(^|\/)(test-setup|mount|galleries)\.ts$/.test(local) ||
  local.startsWith('conformance/')

const packageOf = (specifier: string) => {
  const [first, second] = specifier.split('/')
  return specifier.startsWith('@') ? `${first}/${second}` : (first ?? specifier)
}

const imports = (text: string) =>
  [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  )

let releaseFoundation: () => void = () => {}
let release: () => void = () => {}
let built: string[] = []

beforeAll(async () => {
  // The vocabulary compiles against the foundation's published declarations, built from the
  // source the vocabulary is, so a build left from older source cannot change the outcome.
  releaseFoundation = await lockAngularDist('packages/angular-ui/packaging.test.ts')
  release = await lockAngularUiDist('packages/angular-ui/packaging.test.ts')
  // Both builds compile against the engine's published declarations, which the
  // engine's packaging test and the CLI's install tests rewrite in parallel
  // workers, so the engine's lock is held through them (`packages/angular/
  // packaging.test.ts` says the same). Locks are taken in one order everywhere:
  // the foundation, then the vocabulary, then the engine.
  const releaseEngine = await lockEngineDist('packages/angular-ui/packaging.test.ts')
  try {
    buildEngine()
    buildAngular()
    buildAngularUi()
  } finally {
    releaseEngine()
  }
  built = filesUnder(DIST)
}, 900_000)

afterAll(() => {
  release()
  releaseFoundation()
})

const BUNDLE = join(DIST, 'fesm2022/polymorph-angular-ui.mjs')

/**
 * The declaration a flat module makes for a component class: the
 * `ɵɵngDeclareComponent({ … type: Button, … })` call, to the next declaration.
 * The bundler may suffix a class whose name another module also uses.
 */
function declarationOf(bundle: string, name: string): string {
  const type = new RegExp(`type: ${name}(\\$\\d+)?,`)
  for (const match of bundle.matchAll(/ɵɵngDeclareComponent\(/g)) {
    const end = bundle.indexOf('ɵɵngDeclare', match.index + 1)
    const block = bundle.slice(match.index, end === -1 ? undefined : end)
    if (type.test(block)) return block
  }
  return ''
}

describe('the build of @polymorph/angular-ui', () => {
  it('writes every export target the published manifest names', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      const targets = typeof conditions === 'string' ? [conditions] : Object.values(conditions)
      for (const target of targets) {
        expect(existsSync(resolve(PACKAGE, target)), `${entry}: ${target}`).toBe(true)
      }
    }
  })

  it('ships one flat module, every member’s declarations, and no test tooling', () => {
    expect(built.filter((path) => /\.m?js$/.test(path))).toEqual([BUNDLE])
    const shipped = filesUnder(SRC).filter(
      (path) => path.endsWith('.ts') && !path.endsWith('.d.ts') && !tooling(relative(SRC, path)),
    )
    for (const path of shipped) {
      const local = relative(SRC, path).replace(/\.ts$/, '')
      expect(built, local).toContain(join(DIST, `${local}.d.ts`))
    }
    expect(
      built
        .map((path) => relative(DIST, path))
        .filter((local) => tooling(local.replace(/\.d\.ts$/, '.ts'))),
    ).toEqual([])
  })

  it('declares every component partially, and carries each member’s recipe in its styles', () => {
    const bundle = readFileSync(BUNDLE, 'utf8')
    expect(bundle).not.toContain('ɵɵdefineComponent')
    const members = filesUnder(SRC).filter(
      (path) => /\/[A-Z]\w+\.ts$/.test(path) && !tooling(relative(SRC, path)),
    )
    expect(members.length).toBeGreaterThan(100)
    for (const path of members) {
      const source = readFileSync(path, 'utf8')
      const name = /^export class (\w+)/m.exec(source)?.[1]
      if (name === undefined || !source.includes('@Component(')) continue
      const declaration = declarationOf(bundle, name)
      expect(declaration, `${relative(SRC, path)}: ${name}`).not.toBe('')
      if (!/^import \w+ from '@polymorph\/recipes\//m.test(source)) continue
      // The recipe's rules are inlined into the component's styles.
      expect(declaration, `${name}: the recipe's rules`).toMatch(/styles: \[\s*"[^"]*\./)
    }
  })

  it('compiles the recipes through the reach-through transform, so a rule reaches through a host', () => {
    const bundle = readFileSync(BUNDLE, 'utf8')
    // Grid's column span is read over `.grid > *`, which a member's host stands in.
    const grid = declarationOf(bundle, 'Grid')
    expect(grid, 'Grid’s styles reach through a host').toContain(':where([data-pm-host]) > *')
    const row = declarationOf(bundle, 'SettingsRow')
    expect(row, 'SettingsRow’s rule reaches through a host').toContain(':where([data-pm-host])')
  })

  it('declares its source entry, which imports the base layer, as having side effects', () => {
    // Inside this repository `exports` points at `src/`, so an app here bundles the source entry.
    // A bundler that believed it had no side effects would skip it to reach the members it
    // re-exports, and drop its import of the base layer.
    const undeclared = Object.values(manifest.exports).filter(
      (entry) =>
        /^import ['"][^'"]+\.css['"];?$/m.test(readFileSync(resolve(PACKAGE, entry), 'utf8')) &&
        !manifest.sideEffects.includes(entry),
    )
    expect(undeclared).toEqual([])
  })

  it('publishes in sideEffects the stylesheets, and no file the package does not ship', () => {
    // The publish step writes a source entry as its built counterpart, or drops it when the build
    // writes none. This build bundles every module into the flat module, which imports no
    // stylesheet, so `./src/index.ts` is dropped and the stylesheets are what is left.
    const published = publishedSideEffects(manifest.sideEffects, PACKAGE)
    expect(published).toContain('**/*.css')
    expect(
      published.filter((path) => !path.includes('*') && !existsSync(resolve(PACKAGE, path))),
    ).toEqual([])
  })

  it('imports no stylesheet, and ships the base layer as base.css', () => {
    expect(imports(readFileSync(BUNDLE, 'utf8')).filter((s) => s.endsWith('.css'))).toEqual([])
    expect(readFileSync(join(DIST, 'base.css'), 'utf8')).toBe(
      readFileSync(resolve(PACKAGE, '../recipes/src/base.css'), 'utf8'),
    )
  })

  it('names only shipped files, fully specified, and declares every package it imports', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    for (const path of built.filter((file) => /\.(mjs|d\.ts)$/.test(file))) {
      for (const specifier of imports(readFileSync(path, 'utf8'))) {
        if (specifier.startsWith('.')) {
          // A declaration names a module by its `.js` path, which resolves to its `.d.ts`.
          const target = resolve(dirname(path), specifier)
          expect(
            existsSync(target) || existsSync(target.replace(/\.js$/, '.d.ts')),
            `${relative(DIST, path)}: ${specifier}`,
          ).toBe(true)
        } else {
          expect(declared.has(packageOf(specifier)), `${relative(DIST, path)}: ${specifier}`).toBe(
            true,
          )
        }
      }
    }
  })
})
