import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

import {
  addElements,
  applyPlan,
  checkoutHolding,
  escapes,
  EscapingDirError,
  installFramework,
  MANIFEST_FILE,
  PatchError,
  planInstall,
  readManifest,
  type ApplyResult,
} from '@polymorph/cli'
import {
  DEFAULT_PATHS,
  errorsOf,
  fix as applyFixes,
  isStylesheet,
  warningsOf,
  type Diagnostic,
  type Surface,
} from '@polymorph/rules/verify'
import { auditExceptions, type ExceptionLike, type Registry } from '@polymorph/registry'
import {
  codeFrameworkOf,
  FRAMEWORK_VOCABULARY,
  frameworkOfPath,
  type Framework,
} from '@polymorph/registry'
import {
  angularScreenSelector,
  EMITTED_MARKER,
  emitCheckedScreen,
  ELEMENTS_UNEMITTED,
  kotlinNames,
  readNativePackage,
  swiftNames,
  validateSpec,
  type ScreenSpec,
  type SpecFault,
} from '@polymorph/spec'
import { admitTheme, type AdmittedFont } from '@polymorph/theme'

import { withClimb, type Violation } from './violations'
import { submittedDocument, type SubmittedSpec } from './submitted'

/**
 * The four tools that write, as functions.
 *
 * The read tools answer questions about the system. These tools put part of it
 * in the caller's repository. Each one calls machinery that already exists and
 * is tested where it lives: the spec emitter, the installer, and theme
 * admission. What an agent gets on disk is exactly what the system produces,
 * byte for byte, not a model's copy of it. That is why an agent gets write
 * tools when it can already edit files: a screen it re-typed from a
 * description can drift from the vocabulary, and a screen the emitter wrote
 * cannot.
 *
 * **Two roots, and every write goes under one of them.** `root` is the
 * checkout the vocabulary is read from, as the read tools use it. `project` is
 * the repository being worked on, and every byte these tools write goes under
 * it. `project` is also `root` only when the server runs inside the checkout
 * itself. A server started without a project has no write tools.
 *
 * **Nothing unlawful is written.** Each tool checks before it writes, with the
 * same check its read-only counterpart uses: `emit_screen` runs `validate`'s
 * spec check and then the red rules over what it emitted, `save_theme` runs the
 * admission `propose_theme` reports, `install` applies `get_install_plan`'s
 * plan, and `fix_file` writes only what the rules' own fixes produced. A
 * refusal writes nothing and says why. The one write that can stop halfway is
 * an install whose last step, editing the project's own lint config, cannot be
 * done automatically. It reports what it wrote and how to finish.
 *
 * **No one's work is replaced without notice.** `install` keeps any file it did
 * not write itself, and any file it wrote that has been edited since, as
 * `polymorph add` does. `emit_screen` replaces a file only when that file is
 * itself an emitted screen. `save_theme` names an existing file instead of
 * replacing it, unless the caller passes `overwrite`. `fix_file` is the one
 * tool whose job is to edit a file somebody wrote. It changes only what a fix
 * changes, and lists the changes.
 *
 * Takes the context structurally instead of importing `ToolContext`, for the
 * same reason as `propose.ts`: `tools.ts` re-exports this module, and a type
 * that needs only three fields is not worth an import cycle.
 */

interface WriteContext {
  registry: Registry
  root: string
  project?: string
}

/* -------------------------------------------------------------------------- */
/* Where a write may land                                                     */
/* -------------------------------------------------------------------------- */

/** A write refused because of *where* it would go, or what it would overwrite. */
export class RefusedWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefusedWriteError'
  }
}

/**
 * The repository to write into, or the reason there is none.
 *
 * The `package.json` check guards against the most common mistake: an MCP
 * client that starts its servers outside the repository, for example in a home
 * directory. Vendored source written there is not an install, only stray
 * files, and the tool cannot tell the difference without checking. A page with
 * no build has no `package.json`, and its install manifest marks it instead.
 */
function projectOf(context: WriteContext): string {
  if (context.project === undefined) {
    throw new RefusedWriteError(
      'polymorph: this server has no project to write into — it was started read-only',
    )
  }
  if (
    !existsSync(resolve(context.project, 'package.json')) &&
    !existsSync(resolve(context.project, MANIFEST_FILE))
  ) {
    throw new RefusedWriteError(
      `polymorph: ${context.project} has no package.json or ${MANIFEST_FILE}, so it is not the ` +
        'repository to write into — start the server from your repository, or pass ' +
        '`--project <path>`',
    )
  }
  return context.project
}

/**
 * Whether the project is the checkout the vocabulary itself lives in.
 *
 * Compared as real paths. One directory reached through a symlink is still one
 * directory, and the path a client used to start the server does not decide
 * which repository this is.
 */
function isSource(context: WriteContext, project: string): boolean {
  return realpathSync(project) === realpathSync(context.root)
}

/**
 * Whether the project is a checkout of the vocabulary or a directory inside
 * one: this checkout, or another copy of it, a clone or a worktree, which is
 * recognised by its contents. `polymorph init`, `add` and `update` refuse the
 * same directories, through the same function (`checkoutHolding`).
 */
function holdsVocabulary(context: WriteContext, project: string): boolean {
  return checkoutHolding(project, context.root, context.registry) !== null
}

