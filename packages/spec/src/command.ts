import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Registry } from '@polymorph/registry'

import { ELEMENTS_UNEMITTED } from './emit'
import { readNativePackage } from './emit-native'
import { emitCheckedScreen, validateSpec } from './lawful'
import type { ScreenSpec } from './schema'

/**
 * `emit <spec.json> [out]`, the screen emitter as a command: the arguments in,
 * an exit code out.
 *
 * Two entry points run it. The checkout's `bin/emit.js` (`pnpm emit`) builds
 * the registry from the tree, and the published tools' emitter reads the
 * registry they ship. `polymorph init` runs one of them in a new app to write
 * its welcome screen. Both read the native member packages from `source`, the
 * tree that holds them, and the spec and the output relative to `cwd`.
 *
 * `emit <spec.json> out.vue`, or `--framework vue`, emits the screen as a Vue
 * single-file component, `out.svelte`, or `--framework svelte`, as a Svelte
 * one, and `out.ts`, or `--framework angular`, as an Angular standalone
 * component. `--framework solid` emits Solid TSX, to stdout or to a `.tsx`
 * file, which is React's extension too. The framework is an option, never a
 * field of the spec, so the same document emits for any of them; validation
 * checks every member against the framework's vocabulary first.
 *
 * A spec whose `platform` is `ios` emits SwiftUI, to stdout or to a `.swift`
 * file, and one whose `platform` is `android` emits Jetpack Compose, to stdout
 * or to a `.kt` file: its model, its actions and its view, against the member
 * package for the platform in `source` (its generated contract and the members
 * it draws, `readNativePackage`). The platform is the spec's own field, so a
 * `.swift` or `.kt` output for any other spec, another output for a native
 * spec, or `--framework` with a native spec, is refused.
 *
 * It always validates first, and writes nothing if the spec is unlawful. An
 * emitter that produced TSX from a spec naming props no member has would pass
 * the problem to `tsc` two steps later, and the path from the fault back to the
 * line in the document would be lost.
 *
 * It checks last. The emitted code is checked before it is written or printed
 * (`lawful.ts` says what a lawful spec can still get wrong): a web screen
 * against the red rules, a native screen against the native screen contract's
 * law. Every file this command writes passes the check for its platform.
 */

export interface EmitCommand {
  /**
   * The registry, or what builds it. An entry point that builds the registry
   * from a tree passes the builder, so a refusal that needs no registry (a
   * wrong extension, a missing argument) answers without the seconds a build
   * takes.
   */
  registry: Registry | (() => Registry)
  /** The tree that holds the native member packages. */
  source: string
  /** The directory the spec and the output are named from. */
  cwd: string
  argv: readonly string[]
  /** The emitted screen, when no output file is named. */
  print: (text: string) => void
  /** One line of diagnostics. */
  complain: (line: string) => void
}

const USAGE =
  'usage: pnpm emit <spec.json> [out.tsx | out.vue | out.svelte | out.ts | out.swift | out.kt] ' +
  '[--framework react|vue|svelte|solid|angular]'
const FRAMEWORKS = ['react', 'vue', 'svelte', 'solid', 'angular'] as const
type EmittedFramework = (typeof FRAMEWORKS)[number]
/** A framework every read tool takes and no emitter writes: an elements page is HTML. */
const UNEMITTED = ['elements']
/** The file each framework's screen is written to. */
const EXTENSIONS: Record<EmittedFramework, string> = {
  react: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
  solid: '.tsx',
  angular: '.ts',
}
/** The file each native platform's screen is written to, and the toolkit it is written for. */
const NATIVE = {
  ios: { extension: '.swift', toolkit: 'SwiftUI' },
  android: { extension: '.kt', toolkit: 'Jetpack Compose' },
} as const
type NativePlatform = keyof typeof NATIVE

const isNative = (value: unknown): value is NativePlatform =>
  typeof value === 'string' && Object.hasOwn(NATIVE, value)

