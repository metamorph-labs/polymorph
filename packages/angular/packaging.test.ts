import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildEngine, lockEngineDist } from '../engine/dist-lock'

import { buildAngular, lockAngularDist } from './dist-lock'

/**
 * The published build of `@polymorph/angular` and the manifest that ships it.
 *
 * An Angular library ships partially compiled code, which the application's
 * Angular links to the Angular it runs, in the Angular package format's flat
 * modules, one per entry point (`scripts/package.mjs`). What a consumer's
 * toolchain reads: every export target exists; each entry point is one flat
 * module under `fesm2022/`, and every shipped module keeps its declarations;
 * every component is a partial declaration, not a full definition tied to one
 * Angular; no module imports a stylesheet, because the Icon's rules are in its
 * component; every relative import names a shipped file; the engine and
 * Angular stay external and are declared; and the presences stay on
 * `./motion`. It is at the package root, in the `logic` project, because it
 * reads files on disk.
 */

const PACKAGE = import.meta.dirname
const SRC = resolve(PACKAGE, 'src')
const DIST = resolve(PACKAGE, 'dist')

const manifest = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  publishConfig: { exports: Record<string, Record<string, string>> }
}

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

const imports = (text: string) =>
  [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
    (match) => match[1] as string,
  )

let release: () => void = () => {}
let built: string[] = []

beforeAll(async () => {
  release = await lockAngularDist('packages/angular/packaging.test.ts')
  // The build compiles against the engine's published declarations
  // (`scripts/package.mjs`, `ENGINE_DIST`), which another worker may be
  // rewriting: the engine's own packaging test and the CLI's install tests
  // build it. So the engine's lock is held through the build, and the engine
  // is built first, so the declarations are the current source's.
  const releaseEngine = await lockEngineDist('packages/angular/packaging.test.ts')
  try {
    buildEngine()
    buildAngular()
  } finally {
    releaseEngine()
  }
  built = filesUnder(DIST)
}, 900_000)

afterAll(() => release())

const FESM = join(DIST, 'fesm2022')
const read = (path: string) => readFileSync(path, 'utf8')

/**
 * The declaration a flat module makes for a component class: the
 * `ɵɵngDeclareComponent({ … type: Icon, … })` call, to the next declaration.
 * The bundler may suffix a class whose name another module also uses (`Item$1`).
 */
function declarationOf(bundle: string, name: string): string {
  const type = new RegExp(`type: ${name}(\\$\\d+)?,`)
  for (const [at] of [...bundle.matchAll(/ɵɵngDeclareComponent\(/g)].map((match) => [
    match.index,
  ])) {
    const end = bundle.indexOf('ɵɵngDeclare', (at as number) + 1)
    const block = bundle.slice(at as number, end === -1 ? undefined : end)
    if (type.test(block)) return block
  }
  return ''
}

describe('the build of @polymorph/angular', () => {
  it('writes every export target the published manifest names', () => {
    for (const [entry, conditions] of Object.entries(manifest.publishConfig.exports)) {
      for (const target of Object.values(conditions)) {
        expect(existsSync(resolve(PACKAGE, target)), `${entry}: ${target}`).toBe(true)
      }
    }
  })

  it('ships one flat module per entry point, and the declarations of every shipped module', () => {
    expect(
      built
        .filter((path) => path.endsWith('.mjs'))
        .map((path) => relative(DIST, path))
        .sort(),
    ).toEqual(['fesm2022/polymorph-angular-motion.mjs', 'fesm2022/polymorph-angular.mjs'])
    expect(built.filter((path) => path.endsWith('.js'))).toEqual([])
    const shipped = filesUnder(SRC).filter(
      (path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts'),
    )
    for (const path of shipped) {
      const local = relative(SRC, path).replace(/\.ts$/, '')
      expect(built, local).toContain(join(DIST, `${local}.d.ts`))
    }
    expect(built.filter((path) => /\.test\.d\.ts$/.test(path))).toEqual([])
  })

  it('declares every component partially, for the Angular the application links it to', () => {
    const bundle = read(join(FESM, 'polymorph-angular.mjs'))
    for (const name of ['BrandMark', 'Glyph', 'Icon']) {
      expect(declarationOf(bundle, name), name).not.toBe('')
    }
    expect(bundle).not.toContain('ɵɵdefineComponent')
  })

  it('imports no stylesheet: the Icon’s rules are its component’s styles', () => {
    const bundles = built.filter((path) => path.endsWith('.mjs'))
    expect(
      bundles.flatMap((path) => imports(read(path)).filter((s) => s.endsWith('.css'))),
    ).toEqual([])
    const bundle = read(join(FESM, 'polymorph-angular.mjs'))
    expect(declarationOf(bundle, 'Icon')).toContain('styles: [')
    expect(bundle).toContain('._icon_')
  })

  it('names only shipped files, fully specified, and declares every package it imports', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.peerDependencies),
    ])
    for (const path of built.filter((file) => /\.(mjs|d\.ts)$/.test(file))) {
      for (const specifier of imports(read(path))) {
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

  it('keeps the presences on `./motion`, and the engine and Angular external', () => {
    const root = read(join(FESM, 'polymorph-angular.mjs'))
    expect(root).not.toMatch(/usePresence|useKeyedPresence|useListPresence/)
    expect(read(join(FESM, 'polymorph-angular-motion.mjs'))).toContain('usePresence')
    expect(root).toContain('export * from "@polymorph/engine"')
    const everything = built
      .filter((path) => path.endsWith('.mjs'))
      .map(read)
      .join('\n')
    expect(everything).not.toMatch(/function createToastStore\(|class OutputEmitterRef/)
  })
})