/** `existsSync` follows a link and so cannot see a broken one; this can. */
function present(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Where a project-relative path actually resolves, or a refusal when that is
 * outside the project.
 *
 * Two checks, because "inside" has two meanings. `escapes` is the installer's
 * own containment check and reads the path as written: no `..`, nothing
 * absolute. That is not enough for a path that has not been resolved yet,
 * because a directory along the way can be a link (a workspace's
 * `node_modules` is made of them). So the deepest existing part of the path is
 * resolved for real, and it must also be under the project.
 */
function placed(project: string, path: string, what: string): string {
  if (escapes(path)) throw new EscapingDirError(path, what)
  const full = resolve(project, path)

  let anchor = full
  while (!present(anchor)) anchor = dirname(anchor)

  const base = realpathSync(project)
  let real: string
  try {
    real = realpathSync(anchor)
  } catch {
    // A link that points at nothing: writing through it would create its target.
    throw new EscapingDirError(path, what)
  }
  if (real !== base && !real.startsWith(`${base}${sep}`)) throw new EscapingDirError(path, what)

  return full
}

/**
 * The one function that every byte this package writes itself goes through.
 *
 * `thin-front.test.ts` requires this to be the only write call in the package.
 * `install` is the other way a byte reaches the project, and those writes are
 * made by the installer.
 */
function land(project: string, path: string, contents: string): void {
  const full = placed(project, path, 'a written path')
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, contents)
}

/** What is at a project path now, or `null` when nothing is. */
function current(project: string, path: string): string | null {
  const full = resolve(project, path)
  return existsSync(full) ? readFileSync(full, 'utf8') : null
}

/* -------------------------------------------------------------------------- */
/* emit_screen                                                                */
/* -------------------------------------------------------------------------- */

export interface EmitScreenArgs {
  /** A screen spec, the document or its JSON text: the argument `validate` takes. */
  spec: SubmittedSpec
  /**
   * Where the screen is written, relative to the project: a `.tsx` file for
   * React or Solid, a `.vue` file for Vue, a `.svelte` file for Svelte, a `.ts`
   * module for Angular, a `.swift` file for a spec whose platform is `ios`, a
   * `.kt` file for one whose platform is `android`.
   */
  path: string
  /**
   * The web framework to emit for. Omitted, it is read from the path
   * (`frameworkOfPath`): `vue` for a `.vue` file, `svelte` for a `.svelte`
   * file, `angular` for a `.ts` module. A `.tsx` file is Solid's in a package
   * that uses `@polymorph/solid-ui` and not `@polymorph/react-ui`, as
   * `validate` reads a spec (`codeFrameworkOf`), and React's otherwise.
   * `elements` is refused: HTML has no way to bind a screen's callbacks and
   * node renderers (`ELEMENTS_UNEMITTED`).
   */
  framework?: Framework
}

export interface EmitScreenAnswer {
  ok: boolean
  /** Why the spec is unlawful. Nothing is written while this is non-empty. */
  faults: SpecFault[]
  /**
   * Red-rule violations in what the spec emitted. Nothing is written while this
   * is non-empty either.
   */
  violations?: Diagnostic[]
  /**
   * Reports in what the spec emitted of rules the groups report as warnings.
   * They do not stop the write.
   */
  warnings?: Diagnostic[]
  /** Set when nothing could be written for a reason other than a fault. */
  fatal: string | null
  path?: string
  /** The component the file exports: for SwiftUI, the view; for Compose, the composable. */
  component?: string
  /**
   * What the file is written in: `tsx` (React or Solid), `vue`, `svelte`,
   * `angular` (a TypeScript module, its template inline), `swift` for an `ios`
   * spec, or `kotlin` for an `android` one.
   */
  language?: EmitLanguage
  /** `replaced` is an earlier emit regenerated; `unchanged` was already these bytes. */
  outcome?: 'written' | 'replaced' | 'unchanged'
  /** Facts about the project that the file alone does not show. */
  notes?: string[]
  next?: string
}

/** What an emitted screen is written in, and the extension each takes. */
export type EmitLanguage = 'tsx' | 'vue' | 'svelte' | 'angular' | 'swift' | 'kotlin'

const EXTENSIONS: Readonly<Record<EmitLanguage, string>> = {
  tsx: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
  angular: '.ts',
  swift: '.swift',
  kotlin: '.kt',
}

const LANGUAGE_NAMES: Readonly<Record<EmitLanguage, string>> = {
  tsx: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
  swift: 'SwiftUI',
  kotlin: 'Jetpack Compose',
}

/** The language each native platform's screen is written in. */
const NATIVE_LANGUAGES: Readonly<Record<'ios' | 'android', EmitLanguage>> = {
  ios: 'swift',
  android: 'kotlin',
}

