#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `node scripts/emit-screens.mjs <spec.json> <framework>…` prints one JSON object: the
 * source the emitter writes from the spec for each framework named.
 *
 * It does what `pnpm emit` does, with the same functions and the same checks:
 * the spec is validated for the framework, and the emitted source is checked
 * against the red rules. `pnpm emit` writes one framework per run and builds
 * the registry each time. The landing page shows five, so this builds the
 * registry once. `apps/docs/vite.config.ts` runs it and serves the result as a module.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [input, ...frameworks] = process.argv.slice(2)
if (!input || frameworks.length === 0) {
  console.error('usage: node scripts/emit-screens.mjs <spec.json> <framework>…')
  process.exit(1)
}

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { emitCheckedScreen, validateSpec } = await jiti.import(
  resolve(SOURCE, 'packages/spec/src/lawful.ts'),
)

const spec = JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8'))
const registry = buildRegistry(SOURCE)
const emitted = {}

for (const framework of frameworks) {
  const { ok, faults } = validateSpec(registry, spec, { framework })
  if (!ok) {
    console.error(`${input} is not a lawful screen spec for ${framework}:\n`)
    for (const fault of faults) console.error(`  ${fault.path}\n    ${fault.message}`)
    process.exit(1)
  }
  const { code, violations, warnings, fatal } = await emitCheckedScreen(spec, {
    framework,
    registry,
  })
  if (fatal !== null || violations.length > 0) {
    console.error(`${input} emits a ${framework} screen the red rules refuse:\n`)
    if (fatal !== null) console.error(`  ${fatal}`)
    for (const violation of violations) {
      console.error(
        `  ${violation.line}:${violation.column}  ${violation.rule}\n    ${violation.message}`,
      )
    }
    process.exit(1)
  }
  // A warning does not stop the screen: the rule groups report the usage rules as warnings.
  for (const warning of warnings) {
    console.error(
      `${input} (${framework}) warning ${warning.line}:${warning.column}  ${warning.rule}\n    ${warning.message}`,
    )
  }
  emitted[framework] = code
}

process.stdout.write(JSON.stringify(emitted))
