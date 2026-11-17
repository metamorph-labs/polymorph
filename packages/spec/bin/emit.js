#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `pnpm emit <spec.json> [out.tsx]` emits a screen from its spec.
 *
 * `pnpm emit <spec.json> out.vue`, or `--framework vue`, emits it as a Vue
 * single-file component instead, `out.svelte`, or `--framework svelte`, as a
 * Svelte one, and `out.ts`, or `--framework angular`, as an Angular standalone
 * component. `--framework solid` emits Solid TSX, to stdout or to a `.tsx`
 * file, which is React's extension too. The framework is an option, never a
 * field of the spec, so the same document emits for any of them; validation
 * checks every member against the framework's vocabulary first.
 *
 * A spec whose `platform` is `ios` emits SwiftUI, to stdout or to a `.swift`
 * file, and one whose `platform` is `android` emits Jetpack Compose, to stdout
 * or to a `.kt` file: its model, its actions and its view, against this
 * checkout's member package for the platform (its generated contract and the
 * members it draws, `readNativePackage`). The platform is the spec's own
 * field, so a `.swift` or `.kt` output for any other spec, another output for
 * a native spec, or `--framework` with a native spec, is refused.
 *
 * It always validates first, and writes nothing if the spec is unlawful. An
 * emitter that produced TSX from a spec naming props no member has would pass
 * the problem to `tsc` two steps later, and the path from the fault back to the
 * line in the document would be lost.
 *
 * It checks last. The emitted code is checked before it is written or printed
 * (`src/lawful.ts` says what a lawful spec can still get wrong): a web screen
 * against the red rules, a native screen against the native screen contract's
 * law. Every file this command writes passes the check for its platform.
 *
 * This file is plain JS loaded through `jiti`, like the repository's other bins, so
 * node runs it directly. Everything it calls is TypeScript because the MCP
 * server imports the same functions.
 */

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(SOURCE, 'packages/registry/src/build.ts'))
const { emitCheckedScreen, validateSpec } = await jiti.import(
  resolve(SOURCE, 'packages/spec/src/lawful.ts'),
)
const { ELEMENTS_UNEMITTED } = await jiti.import(resolve(SOURCE, 'packages/spec/src/emit.ts'))
const { readNativePackage } = await jiti.import(resolve(SOURCE, 'packages/spec/src/emit-native.ts'))

const USAGE =
  'usage: pnpm emit <spec.json> [out.tsx | out.vue | out.svelte | out.ts | out.swift | out.kt] ' +
  '[--framework react|vue|svelte|solid|angular]'
const FRAMEWORKS = ['react', 'vue', 'svelte', 'solid', 'angular']
/** A framework every read tool takes and no emitter writes: an elements page is HTML. */
const UNEMITTED = ['elements']
/** The file each framework's screen is written to. */
const EXTENSIONS = { react: '.tsx', vue: '.vue', svelte: '.svelte', solid: '.tsx', angular: '.ts' }
/** The file each native platform's screen is written to, and the toolkit it is written for. */
const NATIVE = {
  ios: { extension: '.swift', toolkit: 'SwiftUI' },
  android: { extension: '.kt', toolkit: 'Jetpack Compose' },
}
const args = process.argv.slice(2)
const flag = args.indexOf('--framework')
const named = flag === -1 ? undefined : args[flag + 1]
const [input, output] = flag === -1 ? args : args.filter((_, at) => at !== flag && at !== flag + 1)
// The output's extension names a framework too, and the two must agree: a Vue
// component in a `.tsx` file, or TSX in a `.vue` one, is read by the wrong compiler.
// A `.ts` module (not a declaration file) is an Angular component. Any other
// extension is TSX, which React and Solid both write.
// A `.swift` or `.kt` output names a platform instead, which the spec decides below.
const nativeOutput = Object.keys(NATIVE).find(
  (platform) => output !== undefined && output.endsWith(NATIVE[platform].extension),
)
const allowed =
  output === undefined || nativeOutput !== undefined
    ? null
    : output.endsWith(EXTENSIONS.vue)
      ? ['vue']
      : output.endsWith(EXTENSIONS.svelte)
        ? ['svelte']
        : output.endsWith(EXTENSIONS.angular) && !output.endsWith('.d.ts')
          ? ['angular']
          : ['react', 'solid']
const framework = named ?? allowed?.[0] ?? 'react'
if (UNEMITTED.includes(framework) || output?.endsWith('.html')) {
  console.error(`emit: ${ELEMENTS_UNEMITTED}\n${USAGE}`)
  process.exit(1)
}
if (!input || !FRAMEWORKS.includes(framework)) {
  console.error(USAGE)
  process.exit(1)
}
if (allowed !== null && !allowed.includes(framework)) {
  console.error(
    `emit: --framework ${framework} writes a ${EXTENSIONS[framework]} file, ` +
      `and ${output} is not one\n${USAGE}`,
  )
  process.exit(1)
}

const spec = JSON.parse(readFileSync(resolve(process.cwd(), input), 'utf8'))
const platform = Object.hasOwn(NATIVE, spec?.platform) ? spec.platform : undefined
// A web framework writes web screens; a native screen's language is its platform's.
if (platform !== undefined && named !== undefined) {
  console.error(
    `emit: ${input} is a screen for ${platform}, which emits ${NATIVE[platform].toolkit}, and ` +
      `--framework names a web framework — leave it out\n${USAGE}`,
  )
  process.exit(1)
}
if (output !== undefined && platform !== nativeOutput) {
  console.error(
    platform !== undefined
      ? `emit: ${input} is a screen for ${platform}, which emits ${NATIVE[platform].toolkit}, and ${output} is not a ${NATIVE[platform].extension} file\n${USAGE}`
      : `emit: a ${NATIVE[nativeOutput].extension} file is emitted from a spec whose platform is ${nativeOutput}, and ${input} is not one\n${USAGE}`,
  )
  process.exit(1)
}
const registry = buildRegistry(SOURCE)
const native = platform === undefined ? undefined : readNativePackage(SOURCE, platform)
const { ok, faults } = validateSpec(registry, spec, { framework, ...(native ? { native } : {}) })

if (!ok) {
  console.error(`${input} is not a lawful screen spec:\n`)
  for (const fault of faults) console.error(`  ${fault.path}\n    ${fault.message}`)
  process.exit(1)
}

const target = output ? resolve(process.cwd(), output) : undefined
const { code, violations, fatal } = await emitCheckedScreen(spec, {
  framework,
  registry,
  ...(native ? { native } : {}),
  ...(target ? { filepath: target } : {}),
})

if (fatal !== null || violations.length > 0) {
  const judge = native ? 'the native screen contract refuses' : 'the red rules refuse'
  console.error(`${input} emits a screen ${judge}, so nothing was written:\n`)
  if (fatal !== null) console.error(`  ${fatal}`)
  for (const violation of violations) {
    console.error(
      `  ${violation.line}:${violation.column}  ${violation.rule}\n    ${violation.message}`,
    )
  }
  process.exit(1)
}

if (target) {
  writeFileSync(target, code)
  console.error(`emit: ${spec.name} -> ${output}`)
} else {
  process.stdout.write(code)
}