/**
 * A screen spec, compiled to a TSX file in the project (React's, or Solid's
 * with `framework: "solid"` or in a package that uses the Solid vocabulary),
 * a Vue or Svelte single-file component, an Angular standalone component, or
 * for a spec whose platform is `ios` or `android`, a SwiftUI or a Jetpack
 * Compose file.
 *
 * This is `pnpm emit`, available to an agent. It validates first and writes
 * nothing if the spec is unlawful, and the faults are `validate`'s faults
 * because the check is the same call. The file written is the emitter's
 * output, formatted by the Prettier config that governs the target path, so
 * nobody re-types it.
 *
 * **The red rules run over the output before it is written.** The format has
 * no field for a style or a raw element. The validator requires a binding to
 * be a path and a type to be one type, so a lawful spec has nowhere to write
 * either. A spec can still contain something the rules read as a design value,
 * such as a label that is a colour, because the format knows only that a label
 * is a string and the rules know what the string holds. So the output itself
 * is checked, by `emitCheckedScreen`, which `pnpm emit` also calls. Code that
 * breaks a rule is not written. The red rules read TSX, Vue, Svelte and
 * Angular, and no native language, so a native screen is held to the native
 * screen contract's law instead, and what breaks it comes back in `fatal`.
 *
 * The emitted file is a presentational component, the generated part of the
 * screen. Regenerating it over an earlier emit is the normal loop when a spec
 * changes, even when somebody has edited the emitted file since. That is why
 * hand-written code belongs in the container. The tool refuses to write over
 * a file that is not an emitted screen. That file is somebody's source, and a
 * client should not approve a tool that would overwrite it on a wrong path
 * without reading the call.
 */
export async function emitScreen(
  context: WriteContext,
  args: EmitScreenArgs,
): Promise<EmitScreenAnswer> {
  const project = projectOf(context)

  const full = placed(project, args.path, '`path`')

  const read = submittedDocument(args.spec)
  if ('fatal' in read) return { ok: false, faults: [], fatal: read.fatal }
  const { document } = read

  // The platform is the spec's own field. The framework is the caller's, or
  // the path's, or for a web spec at a TSX path the project's, as `validate`
  // reads a spec. A native spec is SwiftUI or Compose whatever the path says,
  // a web framework names no native language, and a path or a framework that
  // disagrees is refused before anything is checked.
  const platform = (document as { platform?: unknown } | null)?.platform
  const native = platform === 'ios' || platform === 'android' ? platform : undefined
  const framework =
    args.framework ??
    frameworkOfPath(args.path) ??
    (native === undefined ? codeFrameworkIn(context, undefined, args.path) : 'react')
  // Every read tool takes the elements; a screen is not emitted for them.
  if (framework === 'elements' && native === undefined) {
    throw new RefusedWriteError(`polymorph: ${ELEMENTS_UNEMITTED}`)
  }
  const language: EmitLanguage =
    native !== undefined
      ? NATIVE_LANGUAGES[native]
      : framework === 'vue' || framework === 'svelte' || framework === 'angular'
        ? framework
        : 'tsx'
  if (native !== undefined && args.framework !== undefined) {
    throw new RefusedWriteError(
      `polymorph: a screen for ${native} is written in ${LANGUAGE_NAMES[language]}, and ` +
        '`framework` names a web framework — leave it out',
    )
  }
  const extension = EXTENSIONS[language]
  if (!args.path.endsWith(extension)) {
    const nativeExtension = Object.entries(NATIVE_LANGUAGES).find(([, written]) =>
      args.path.endsWith(EXTENSIONS[written]),
    )
    const named = framework === 'solid' && native === undefined ? 'Solid' : LANGUAGE_NAMES[language]
    throw new RefusedWriteError(
      `polymorph: an emitted ${named} screen is a ${extension} file, and ` +
        `"${args.path}" is not one` +
        (nativeExtension === undefined
          ? ''
          : ` — a ${EXTENSIONS[nativeExtension[1]]} file is emitted from a spec for ` +
            `\`${nativeExtension[0]}\``),
    )
  }
  const memberPackage = native === undefined ? undefined : readNativePackage(context.root, native)
  const vocabulary = FRAMEWORK_VOCABULARY[framework]

  const { ok, faults } = validateSpec(context.registry, document, {
    framework,
    ...(memberPackage === undefined ? {} : { native: memberPackage }),
  })
  if (!ok) return { ok: false, faults, fatal: null }

  const previous = current(project, args.path)
  if (previous !== null && !previous.includes(EMITTED_MARKER)) {
    throw new RefusedWriteError(
      `polymorph: ${args.path} exists and is not an emitted screen — choose another path, or ` +
        'move the file that is there',
    )
  }

  const spec = document as ScreenSpec
  const { code, violations, warnings, fatal } = await emitCheckedScreen(spec, {
    filepath: full,
    framework,
    registry: context.registry,
    ...(memberPackage === undefined ? {} : { native: memberPackage }),
  })

  if (fatal !== null || violations.length > 0) {
    return {
      ok: false,
      faults: [],
      violations,
      fatal:
        fatal ??
        'the screen this spec emits breaks a red rule, so it was not written — a value in the ' +
          'spec says something application code may not, and `violations` names it',
    }
  }

  if (previous !== code) land(project, args.path, code)

  const outcome = previous === null ? 'written' : previous === code ? 'unchanged' : 'replaced'
  if (language === 'swift') {
    const names = swiftNames(spec.name)
    return {
      ok: true,
      faults: [],
      fatal: null,
      path: args.path,
      component: names.view,
      language,
      outcome,
      // The file imports `PolymorphUI`, which an app gets from the Swift
      // package in `platforms/ios`; no package manifest here says whether it has.
      notes: [],
      next:
        `Render ${names.view}(model:actions:) from the app's store: it holds a ${names.model}, ` +
        `\`loadStatus\` first, and supplies ${names.actions}, one closure per action ` +
        `(\`${names.actions}.inert\` until it is wired). The store owns every task and the router.`,
    }
  }
  if (language === 'kotlin') {
    const names = kotlinNames(spec.name)
    return {
      ok: true,
      faults: [],
      fatal: null,
      path: args.path,
      component: names.screen,
      language,
      outcome,
      // The file imports `dev.polymorph.ui`, which an app gets from the Gradle
      // build in `platforms/android`; no build file here says whether it has.
      notes: [],
      next:
        `Call ${names.screen}(model, actions) from the app's route: its store holds a ` +
        `${names.model}, \`loadStatus\` first, and implements ${names.actions}, one function ` +
        `per action (\`${names.inert}\` until it is wired). The store owns every coroutine and ` +
        'the router.',
    }
  }

  const inputs = spec.inputs.map((input) => input.name)
  return {
    ok: true,
    faults: [],
    fatal: null,
    ...(warnings.length === 0 ? {} : { warnings }),
    path: args.path,
    component: spec.name,
    language,
    outcome,
    // Reported here instead of left for the build to find. An emitted screen
    // imports its members from the package, and a project that only vendors
    // them, or has installed nothing yet, has no such module to resolve.
    notes:
      declares(project, args.path, vocabulary) !== false
        ? []
        : [
            `${vocabulary} is not a dependency of the package this file landed in, and the ` +
              'file imports its members from there — add it with your package manager before ' +
              'this screen can build (the `install` tool vendors source; it does not add it)',
          ],
    next:
      framework === 'angular'
        ? angularNext(spec.name, inputs)
        : nextStep(spec.name, inputs, framework),
  }
}

