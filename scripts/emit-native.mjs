import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * `pnpm emit:native [--target <name>]... [--check]` writes the native token
 * sources the platform packages under `platforms/` compile: one file per
 * default pairing of the catalogue (each system with its `defaultPalette`, the
 * same eager set the web stylesheet holds), plus whatever index file a target
 * adds.
 *
 * Each target is one row of `TARGETS`:
 *
 * - `module`: the emitter's source, relative to the repository root.
 * - `emit`: the export that emits. It takes the resolved pairings, in system
 *   order, and returns `{ [fileName]: contents }`.
 * - `out`: the directory the files are written to. The emitter owns it: a file
 *   there that the emitter did not return is removed, so a pairing that leaves
 *   the catalogue leaves the package too.
 * - `withDefault`: the emitter takes `{ defaultPairing }` as its second
 *   argument, the web's default pairing (`webDefaultPairing` below), and
 *   names it as its catalogue's default: `PMTheme.default` in Swift,
 *   `PMThemes.default` in Kotlin, which the member packages render under until
 *   an app installs a pairing. Dart's `PMThemes` lists the pairings and names
 *   none.
 *
 * With no `--target`, every row runs; a `--target` that names nothing
 * (`--target ''`) is an error rather than a run of no targets. `--check`
 * writes nothing and exits non-zero when a file on disk differs from what the
 * emitter returns; the freshness law (`packages/theme/src/native.test.ts`)
 * runs the same comparison inside the suite. A dotfile in an output directory
 * (`.DS_Store`) is neither compared nor removed.
 */

export const TARGETS = {
  swift: {
    module: 'packages/theme/src/emit-swift.ts',
    emit: 'emitSwiftFiles',
    out: 'platforms/ios/Sources/PolymorphTokens/Generated',
    withDefault: true,
  },
  kotlin: {
    module: 'packages/theme/src/emit-kotlin.ts',
    emit: 'emitKotlinFiles',
    out: 'platforms/android/tokens/src/generated/kotlin/dev/polymorph/tokens',
    withDefault: true,
  },
  dart: {
    module: 'packages/theme/src/emit-dart.ts',
    emit: 'emitDartFiles',
    out: 'platforms/dart/lib/src/generated',
  },
}

export const ROOT = resolve(import.meta.dirname, '..')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * Every system in `design/systems/`, paired with its default palette and
 * admitted, in file-name order. A pairing the engine refuses stops the run:
 * a native package never ships a pairing the web would refuse.
 */
export async function defaultPairings(importModule) {
  const { admitTheme } = await importModule(resolve(ROOT, 'packages/theme/src/admit.ts'))
  const dir = resolve(ROOT, 'design/systems')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const system = readJson(resolve(dir, file))
      const palette = readJson(resolve(ROOT, 'design/palettes', `${system.defaultPalette}.json`))
      // A palette that names a more-contrast partner is admitted with it. The
      // native packages read only the pairing's own tokens.
      const moreContrast =
        palette.moreContrast === undefined
          ? undefined
          : readJson(resolve(ROOT, 'design/palettes', `${palette.moreContrast}.json`))
      const admission = admitTheme({ system, palette, moreContrast })
      if (!admission.lawful) {
        const faults = admission.faults.map((fault) => `  ${fault.message}`).join('\n')
        throw new Error(
          `emit-native: ${system.name}/${system.defaultPalette} is refused\n${faults}`,
        )
      }
      return admission.resolved
    })
}

/**
 * The web's default pairing, `{ system, palette }`: the system
 * `design/defaults.json` names, with its default palette, as the workbench and
 * the docs open in. A default system the catalogue does not hold stops the run.
 */
export function webDefaultPairing(themes) {
  const { system } = readJson(resolve(ROOT, 'design/defaults.json'))
  const theme = themes.find((candidate) => candidate.system === system)
  if (!theme) {
    throw new Error(
      `emit-native: design/defaults.json names the system "${system}", which design/systems/ does not hold`,
    )
  }
  return { system: theme.system, palette: theme.palette }
}

/**
 * What each named target would write, in memory: `[{ target, out, files }]`.
 * `importModule` loads a TypeScript module by absolute path (jiti from the
 * command line, the test runner's own `import` inside the suite).
 */
export async function nativeOutputs(targets, importModule) {
  const themes = await defaultPairings(importModule)
  const webDefault = webDefaultPairing(themes)
  const outputs = []
  for (const target of targets) {
    const row = TARGETS[target]
    if (!row) {
      throw new Error(
        `emit-native: no target "${target}" (known: ${Object.keys(TARGETS).join(', ')})`,
      )
    }
    const emitter = (await importModule(resolve(ROOT, row.module)))[row.emit]
    const files = row.withDefault
      ? emitter(themes, { defaultPairing: webDefault })
      : emitter(themes)
    outputs.push({ target, out: row.out, files })
  }
  return outputs
}

/** A file the operating system or an editor leaves beside the generated ones. */
const isDotfile = (name) => name.startsWith('.')

/**
 * The differences between disk and an output: each file that is missing,
 * different or not emitted at all, as a path relative to the root. Dotfiles
 * on disk are not the emitter's, so they are left out.
 */
export function staleFiles({ out, files }) {
  const dir = resolve(ROOT, out)
  let present = []
  try {
    present = readdirSync(dir).filter((name) => !isDotfile(name))
  } catch {
    // A missing directory is stale in every file the emitter returns.
  }
  const stale = []
  for (const [name, contents] of Object.entries(files)) {
    let current = null
    try {
      current = readFileSync(resolve(dir, name), 'utf8')
    } catch {
      // Missing.
    }
    if (current !== contents) stale.push(`${out}/${name}`)
  }
  for (const name of present) if (!(name in files)) stale.push(`${out}/${name}`)
  return stale.sort()
}

async function main(args) {
  const targets = []
  let check = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--check') check = true
    else if (arg === '--target') targets.push(...(args[++index] ?? '').split(','))
    else if (arg.startsWith('--target=')) targets.push(...arg.slice('--target='.length).split(','))
    else {
      console.error('usage: pnpm emit:native [--target <name>]... [--check]')
      console.error(`       targets: ${Object.keys(TARGETS).join(', ')}`)
      process.exit(1)
    }
  }

  const named = targets.filter(Boolean)
  if (targets.length > 0 && named.length === 0) {
    console.error('emit-native: --target names no target')
    console.error(`       targets: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(1)
  }

  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url)
  const outputs = await nativeOutputs(named.length > 0 ? named : Object.keys(TARGETS), (path) =>
    jiti.import(path),
  )

  if (check) {
    const stale = outputs.flatMap(staleFiles)
    if (stale.length > 0) {
      console.error(`emit-native: stale, run \`pnpm emit:native\`:\n  ${stale.join('\n  ')}`)
      process.exit(1)
    }
    console.error('emit-native: every generated file is current')
    return
  }

  for (const { target, out, files } of outputs) {
    const dir = resolve(ROOT, out)
    mkdirSync(dir, { recursive: true })
    for (const name of readdirSync(dir)) {
      if (!isDotfile(name) && !(name in files)) rmSync(resolve(dir, name), { recursive: true })
    }
    let bytes = 0
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(resolve(dir, name), contents, 'utf8')
      bytes += statSync(resolve(dir, name)).size
    }
    const count = Object.keys(files).length
    console.error(
      `emit-native: ${target}: wrote ${count} files to ${out} (${(bytes / 1024).toFixed(1)}KB)`,
    )
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main(process.argv.slice(2))
}
