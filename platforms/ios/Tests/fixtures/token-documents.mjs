import console from 'node:console'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { defaultPairings, ROOT } from '../../../../scripts/emit-native.mjs'

/**
 * The token documents `PMTheme(tokenDocument:)` is tested against, written as a
 * server writes one: each pairing admitted with `admitTheme`, then emitted with
 * `emitTokenDocumentJSON(resolved, { platform: 'ios' })`.
 *
 * `TokenDocumentTests.swift` runs this script into a temporary directory at
 * the start of every `swift test`, so the documents are always the engine's
 * current output:
 *
 *   node platforms/ios/Tests/fixtures/token-documents.mjs <dir>
 *
 * writes `index.json` and, beside it:
 *
 * - one iOS document per pairing in `Sources/PolymorphTokens/Generated/`, which
 *   the test decodes and compares with the generated static;
 * - one iOS document per example below, and the Swift static `emitSwift`
 *   writes for it, which the test compares with the copy it compiles;
 * - one Android document, which the loader must refuse;
 * - `numbers.json`: inputs and what the Swift emitter writes for each, for
 *   the loader's rounding.
 *
 * The examples are not in the catalogue, so their statics are test sources:
 * `--write-statics` writes them into `Tests/PolymorphTokensTests/Examples/`.
 * `exampleStatics` returns the same files in memory, and the freshness law
 * (`packages/theme/src/native.test.ts`) compares them with the copies on
 * disk, so a stale static fails the suite as well as `swift test`.
 */

export const STATICS = 'platforms/ios/Tests/PolymorphTokensTests/Examples'
export const GENERATOR = 'node platforms/ios/Tests/fixtures/token-documents.mjs --write-statics'

/**
 * The engine modules this script reads. `importModule` loads a TypeScript
 * module by absolute path (jiti from the command line, the test runner's own
 * `import` inside the suite).
 */
async function engine(importModule) {
  const load = (path) => importModule(resolve(ROOT, path))
  return {
    ...(await load('packages/theme/src/admit.ts')),
    ...(await load('packages/theme/src/examples.ts')),
    ...(await load('packages/theme/src/emit-tokens.ts')),
    ...(await load('packages/theme/src/emit-swift.ts')),
  }
}

/**
 * The pairings outside the catalogue: the engine's quiet example, and its
 * probe (`exampleProbeSystem` with `exampleDuskPalette` in
 * `packages/theme/src/examples.ts`), which writes every kind of value the
 * catalogue does not: a tenant, an italic display face, glass, a grid texture,
 * a gradient partner, numeric columns aligned to the start and an exception of
 * each family. The emitters' tests read the same probe.
 */
function examples(theme) {
  const quiet = { system: theme.exampleQuietSystem, palette: theme.exampleVioletPalette }
  const probe = { system: theme.exampleProbeSystem, palette: theme.exampleDuskPalette }
  return [quiet, probe].map((input) => {
    const admission = theme.admitTheme(input)
    if (!admission.lawful) {
      const faults = admission.faults.map((fault) => `  ${fault.message}`).join('\n')
      throw new Error(
        `token-documents: ${input.system.name}/${input.palette.name} is refused\n${faults}`,
      )
    }
    return admission.resolved
  })
}

/** Numbers whose rounding is easy to get wrong: ties, near-ties, signs, products. */
function roundingInputs() {
  const inputs = [
    0,
    1,
    -1,
    0.5,
    12.5,
    76.5,
    1 / 3,
    -1 / 3,
    2 / 3,
    1 / 7,
    0.1 + 0.2,
    1e-5,
    -1e-5,
    4.9e-5,
    5e-5,
    1.00005,
    1.00015,
    0.03125,
    -0.03125,
    0.09375,
    0.15625,
    -0.15625,
    1234.56785,
    0.123456789,
    -0.008 * 14,
    0.008 * 12.5,
    -0.02 * 61.035,
    0.01 * 30.5175,
  ]
  // A fixed linear congruential sequence, so the file is the same on every run.
  let seed = 20_261_014
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  for (let index = 0; index < 400; index += 1) {
    inputs.push((next() - 0.5) * 10 ** Math.floor(next() * 5))
  }
  for (let index = 0; index < 64; index += 1) {
    inputs.push((2 * Math.floor(next() * 4096) + 1) / 32)
  }
  return inputs
}

/** The Swift static `emitSwift` writes for a pairing, as a test source: it imports the package. */
const staticOf = (theme, resolved) =>
  theme
    .emitSwift(resolved, { generator: GENERATOR })
    .replace('\nextension PMTheme {', '\nimport PolymorphTokens\n\nextension PMTheme {')

/**
 * The example statics as the emitter writes them today, in memory:
 * `{ out, files }`, with `out` relative to the repository root, the shape
 * `staleFiles` in `scripts/emit-native.mjs` compares with disk.
 */
export async function exampleStatics(importModule) {
  const theme = await engine(importModule)
  const files = Object.fromEntries(
    examples(theme).map((resolved) => [theme.swiftFileName(resolved), staticOf(theme, resolved)]),
  )
  return { out: STATICS, files }
}

async function main(args) {
  const writeStatics = args.includes('--write-statics')
  const out = args.find((arg) => !arg.startsWith('--'))
  if (!writeStatics && out === undefined) {
    console.error(
      'usage: node platforms/ios/Tests/fixtures/token-documents.mjs <dir> | --write-statics',
    )
    process.exit(1)
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url)
  const importModule = (path) => jiti.import(path)
  const theme = await engine(importModule)
  const document = (resolved, platform = 'ios') =>
    theme.emitTokenDocumentJSON(resolved, { platform })
  const fileOf = (resolved) => `${resolved.system}__${resolved.palette}`
  const exampleThemes = examples(theme)

  if (writeStatics) {
    const dir = resolve(ROOT, STATICS)
    mkdirSync(dir, { recursive: true })
    const { files } = await exampleStatics(importModule)
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(resolve(dir, name), contents, 'utf8')
    }
    console.error(`token-documents: wrote ${Object.keys(files).length} statics to ${STATICS}`)
    if (out === undefined) return
  }

  const dir = resolve(out)
  mkdirSync(dir, { recursive: true })
  const write = (name, contents) => writeFileSync(resolve(dir, name), contents, 'utf8')
  const entry = (resolved) => ({
    system: resolved.system,
    palette: resolved.palette,
    document: `${fileOf(resolved)}.json`,
  })

  const catalogue = (await defaultPairings(importModule)).map((resolved) => {
    write(`${fileOf(resolved)}.json`, document(resolved))
    return entry(resolved)
  })
  const exampleEntries = exampleThemes.map((resolved) => {
    write(`${fileOf(resolved)}.json`, document(resolved))
    write(theme.swiftFileName(resolved), staticOf(theme, resolved))
    return { ...entry(resolved), static: theme.swiftFileName(resolved) }
  })
  const [first] = exampleThemes
  write('android.json', document(first, 'android'))
  write(
    'numbers.json',
    `${JSON.stringify(roundingInputs().map((value) => [value, Number(theme.swiftNumber(value))]))}\n`,
  )
  write(
    'index.json',
    `${JSON.stringify({ catalogue, examples: exampleEntries, android: 'android.json', numbers: 'numbers.json', statics: STATICS }, null, 2)}\n`,
  )
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main(process.argv.slice(2))
}