/** What to do with an emitted web screen: render it from a container. */
function nextStep(name: string, inputs: string[], framework: Framework): string {
  return inputs.length === 0
    ? `Render <${name} /> — it takes no props.`
    : `Render <${name}> from a container that owns the state and the handlers; it ` +
        `takes ${inputs.join(', ')} as props` +
        (framework === 'vue' ? ', a callback `onFoo` as `@foo` or `:onFoo`.' : '.')
}

/**
 * The same for an Angular screen, which a container lists in its `imports` and
 * renders by its selector. Every input is a signal input, a callback included,
 * so a container passes a function that keeps `this`.
 */
function angularNext(name: string, inputs: string[]): string {
  const element = angularScreenSelector(name)
  return inputs.length === 0
    ? `Render <${element} /> (\`${name}\`, listed in the container's \`imports\`) — it ` +
        'takes no inputs.'
    : `Render <${element}> (\`${name}\`, listed in the container's \`imports\`) from a container ` +
        `that owns the state and the handlers; it takes ${inputs.join(', ')} as inputs, a ` +
        'callback as a function that keeps `this` (`[onSave]="save"` with `save` an arrow function).'
}

/**
 * Whether the package a project path belongs to declares a dependency, or
 * `null` when that cannot be determined.
 *
 * Uses the nearest `package.json` at or above the path, because a project can
 * be a workspace, and the relevant manifest is that of the package the file is
 * in. A manifest that cannot be read is not a "no". Each caller decides what
 * an unknown answer means for it.
 */
function declares(project: string, path: string, name: string): boolean | null {
  let directory = dirname(resolve(project, path))
  while (!existsSync(resolve(directory, 'package.json'))) {
    const above = dirname(directory)
    if (above === directory) return null
    directory = above
  }

  try {
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    return ['dependencies', 'devDependencies', 'peerDependencies'].some(
      (field) => manifest[field]?.[name] !== undefined,
    )
  } catch {
    return null
  }
}

/**
 * The module a rewritten `<button>` may import `Button` from, or `null` when
 * this project has none.
 *
 * The one fix that writes an import of a member needs this answer, and a wrong
 * guess breaks the file the fix touched. A project that vendors its members
 * imports them by path and has no such package to name. The module is the
 * framework's vocabulary (`@polymorph/react-ui`, `@polymorph/solid-ui`, …).
 *
 * For a file, the question is asked of the package the file is in, and only a
 * clear yes counts. For a fragment that is not a file yet, there is no package
 * to ask. The answer is then the vocabulary's own package, which the emitter
 * also writes, unless the project is recorded as vendoring instead: it has an
 * install manifest and no dependency on the package.
 */
export function vocabularyFor(
  context: WriteContext,
  framework: Framework,
  path?: string,
): string | null {
  // An element is not imported by name, so a rewritten `<button>` has nothing to import.
  if (framework === 'elements') return null
  const vocabulary = FRAMEWORK_VOCABULARY[framework]
  const project = context.project
  if (project === undefined || !existsSync(resolve(project, 'package.json'))) return vocabulary

  if (path !== undefined) return declares(project, path, vocabulary) === true ? vocabulary : null

  if (declares(project, 'package.json', vocabulary) === true) return vocabulary
  return existsSync(resolve(project, MANIFEST_FILE)) ? null : vocabulary
}

/**
 * The framework a tool reads code or a spec in, when the caller names none:
 * the registry's `codeFrameworkOf`, asked with this project's facts.
 *
 * Every tool that reads code or a screen spec asks it, so a fragment
 * `validate` passes is the fragment `fix` leaves alone, and a spec `validate`
 * accepts is the spec `emit_screen` writes: `validate` and `fix` for a
 * fragment or a spec, which have no path, `fix_file` for a file, and
 * `emit_screen` for a TSX path. `polymorph check` asks the same function, so
 * a file it passes is a file `fix_file` leaves alone.
 *
 * A package uses a vocabulary when it depends on it, or when the project's
 * install manifest records that framework's members as vendored, or the
 * project as a page's (`elements`). In a Solid package a rewritten `<button>`
 * imports from `@polymorph/solid-ui` and `class` reads as Solid's. `path` is
 * the file in the project. Without one, the project's own `package.json`
 * answers. A page with no build has no `package.json`, and its manifest
 * answers. Without a project, the answer is React's.
 */
