import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { PLATFORM_FLOORS } from './platforms'

/**
 * The freshness law for the native packages under `platforms/`.
 *
 * Their generated sources are committed, so an app can depend on a package by
 * path or git without running the engine. That makes them a copy of decisions
 * owned in `design/` and the engine, and a copy can fall behind. This law
 * regenerates every target in `scripts/emit-native.mjs` in memory, from the
 * same default pairings the script reads, and compares each file with the one
 * on disk: a file that differs, is missing, or is no longer emitted fails.
 *
 * The iOS loader's example statics (`platforms/ios/Tests/PolymorphTokensTests/
 * Examples/`) are such a copy too: the Swift static of each pairing outside the
 * catalogue that `PMTheme(tokenDocument:)` is tested against. They are
 * compared the same way, from `token-documents.mjs`.
 */

interface NativeOutput {
  target: string
  out: string
  files: Record<string, string>
}

type ImportModule = (path: string) => Promise<Record<string, unknown>>

interface NativeScript {
  ROOT: string
  TARGETS: Record<string, { module: string; emit: string; out: string }>
  nativeOutputs: (targets: string[], importModule: ImportModule) => Promise<NativeOutput[]>
  staleFiles: (output: Pick<NativeOutput, 'out' | 'files'>) => string[]
}

interface TokenDocumentsScript {
  GENERATOR: string
  exampleStatics: (importModule: ImportModule) => Promise<Pick<NativeOutput, 'out' | 'files'>>
}

const moduleAt = (path: string) => pathToFileURL(resolve(process.cwd(), path)).href
const script = (await import(
  /* @vite-ignore */ moduleAt('scripts/emit-native.mjs')
)) as NativeScript
const fixtures = (await import(
  /* @vite-ignore */ moduleAt('platforms/ios/Tests/fixtures/token-documents.mjs')
)) as TokenDocumentsScript
const importModule: ImportModule = (path) =>
  import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>

describe('every generated native file is current', () => {
  for (const target of Object.keys(script.TARGETS)) {
    it(`${target}: ${script.TARGETS[target]!.out}`, async () => {
      const [output] = await script.nativeOutputs([target], importModule)
      expect(Object.keys(output!.files).length, 'the target emitted no files').toBeGreaterThan(0)
      expect(script.staleFiles(output!), 'stale generated files: run `pnpm emit:native`').toEqual(
        [],
      )
    })
  }

  it('swift examples: platforms/ios/Tests/PolymorphTokensTests/Examples', async () => {
    const output = await fixtures.exampleStatics(importModule)
    expect(Object.keys(output.files).length, 'no example statics').toBeGreaterThan(0)
    expect(
      script.staleFiles(output),
      `stale example statics: run \`${fixtures.GENERATOR}\``,
    ).toEqual([])
  })
})

describe('the freshness comparison', () => {
  const scratch: string[] = []
  afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('names a file that differs, is missing or is not emitted, and ignores dotfiles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-native-fresh-'))
    scratch.push(dir)
    writeFileSync(join(dir, 'Same.swift'), 'same')
    writeFileSync(join(dir, 'Changed.swift'), 'old')
    writeFileSync(join(dir, 'Gone.swift'), 'gone')
    writeFileSync(join(dir, '.DS_Store'), 'finder')
    const files = { 'Same.swift': 'same', 'Changed.swift': 'new', 'New.swift': 'new' }
    expect(script.staleFiles({ out: dir, files })).toEqual(
      ['Changed.swift', 'Gone.swift', 'New.swift'].map((name) => `${dir}/${name}`),
    )
  })
})

/**
 * The iOS loader's floor. `PMTheme(tokenDocument:)` reads the hit-target floor
 * from the document's `floor` section, and refuses a document that declares
 * less than its own constant: Apple's minimum, the engine's
 * `PLATFORM_FLOORS.ios.hitTarget`. The constant is Swift, so this reads it.
 */
describe('the Swift loader’s floor', () => {
  it('is the engine’s iOS hit-target floor', () => {
    const source = readFileSync(
      resolve(script.ROOT, 'platforms/ios/Sources/PolymorphTokens/PMTheme+TokenDocument.swift'),
      'utf8',
    )
    const declared = [...source.matchAll(/public static let tokenDocumentFloor: CGFloat = (\d+)/g)]
    expect(declared, 'the loader declares its floor once').toHaveLength(1)
    expect(Number(declared[0]![1])).toBe(PLATFORM_FLOORS.ios.hitTarget)
  })
})
