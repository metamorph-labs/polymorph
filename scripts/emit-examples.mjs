#!/usr/bin/env node
import console from 'node:console'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { createJiti } from 'jiti'

/**
 * `pnpm emit:examples` writes every example's emitted screen from its spec;
 * `pnpm emit:examples --check` writes nothing and exits non-zero, naming each
 * emitted file that differs from what the emitter writes.
 *
 * An example is an app's own code around screens a native emitter wrote:
 * `platforms/ios/Examples/Relay/` renders Relay's inbox and its new-ticket form
 * in SwiftUI, from their specs in `Screens/`, and
 * `platforms/android/examples/relay/` the inbox in Compose. Each emitted file is checked
 * in, because the example's build compiles it, and the emitters' tests
 * (`packages/spec/src/emit-swift.test.ts`, `emit-kotlin.test.ts`) hold it to
 * this script's output.
 *
 * It validates first, against the platform's member package as `pnpm emit`
 * does, and writes nothing for an unlawful spec.
 */

const ROOT = resolve(import.meta.dirname, '..')

/** Each example's spec, and the file emitted from it. */
const EXAMPLES = [
  {
    spec: 'platforms/ios/Examples/Relay/Screens/inbox.json',
    out: 'platforms/ios/Examples/Relay/Sources/RelayExample/InboxView.swift',
  },
  {
    spec: 'platforms/ios/Examples/Relay/Screens/new-ticket.json',
    out: 'platforms/ios/Examples/Relay/Sources/RelayExample/NewTicketView.swift',
  },
  {
    spec: 'platforms/android/examples/relay/Screens/inbox.json',
    out: 'platforms/android/examples/relay/src/main/kotlin/dev/polymorph/examples/relay/InboxScreen.kt',
  },
]

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(ROOT, 'packages/registry/src/build.ts'))
const { emitCheckedScreen, readNativePackage, validateSpec } = await jiti.import(
  resolve(ROOT, 'packages/spec/src/index.ts'),
)

const check = process.argv.includes('--check')
const registry = buildRegistry(ROOT)
const stale = []

for (const example of EXAMPLES) {
  const spec = JSON.parse(readFileSync(resolve(ROOT, example.spec), 'utf8'))
  const native = readNativePackage(ROOT, spec.platform)
  const { ok, faults } = validateSpec(registry, spec, { native })
  if (!ok) {
    console.error(`${example.spec} is not a lawful screen spec:\n`)
    for (const fault of faults) console.error(`  ${fault.path}\n    ${fault.message}`)
    process.exit(1)
  }
  const target = resolve(ROOT, example.out)
  const { code, fatal } = await emitCheckedScreen(spec, { native, filepath: target })
  if (fatal !== null) {
    console.error(`${example.spec} does not emit: ${fatal}`)
    process.exit(1)
  }
  let current = null
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    current = null
  }
  if (current === code) continue
  if (check) stale.push(example.out)
  else {
    writeFileSync(target, code)
    console.error(`emit:examples: ${example.spec} -> ${example.out}`)
  }
}

if (stale.length > 0) {
  console.error(
    `emit:examples: out of date — run \`pnpm emit:examples\`:\n${stale.map((file) => `  ${file}`).join('\n')}`,
  )
  process.exit(1)
}