export function codeFrameworkIn(
  context: WriteContext,
  asked: Framework | undefined,
  path?: string,
): Framework {
  const project = context.project
  const recorded = project === undefined ? undefined : recordedFramework(project)
  return codeFrameworkOf(
    asked,
    path,
    project === undefined ||
      (!existsSync(resolve(project, 'package.json')) && recorded === undefined)
      ? null
      : (framework) =>
          recorded === framework ||
          declares(project, path ?? 'package.json', FRAMEWORK_VOCABULARY[framework]) === true,
  )
}

/**
 * The framework the project's install manifest records, or `undefined` when it
 * records none or cannot be read.
 */
function recordedFramework(project: string): Framework | undefined {
  try {
    return readManifest(project)?.framework
  } catch {
    return undefined
  }
}

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The framework an install in the project plans in, by `polymorph add`'s rule
 * (`installFramework`): the project's manifest decides once there is one, and
 * a framework asked for that differs from it is refused.
 */
export function installFrameworkOf(context: { project?: string }, asked?: Framework): Framework {
  const manifest = context.project === undefined ? null : readManifest(context.project)
  return installFramework(manifest === null ? null : manifest.framework, asked)
}

export interface InstallArgs {
  items: string[]
  dir?: string
  /** As for `get_install_plan`: the manifest's framework when omitted, and refused when it differs. */
  framework?: Framework
}

export interface InstallAnswer {
  /** The registry version the install was resolved against. */
  version: string
  /** Where vendored source was written, relative to the project. */
  dir: string
  /** Members asked for by name. */
  requested: string[]
  /** Members nobody named, vendored because something asked for needs them. */
  cameAlong: string[]
  systems: string[]
  palettes: string[]
  written: string[]
  /** Vendored files the consumer has edited. Kept as they are. */
  kept: string[]
  /** The consumer's own files the install extended: `package.json`, lint configs. */
  extended: string[]
  /** Package -> version range, now in the project's manifest. */
  packages: Record<string, string>
  /** Package -> version range, now in the project's dev dependencies: the red rules. */
  devPackages: Record<string, string>
  notes: string[]
  next: string
}

/**
 * `polymorph add`, applied to the project.
 *
 * This calls the CLI's two parts directly: `planInstall`, which
 * `get_install_plan` already exposes, and `applyPlan`, which copies the
 * closure, records every file's hash in the manifest, and extends the
 * project's lint configs so the red rules run with the source. Nothing about
 * an install is decided here. An agent that read the plan and then calls this
 * gets that plan.
 *
 * There is no `force`. A file the install did not write, or wrote and the
 * consumer has edited since, belongs to the consumer. The installer keeps it,
 * and the answer lists it under `kept`. Discarding somebody's work is a
 * decision for a person at a terminal.
 *
 * Refused in a checkout of the vocabulary (this one or another copy) and in
 * any directory inside one, where an install would vendor the system into its
 * own source.
 *
 * **The one write that can stop halfway.** The installer copies the closure
 * and records it before it edits the project's own config. A config it cannot
 * edit then leaves an install that a retry completes, not untracked files.
 * That order belongs to the installer and is kept. This function adds a
 * message that says so, because "could not edit your ESLint config" reads as
 * "nothing happened", which would be false.
 */
export function install(context: WriteContext, args: InstallArgs): InstallAnswer {
  const project = projectOf(context)
  if (holdsVocabulary(context, project)) {
    throw new RefusedWriteError(
      'polymorph: this project is in a checkout of polymorph itself, and an install would vendor ' +
        'the vocabulary into its own source — start the server from the repository that ' +
        'consumes it, or pass `--project <path>`',
    )
  }

  // An install stays in the framework its manifest records, as with the CLI.
  const framework = installFrameworkOf(context, args.framework)
  const plan = planInstall(context.registry, args.items, {
    ...(args.dir ? { dir: args.dir } : {}),
    ...(framework === 'react' ? {} : { framework }),
  })
  placed(project, plan.dir, '`dir`')

  // A page installs no member: it loads every element. A theme joins its sheet.
  if (framework === 'elements') {
    const page = addElements(project, context.root, context.registry, args.items, {
      force: false,
      ...(args.dir ? { dir: args.dir } : {}),
    })
    return {
      version: plan.version,
      dir: plan.dir,
      requested: [],
      cameAlong: [],
      systems: plan.systems.map((system) => system.name),
      palettes: plan.palettes.map((palette) => palette.name),
      written: page.written,
      kept: page.skipped,
      extended: [],
      packages: {},
      devPackages: {},
      notes: page.notes,
      next:
        page.written.length === 0
          ? 'Nothing was installed — the notes say why.'
          : 'The theme sheet is written; `<html data-system data-palette>` chooses the pairing.',
    }
  }
  const lands = plan.files.length + plan.systems.length + plan.palettes.length > 0

  // An install that resolves to nothing, such as a member that ships inside
  // `@polymorph/react`, creates no manifest and touches no file, as with the
  // CLI.
  let result: Pick<ApplyResult, 'written' | 'skipped' | 'patched' | 'notes'> = {
    written: [],
    skipped: [],
    patched: [],
    notes: plan.notes,
  }
  if (lands) {
    try {
      result = applyPlan(project, context.root, context.registry, plan)
    } catch (error) {
      if (error instanceof PatchError) throw new UnfinishedInstallError(error)
      throw error
    }
  }

  return {
    version: plan.version,
    dir: plan.dir,
    requested: plan.requested,
    cameAlong: plan.components.filter((name) => !plan.requested.includes(name)),
    systems: plan.systems.map((system) => system.name),
    palettes: plan.palettes.map((palette) => palette.name),
    written: result.written,
    kept: result.skipped,
    extended: result.patched,
    packages: plan.packages,
    devPackages: plan.devPackages,
    notes: result.notes,
    next: !lands
      ? 'Nothing was vendored — the notes say why.'
      : result.patched.includes('package.json')
        ? 'Run your package manager’s install: package.json has new dependencies.'
        : 'Every dependency was already declared — the vendored source is ready to import.',
  }
}

