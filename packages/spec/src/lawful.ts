import { DEFAULT_PATHS, verify, type Diagnostic } from '@polymorph/rules/verify'
import type { Registry } from '@polymorph/registry'
import { FRAMEWORK_EXTENSIONS } from '@polymorph/registry/frameworks'

import { emitScreen, UnemittedFrameworkError, type EmitOptions } from './emit'
import { kotlinJudges, KotlinPackageError, kotlinScreenViolations } from './emit-kotlin'
import { MissingContractError, NativeContractError } from './emit-native'
import { swiftJudges, swiftScreenViolations } from './emit-swift'
import { MissingRegistryError } from './emit-vue'
import { inputTypeFault } from './input-type'
import type { ScreenSpec } from './schema'
import {
  validateSpec as validateComposition,
  type SpecJudges,
  type SpecOptions,
  type SpecValidation,
} from './validate'

/**
 * The two checks that need tools a browser page does not have: a compiler and a
 * linter.
 *
 * `validate.ts` and `emit.ts` are functions of a document and the registry. The
 * browser runs the first, and neither knows about TypeScript or the red rules.
 * Two checks on a spec need exactly that knowledge. Both run here, for every
 * entry point that validates or writes on a machine that has the tools: the
 * package's root entry, `pnpm emit`, and the MCP server.
 */

/**
 * Checks whether a spec is lawful: the composition, and the one field that is
 * TypeScript.
 *
 * This is `validate.ts` with the type checks supplied. An input's `type` is
 * passed to the compiler's parser and must parse as exactly one type
 * (`input-type.ts`). The emitter writes that field into an interface verbatim,
 * so a "type" that closes the interface puts a second program in the emitted
 * file. Only the parser can reliably say where a type ends. For an `ios` or
 * `android` screen, the same parser maps each type by the native contract's
 * table (`emit-native.ts`), and a type the table does not map is a fault.
 * With the platform's member package (`options.native`), a type is also held
 * to the names the package declares, and every member the screen uses to the
 * ones it draws.
 */
export function validateSpec(
  registry: Registry,
  document: unknown,
  options: SpecOptions = {},
): SpecValidation {
  const platform =
    typeof document === 'object' && document !== null
      ? (document as { platform?: unknown }).platform
      : undefined
  const judges: SpecJudges = { inputType: inputTypeFault }
  if (platform === 'ios' || platform === 'android') {
    if (options.native !== undefined && options.native.platform !== platform) {
      throw new MissingContractError(platform, options.native.platform)
    }
    Object.assign(
      judges,
      platform === 'ios' ? swiftJudges(options.native) : kotlinJudges(options.native),
    )
  }
  return validateComposition(registry, document, judges, options)
}

/**
 * A screen, emitted and then checked against the red rules.
 *
 * A lawful spec cannot *write* a style or a raw control. The format has no
 * field for one, and validation requires a binding to be a path, a component
 * to be a member and a type to be a type. A spec can still *contain* something
 * the rules read as a design value, such as a label whose text is `#7c3aed`.
 * The format knows only that a label is a string, and the rules know what a
 * string holds.
 *
 * So the format alone cannot guarantee that the emitted file passes the red
 * rules, and the output is checked instead. The code runs through
 * `@polymorph/rules/verify`, the same path the MCP server's `validate` uses, and
 * the result says whether the file may be written. Every entry point that
 * writes an emitted screen (`pnpm emit`, the MCP tool `emit_screen`) goes
 * through here. It checks the red rules and nothing else a lint config may
 * contain. The red rules read TSX, Vue, Svelte and Angular, and no native
 * language, so a native screen is held to the native screen contract's law
 * instead, and what breaks it comes back in `fatal`.
 */
export interface CheckedScreen {
  /** The emitted file. Returned either way, so a caller can show what was refused. */
  code: string
  /** Red-rule violations in `code`. Empty, with `fatal` null, means it may be written. */
  violations: Diagnostic[]
  /** Set when the rules could not read the emitted code at all. */
  fatal: string | null
}

export async function emitCheckedScreen(
  spec: ScreenSpec,
  options: EmitOptions = {},
): Promise<CheckedScreen> {
  let code: string
  try {
    code = await emitScreen(spec, options)
  } catch (error) {
    // Nothing was emitted, so there is nothing to verify; the refusal is the
    // whole result, in the channel callers already read as "do not write".
    if (
      error instanceof MissingRegistryError ||
      error instanceof MissingContractError ||
      error instanceof NativeContractError ||
      error instanceof KotlinPackageError ||
      error instanceof UnemittedFrameworkError
    )
      return { code: '', violations: [], fatal: error.message }
    throw error
  }
  // The red rules read TSX, Vue, Svelte and Angular. A native view is held to the native
  // contract's law instead: no state, no asynchronous call, no navigation and
  // no theme in the file.
  if (spec.platform === 'ios' || spec.platform === 'android') {
    const broken =
      spec.platform === 'ios' ? swiftScreenViolations(code) : kotlinScreenViolations(code)
    return {
      code,
      violations: [],
      fatal:
        broken.length === 0
          ? null
          : `the emitted view holds what a native screen may not: ${broken.join(', ')}`,
    }
  }
  // A Vue or Svelte screen is linted as the single-file component it is, a
  // Solid one as Solid TSX, and an Angular one as a TypeScript module whose
  // inline template the Angular template parser reads.
  const framework = options.framework ?? 'react'
  const filename = DEFAULT_PATHS.application.code.replace(/\.tsx$/, FRAMEWORK_EXTENSIONS[framework])
  const { diagnostics, fatal } = await verify(code, { filename, framework })
  return { code, violations: diagnostics, fatal }
}