export async function emitCommand(command: EmitCommand): Promise<number> {
  const { source, cwd, argv, print, complain } = command
  const flag = argv.indexOf('--framework')
  const named = flag === -1 ? undefined : argv[flag + 1]
  const [input, output] =
    flag === -1 ? argv : argv.filter((_, at) => at !== flag && at !== flag + 1)
  // The output's extension names a framework too, and the two must agree: a Vue
  // component in a `.tsx` file, or TSX in a `.vue` one, is read by the wrong compiler.
  // A `.ts` module (not a declaration file) is an Angular component. Any other
  // extension is TSX, which React and Solid both write.
  // A `.swift` or `.kt` output names a platform instead, which the spec decides below.
  const nativeOutput = (Object.keys(NATIVE) as NativePlatform[]).find(
    (platform) => output !== undefined && output.endsWith(NATIVE[platform].extension),
  )
  const allowed: readonly string[] | null =
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
    complain(`emit: ${ELEMENTS_UNEMITTED}\n${USAGE}`)
    return 1
  }
  if (!input || !(FRAMEWORKS as readonly string[]).includes(framework)) {
    complain(USAGE)
    return 1
  }
  const emitted = framework as EmittedFramework
  if (allowed !== null && !allowed.includes(emitted)) {
    complain(
      `emit: --framework ${emitted} writes a ${EXTENSIONS[emitted]} file, ` +
        `and ${output} is not one\n${USAGE}`,
    )
    return 1
  }

  const spec = JSON.parse(readFileSync(resolve(cwd, input), 'utf8')) as {
    platform?: unknown
  } | null
  const platform = isNative(spec?.platform) ? spec.platform : undefined
  // A web framework writes web screens; a native screen's language is its platform's.
  if (platform !== undefined && named !== undefined) {
    complain(
      `emit: ${input} is a screen for ${platform}, which emits ${NATIVE[platform].toolkit}, and ` +
        `--framework names a web framework — leave it out\n${USAGE}`,
    )
    return 1
  }
  if (output !== undefined && platform !== nativeOutput) {
    complain(
      platform !== undefined
        ? `emit: ${input} is a screen for ${platform}, which emits ${NATIVE[platform].toolkit}, and ${output} is not a ${NATIVE[platform].extension} file\n${USAGE}`
        : `emit: a ${NATIVE[nativeOutput as NativePlatform].extension} file is emitted from a spec whose platform is ${nativeOutput}, and ${input} is not one\n${USAGE}`,
    )
    return 1
  }
  const registry = typeof command.registry === 'function' ? command.registry() : command.registry
  const native = platform === undefined ? undefined : readNativePackage(source, platform)
  const { ok, faults } = validateSpec(registry, spec, {
    framework: emitted,
    ...(native ? { native } : {}),
  })

  if (!ok) {
    complain(`${input} is not a lawful screen spec:\n`)
    for (const fault of faults) complain(`  ${fault.path}\n    ${fault.message}`)
    return 1
  }

  const target = output ? resolve(cwd, output) : undefined
  const { code, violations, warnings, fatal } = await emitCheckedScreen(spec as ScreenSpec, {
    framework: emitted,
    registry,
    ...(native ? { native } : {}),
    ...(target ? { filepath: target } : {}),
  })

  if (fatal !== null || violations.length > 0) {
    const judge = native ? 'the native screen contract refuses' : 'the red rules refuse'
    complain(`${input} emits a screen ${judge}, so nothing was written:\n`)
    if (fatal !== null) complain(`  ${fatal}`)
    for (const violation of violations) {
      complain(
        `  ${violation.line}:${violation.column}  ${violation.rule}\n    ${violation.message}`,
      )
    }
    return 1
  }

  // A warning does not stop the write: the rule groups report the usage rules as warnings.
  for (const warning of warnings) {
    complain(`warning ${warning.line}:${warning.column}  ${warning.rule}\n    ${warning.message}`)
  }

  if (target) {
    writeFileSync(target, code)
    complain(`emit: ${(spec as ScreenSpec).name} -> ${output}`)
  } else {
    print(code)
  }
  return 0
}