/**
 * An install that wrote its files and then reached a config it could not edit.
 *
 * Not a refusal, because the vendored source is on disk and the manifest
 * records it. Not a success either, because the lint config that makes the
 * red rules run is still unlinked. The message carries the installer's own
 * instruction (the lines to add) and says that a second call finishes the job.
 */
export class UnfinishedInstallError extends Error {
  constructor(stopped: PatchError) {
    super(
      `${stopped.message}\n\nThe vendored source is on disk and recorded in ${MANIFEST_FILE}; the ` +
        'install stopped at this edit. Make it, then call `install` again with the same items ' +
        'to finish.',
    )
    this.name = 'UnfinishedInstallError'
  }
}

export { EscapingDirError }

/* -------------------------------------------------------------------------- */
/* save_theme                                                                 */
/* -------------------------------------------------------------------------- */

export interface SaveThemeArgs {
  /** A system document, as `propose_theme` returns in `system`. */
  system: unknown
  /** A palette document, as `propose_theme` returns in `palette`. */
  palette: unknown
  /** The directory holding `systems/` and `palettes/`, relative to the project. */
  dir?: string
  /** Replace a file already there under the same name. Off by default. */
  overwrite?: boolean
}

export interface SaveThemeAnswer {
  /** Whether both documents are on disk as admitted when the call returns. */
  saved: boolean
  lawful: boolean
  /** Every reason the pair was refused, in the words of whatever refused it. */
  faults: string[]
  written: string[]
  unchanged: string[]
  /** Files already there with other contents. Named instead of replaced. */
  existing: string[]
  /** The webfont packages the system's type needs. */
  fonts: AdmittedFont[]
  /** The catalogue laws that did not run on this pair. */
  exemptions: string[]
  notes: string[]
  next: string
}

/** Where theme documents live when the caller does not say. */
export const DEFAULT_THEME_DIR = 'design'

/**
 * A system and a palette, admitted and then written as two JSON files.
 *
 * The counterpart of `propose_theme`, which returns two documents and a
 * verdict and writes nothing. The verdict is checked again here, through the
 * same `admitTheme`, instead of trusted. The pair an agent submits may have
 * been edited since it was proposed, and a tool that wrote whatever it was
 * given would leave every later build to find the fault. An unlawful pair
 * writes nothing and comes back with the laws' own messages.
 *
 * **Both documents are checked before either is written**, and an existing
 * file is named instead of replaced unless the caller passes `overwrite`. A
 * system on disk whose palette was never written is a catalogue that does not
 * load.
 *
 * A palette that names a more-contrast partner is admitted with the partner
 * already saved beside it, `<dir>/palettes/<partner>.json`, as the Vite plugin
 * admits it from the same directory. A partner that is not there refuses the
 * pair, so the partner is saved first.
 *
 * The files follow the layout of this repository's own catalogue:
 * `<dir>/systems/<name>.json` and `<dir>/palettes/<name>.json`, two-space JSON
 * with a trailing newline. The workbench studio, the Vite plugin and a person
 * all read them the same way. Wiring them into a build belongs to the
 * project's own configuration, which this does not edit. `next` says what to
 * add.
 */
export function saveTheme(context: WriteContext, args: SaveThemeArgs): SaveThemeAnswer {
  const project = projectOf(context)
  const dir = args.dir ?? DEFAULT_THEME_DIR
  placed(project, dir, '`dir`')

  const admission = admitTheme({
    system: args.system,
    palette: args.palette,
    moreContrast: savedPartner(project, dir, args.palette),
  })
  const faults = admission.faults.map((fault) => fault.message)

  // The registry's part of the member-exceptions law, repeated here as the
  // studio's save repeats it. The schema checked an exception's shape, and only
  // the catalogue knows whether the member it names reads that token.
  const exceptions = (admission.system?.overrides?.exceptions ?? []) as ExceptionLike[]
  faults.push(...auditExceptions(context.registry.components, exceptions))

  const answer = {
    lawful: faults.length === 0,
    faults,
    fonts: admission.fonts ?? [],
    exemptions: [...admission.exemptions],
  }

  if (!admission.lawful || faults.length > 0) {
    const partner = admission.faults.some((fault) => fault.message.startsWith('moreContrast: '))
    return {
      ...answer,
      saved: false,
      written: [],
      unchanged: [],
      existing: [],
      notes: [],
      next: partner
        ? 'Nothing was written. Save the more-contrast palette first, with the same system, so ' +
          `it is in ${dir}/palettes, and then save this pair again.`
        : 'Nothing was written. Answer the faults and save again.',
    }
  }

  const files = [
    { path: `${dir}/systems/${admission.system.name}.json`, data: admission.system },
    { path: `${dir}/palettes/${admission.palette.name}.json`, data: admission.palette },
  ].map((file) => ({
    path: file.path,
    contents: `${JSON.stringify(file.data, null, 2)}\n`,
    previous: current(project, file.path),
  }))

  const unchanged = files.filter((file) => file.previous === file.contents)
  const existing = files.filter((file) => file.previous !== null && file.previous !== file.contents)

  if (existing.length > 0 && args.overwrite !== true) {
    return {
      ...answer,
      saved: false,
      written: [],
      unchanged: unchanged.map((file) => file.path),
      existing: existing.map((file) => file.path),
      notes: [],
      next:
        'Nothing was written: a file of that name is already there with other contents. Rename ' +
        'the pair, or pass `overwrite: true` to replace it.',
    }
  }

  // Both destinations are checked before either is written. A system on disk
  // whose palette then failed to write would be half a save.
  const writes = files.filter((file) => file.previous !== file.contents)
  for (const file of writes) placed(project, file.path, 'a written path')
  for (const file of writes) land(project, file.path, file.contents)

  const source = isSource(context, project) && dir === DEFAULT_THEME_DIR
  return {
    ...answer,
    saved: true,
    written: writes.map((file) => file.path),
    unchanged: unchanged.map((file) => file.path),
    existing: [],
    notes: notesFor(context, project, dir, admission.system, admission.palette, source),
    next: source
      ? 'Run `pnpm registry`. The pair is part of this catalogue now, so the catalogue laws in ' +
        '`pnpm test` judge it too, beside the pairing laws it has just passed.'
      : 'List both files in `polymorphTheme({ systems, palettes })` from `@polymorph/engine/vite` ' +
        '— the build admits the pair again and emits its stylesheet — and install the packages ' +
        'in `fonts`.',
  }
}

/**
 * The more-contrast partner the palette names, as saved in `<dir>/palettes`.
 * Absent when it names none or the file is not there; admission then reports
 * the missing partner. A file that is not JSON is passed as text, and the
 * schema refuses it.
 */
function savedPartner(project: string, dir: string, palette: unknown): unknown {
  const named = (palette as { moreContrast?: unknown } | null)?.moreContrast
  if (typeof named !== 'string' || escapes(named)) return undefined
  const saved = current(project, `${dir}/palettes/${named}.json`)
  if (saved === null) return undefined
  try {
    return JSON.parse(saved) as unknown
  } catch {
    return saved
  }
}

/**
 * What `admitTheme` cannot check, because it judges documents, and these are
 * facts about where the documents are now saved.
 */
function notesFor(
  context: WriteContext,
  project: string,
  dir: string,
  system: { name: string; defaultPalette: string },
  palette: { name: string },
  source: boolean,
): string[] {
  const notes: string[] = []

  // A system resolves through the palette it declares. If it is saved beside a
  // different palette and the declared one is not in the directory, it has no
  // colours.
  if (
    system.defaultPalette !== palette.name &&
    current(project, `${dir}/palettes/${system.defaultPalette}.json`) === null
  ) {
    notes.push(
      `${system.name} declares the palette "${system.defaultPalette}", and no file of that name ` +
        `is in ${dir}/palettes — a system is painted with the palette it declares`,
    )
  }

  // Inside the catalogue's own directory the names *are* the shipped ones, and
  // `existing` has already reported them. Anywhere else, a guest with a shipped
  // name means two stylesheets match one attribute.
  if (!source) {
    if (context.registry.theme.systems.some((entry) => entry.name === system.name)) {
      notes.push(
        `"${system.name}" is also a shipped system — a page that installs both wears one name ` +
          'for two sheets',
      )
    }
    if (context.registry.theme.palettes.some((entry) => entry.name === palette.name)) {
      notes.push(
        `"${palette.name}" is also a shipped palette — a page that installs both wears one ` +
          'name for two sheets',
      )
    }
  }

  return notes
}

/* -------------------------------------------------------------------------- */
/* fix_file                                                                   */
/* -------------------------------------------------------------------------- */

export interface FixFileArgs {
  /**
   * The file to fix, relative to the project: TypeScript or JavaScript, a Vue
   * or Svelte component, an Angular template, or CSS.
   */
  path: string
  surface?: Surface
  /**
   * The web framework the file is written in. Omitted, it is read from the
   * file and its package (`codeFrameworkOf`): a `.ts` module in a package that
   * uses `@polymorph/angular-ui` is an Angular component, and TSX in one that
   * uses `@polymorph/solid-ui` is Solid's.
   */
  framework?: Framework
}

export interface FixFileAnswer {
  /** Whether anything is left to report once the fixes are applied. */
  ok: boolean
  path: string
  /** Whether the file was rewritten. */
  changed: boolean
  /** Rule -> how many of its reports the fixes answered. */
  fixed: Record<string, number>
  /** What no fix could answer: these are decisions, each with its rungs. */
  violations: Violation[]
  /** Reports of rules the groups report as warnings, which do not make `ok` false. */
  warnings: Violation[]
  /** Set when the file could not be parsed, in which case it was not touched. */
  fatal: string | null
  notes: string[]
}

/**
 * What the red rules read: source the parser takes, Vue and Svelte
 * components, Angular templates, and stylesheets.
 */
const FIXABLE = /\.(?:[cm]?[jt]s|[jt]sx|vue|svelte|html|css)$/

/** TypeScript with no JSX in it, where `<T>` opens a type and not an element. */
const PLAIN_TYPESCRIPT = /\.[cm]?ts$/

/** A file read by a parser of its own, under the extension it has. */
const OWN_PARSER = /\.(?:vue|svelte|html)$/

/**
 * `fix`, applied to a file in place.
 *
 * The same fixes through the same path (the rules' own, in `eslint --fix`'s
 * loop), with the file read from the project and written back when a fix
 * changed it. That is all it adds, and it is the reason to have it: the code
 * never passes through the conversation in either direction, so a long screen
 * costs the same to fix as a short one and cannot be mistyped on the way back.
 *
 * It edits a file somebody wrote, which no other tool here does. So it changes
 * exactly what a fix changes and nothing more: there is no formatting pass and
 * no rewrite of anything a rule did not report. The answer says how many
 * reports each rule's fixes answered and what is left.
 *
 * **Which framework the file is in** is the caller's `framework`, or read
 * from the file and its package (`codeFrameworkOf`). An Angular component's
 * template is read only when the module is read as Angular, so a `.ts` file in
 * a package that uses the Angular vocabulary is.
 *
 * **Which module `Button` comes from** is asked of the project, not assumed.
 * The one fix that writes an import of a member needs the file's package to
 * depend on the framework's vocabulary. Where it does not (a project that
 * vendors its members imports them by path), that fix is skipped, and the
 * `<button>` stays reported with a note saying why.
 */
export async function fixFile(context: WriteContext, args: FixFileArgs): Promise<FixFileAnswer> {
  const project = projectOf(context)
  placed(project, args.path, '`path`')

  if (!FIXABLE.test(args.path)) {
    throw new RefusedWriteError(
      `polymorph: "${args.path}" is not something the red rules read — they read TypeScript ` +
        'and JavaScript source, Vue and Svelte components, Angular templates, and stylesheets',
    )
  }
  const source = current(project, args.path)
  if (source === null) {
    throw new RefusedWriteError(`polymorph: ${args.path} does not exist in this project`)
  }

  const surface = args.surface ?? 'application'
  // The rules ask where a file sits in *this* repository's layout. A project's
  // own paths cannot answer that, so the surface does, as for `fix`. The
  // extension is the file's own, though, because `<T>(x: T) => x` is TypeScript
  // in a `.ts` file and a syntax error in a `.tsx` one, and a component or a
  // template is read by its own parser.
  const pretend = DEFAULT_PATHS[surface][isStylesheet(args.path) ? 'css' : 'code']
  const own = OWN_PARSER.exec(args.path)?.[0]
  const filename =
    own !== undefined
      ? pretend.replace(/\.tsx$/, own)
      : PLAIN_TYPESCRIPT.test(args.path)
        ? pretend.replace(/\.tsx$/, '.ts')
        : pretend
  const framework = codeFrameworkIn(context, args.framework, args.path)
  const vocabulary = vocabularyFor(context, framework, args.path)

  const result = await applyFixes(source, { surface, filename, framework, vocabulary })
  if (result.output !== source) land(project, args.path, result.output)

  const reports = withClimb(context.registry, result.diagnostics)
  const violations = errorsOf(reports)
  return {
    ok: result.fatal === null && violations.length === 0,
    path: args.path,
    changed: result.output !== source,
    fixed: result.fixed,
    violations,
    warnings: warningsOf(reports),
    fatal: result.fatal,
    notes:
      vocabulary === null
        ? await heldBack(project, args.path, result.output, { surface, filename, framework })
        : [],
  }
}

/** The rule whose fix writes an import of a member. */
const RAW_CONTROL_RULE = 'polymorph/no-raw-interactive'

/**
 * A note about the missing module, added only when it made a difference.
 *
 * A `<button>` can be left for two reasons: it holds something the rewrite
 * cannot carry, or there is nowhere to import `Button` from. Only the second
 * is the project's to change. So the code is fixed once more *with* the
 * module, and the note counts the buttons that would have been rewritten. If
 * there are none, there is no note.
 */
async function heldBack(
  project: string,
  path: string,
  code: string,
  options: { surface: Surface; filename: string; framework: Framework },
): Promise<string[]> {
  const vocabulary = FRAMEWORK_VOCABULARY[options.framework]
  const possible = await applyFixes(code, { ...options, vocabulary })
  const count = possible.fixed[RAW_CONTROL_RULE] ?? 0
  if (count === 0) return []

  const why =
    declares(project, path, vocabulary) === null
      ? 'the manifest of the package this file is in could not be read'
      : `${vocabulary} is not a dependency of the package this file is in`
  return [
    `${count} raw \`<button>\` could be rewritten as \`Button\` and ${count === 1 ? 'was' : 'were'} ` +
      `left reported: ${why}, so there is no module known to import \`Button\` from`,
  ]
}
