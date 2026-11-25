import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  FrameworkMismatchError,
  planInstall,
  UnknownItemError,
  UnshippedMemberError,
  type InstallPlan,
} from '@polymorph/cli'
import {
  DEFAULT_PATHS,
  errorsOf,
  fix as applyFixes,
  verify,
  warningsOf,
  type Diagnostic,
  type Surface,
} from '@polymorph/rules/verify'
import {
  DEFAULT_FRAMEWORK,
  DEFAULT_PLATFORM,
  renderSystemCard,
  searchRegistry,
  type Framework,
  type Platform,
  type Registry,
  type RegistryComponent,
  type RegistrySystem,
} from '@polymorph/registry'
import { readNativePackage, validateSpec, type SpecFault } from '@polymorph/spec'

import { submittedDocument, type SubmittedSpec } from './submitted'

import { withClimb, type Rung, type Violation } from './violations'
import { codeFrameworkIn, installFrameworkOf, vocabularyFor } from './write'

/**
 * The tools as functions: the nine that read are here or re-exported here, and
 * the four that write are in `write.ts`.
 *
 * None of them is a method on a server. The MCP wiring in `server.ts` is a
 * transport binding (names, schemas and a stdio pipe). Everything an agent can
 * *learn* is here, in ordinary functions that take a registry and an argument
 * object. There are three reasons, most important first:
 *
 *  1. The architecture rule is one canonical registry and three thin fronts. A
 *     front whose knowledge lives in its protocol handlers will accumulate
 *     knowledge there, because there is nowhere else to put it.
 *  2. They are testable without a subprocess, a transport or a client.
 *  3. A hosted HTTP variant, if one is ever built, binds these same functions.
 *     Nothing about them depends on stdio.
 *
 * **Nothing here computes.** Every answer is a field of the registry, a
 * projection of one, or the contents of a file the registry named. The last
 * case needs care: `get_component` reads source from disk. It is not a second
 * source of truth, because the registry decided *which* file. The tool follows
 * a pointer it was given, just as `polymorph add` copies a list it was given.
 * `thin-front.test.ts` enforces this for the package.
 */

export interface ToolContext {
  registry: Registry
  /**
   * The checkout the vocabulary lives in, and what every tool reads. Written to
   * only when it is also the project.
   */
  root: string
  /**
   * The repository being worked on, and the only place a write tool writes.
   * When absent, the server is read-only and the write tools are not registered.
   */
  project?: string
  /**
   * The program that builds the page `render_screen` draws in (`render.ts`). The
   * entry point names it, as it names the two roots. When absent, that tool says
   * so and the others are unaffected.
   */
  screenBuilder?: string
}

/* -------------------------------------------------------------------------- */
/* emit_screen, install, save_theme, fix_file                                 */
/* -------------------------------------------------------------------------- */

/**
 * The write tools are in their own module because they are the only tools that
 * write to a filesystem. `thin-front.test.ts` requires every write this package
 * makes to happen in that one file. They are re-exported here so the server
 * imports every tool from one place.
 */
export {
  DEFAULT_THEME_DIR,
  emitScreen,
  EscapingDirError,
  fixFile,
  install,
  RefusedWriteError,
  saveTheme,
  UnfinishedInstallError,
} from './write'
export type {
  EmitScreenAnswer,
  EmitScreenArgs,
  FixFileAnswer,
  FixFileArgs,
  InstallAnswer,
  InstallArgs,
  SaveThemeAnswer,
  SaveThemeArgs,
} from './write'

/* -------------------------------------------------------------------------- */
/* propose_theme                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `propose_theme` is in its own module because it is the one tool with a
 * *table*: the intent vocabulary, and what each word changes. It is
 * re-exported here so the server imports every tool from one place.
 *
 * It is also the one tool that runs the theme engine. That is not a front
 * computing what the registry already knows. The registry publishes the
 * systems and palettes that *exist*, and a proposal is a pair that does not.
 * Only the laws can say whether a new pair is lawful, so the tool runs them
 * instead of guessing. That verdict is what makes the answer useful.
 */
export { IGNORED, PROJECTIONS, proposeTheme, vocabulary } from './propose'
export type { Move, Projection, ProposeAnswer, ProposeArgs, RationaleEntry } from './propose'
export type { SubmittedSpec } from './submitted'

/* -------------------------------------------------------------------------- */
/* render_screen                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `render_screen` is in its own module because it is the one tool that runs a
 * browser. The browser is an optional dependency, loaded there when the tool
 * is called, so no other tool depends on it being installed. It is re-exported
 * here so the server imports every tool from one place.
 */
export { browserAdvice, renderScreen, ScreenUnavailableError, VIEWPORTS } from './render'
export type {
  InputFill,
  LayoutFault,
  RenderedScreen,
  RenderScreenAnswer,
  RenderScreenArgs,
  ScreenState,
  ScreenStateName,
  ScreenView,
  Viewport,
} from './render'

/* -------------------------------------------------------------------------- */
/* search_components                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The platforms the registry maps the vocabulary to, for the argument schemas
 * of the tools that take one. Re-exported from the registry, so the server
 * names no platform of its own.
 */
export { FRAMEWORKS, PLATFORMS } from '@polymorph/registry'
export type { Framework, Platform }

export interface SearchArgs {
  query?: string
  tier?: string
  origin?: 'installed' | 'vendored'
  /** Leaves out the members absent on this platform. `web` when omitted. */
  platform?: Platform
  /** Leaves out the members this web framework's vocabulary does not ship. `react` when omitted. */
  framework?: Framework
  limit?: number
}

export interface SearchHit {
  name: string
  tier: string
  origin: string
  purpose: string
  /** Why this matched, so a wrong hit is recognisably wrong. */
  matched: string
}

const DEFAULT_LIMIT = 20

/**
 * Discovery. An agent uses this tool first, so it decides whether the agent
 * finds the right component or invents one.
 *
 * Results are ranked, and the ranking is the core of the design. A name match
 * beats a purpose match, which beats a prop match, because "combobox" should
 * return Combobox and not the four components that mention one in a sentence.
 * Every hit says which kind of match it was, so an agent reading a list of
 * near misses can tell a real answer from a coincidence.
 *
 * An empty query lists the catalogue. That is a real use: "what is in this
 * system" comes before "what does this system call a dropdown", and a search
 * tool that required a term would make an agent guess one.
 *
 * The platform defaults to the web, where every member exists. An agent
 * building for a phone platform passes it, so a member with no rendering there
 * is never offered.
 */
export function searchComponents(context: ToolContext, args: SearchArgs = {}): SearchHit[] {
  // The ranking itself is in the registry, so the workbench's Components page
  // and this tool give the same answer to the same query. Neither front
  // computes what the registry does not know.
  return searchRegistry(context.registry, {
    query: args.query,
    tier: args.tier,
    origin: args.origin,
    platform: args.platform ?? DEFAULT_PLATFORM,
    framework: args.framework ?? DEFAULT_FRAMEWORK,
    limit: args.limit ?? DEFAULT_LIMIT,
  })
}

/* -------------------------------------------------------------------------- */
/* get_component                                                              */
/* -------------------------------------------------------------------------- */

export interface ComponentArgs {
  name: string
  /** The actual files. Off by default: a full closure is a lot of context. */
  source?: boolean
}

export interface ComponentAnswer {
  component: RegistryComponent
  files?: { path: string; contents: string }[]
}

export class UnknownComponentError extends Error {
  constructor(
    readonly asked: string,
    readonly suggestions: string[],
  ) {
    super(
      suggestions.length === 0
        ? `polymorph: no component called "${asked}"`
        : `polymorph: no component called "${asked}" — did you mean ${suggestions.join(', ')}?`,
    )
    this.name = 'UnknownComponentError'
  }
}

const fold = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * One component: its prop surface, its lawful cells, its states, and, when
 * asked, the source those descriptions came from.
 *
 * `source` is off by default to save context, not for safety. Dialog's own
 * three files are a few hundred lines, but its *closure* is fourteen files. An
 * agent that asked for a component and got fourteen files has spent its context
 * budget. So the default answer is the description, and the files need a
 * second, explicit request.
 *
 * A wrong name gets suggestions, not an empty result. An agent that asked for
 * `Modal` and received `[]` will conclude the system has no modal and build
 * one. The same agent told "did you mean Dialog" will not.
 */
export function getComponent(context: ToolContext, args: ComponentArgs): ComponentAnswer {
  const wanted = fold(args.name)
  const component = context.registry.components.find((entry) => fold(entry.name) === wanted)

  if (!component) throw new UnknownComponentError(args.name, suggestionsFor(context, wanted))

  if (!args.source) return { component }
  return { component, files: sourceOf(context, component) }
}

/**
 * What to suggest when the name is wrong. A name is wrong in two ways.
 *
 * **A near miss**: `Dialogue`, `Combo`, `Datepicker`. A prefix or substring
 * comparison catches these and search does not, because the invented word
 * does not appear in any purpose.
 *
 * **The industry word**: `Modal` for Dialog. No edit distance connects these,
 * but search does: Dialog's purpose starts "Modal interruption", so the
 * catalogue answers with the component it has.
 *
 * So both run, search first. An empty result is the outcome to avoid. An agent
 * told the system has no modal will build one, which is the invisible
 * deviation the system exists to prevent.
 */
function suggestionsFor(context: ToolContext, wanted: string): string[] {
  const byPurpose = searchComponents(context, { query: wanted, limit: 3 }).map((hit) => hit.name)

  const byName = context.registry.components
    .map((entry) => entry.name)
    .filter((name) => fold(name).includes(wanted) || wanted.includes(fold(name).slice(0, PREFIX)))

  return [...new Set([...byPurpose, ...byName])].slice(0, 3).map((name) => `"${name}"`)
}

/** Long enough that `Tab` does not match `Table`, short enough to catch a suffix. */
const PREFIX = 4

/**
 * The three files that make up this component, not its closure. The closure is
 * `get_install_plan`'s answer. Mixing the two would turn "show me Button" into
 * seven files of layout primitives.
 */
function sourceOf(
  context: ToolContext,
  component: RegistryComponent,
): { path: string; contents: string }[] {
  return [component.files.source, component.files.styles, component.files.states]
    .filter((path): path is string => path !== null)
    .filter((path) => existsSync(resolve(context.root, path)))
    .map((path) => ({ path, contents: readFileSync(resolve(context.root, path), 'utf8') }))
}

/* -------------------------------------------------------------------------- */
/* get_install_plan                                                           */
/* -------------------------------------------------------------------------- */

export interface InstallPlanArgs {
  items: string[]
  dir?: string
  /**
   * The web framework whose members are vendored. Omitted, it is the one the
   * project's install manifest records, or `react`; one that differs from the
   * manifest's is refused, as `polymorph add` refuses it.
   */
  framework?: Framework
}

/**
 * What `polymorph add` would do, without doing it.
 *
 * This is the CLI's own resolver. `planInstall` is a pure function of the
 * registry and a list of names, so a protocol can expose it directly. The MCP
 * server has no separate idea of what an install is. If it had one, the two
 * would eventually disagree, and the agent would be the one to hit the
 * difference.
 *
 * The answer also describes the command: an agent that gets a plan knows what
 * `install`, or a person running `polymorph add …`, will do before it runs.
 */
export function getInstallPlan(context: ToolContext, args: InstallPlanArgs): InstallPlan {
  const framework = installFrameworkOf(context, args.framework)
  return planInstall(context.registry, args.items, {
    ...(args.dir ? { dir: args.dir } : {}),
    ...(framework === 'react' ? {} : { framework }),
  })
}

export { FrameworkMismatchError, UnknownItemError, UnshippedMemberError }

/* -------------------------------------------------------------------------- */
/* get_system_card                                                            */
/* -------------------------------------------------------------------------- */

export interface SystemCardArgs {
  /** The platform the vocabulary section is rendered for. `web` when omitted. */
  platform?: Platform
  /**
   * The web framework the card is written for. For `vue`, `svelte`, `solid`,
   * `angular` or `elements` it names that framework's packages and how a prop
   * reads there, and leaves out members with no shell in it. `react` when
   * omitted.
   */
  framework?: Framework
}

/**
 * The whole vocabulary compressed for a context window: a few thousand tokens,
 * kept under the character budget in `packages/registry/src/card.test.ts`.
 *
 * For a platform other than the web, the vocabulary section leaves out the
 * members absent there and says how each adapted one renders. The card is the
 * registry's own rendering either way (`renderSystemCard`).
 */
export function getSystemCard(context: ToolContext, args: SystemCardArgs = {}): string {
  return renderSystemCard(context.registry, {
    platform: args.platform ?? DEFAULT_PLATFORM,
    framework: args.framework ?? DEFAULT_FRAMEWORK,
  })
}

/* -------------------------------------------------------------------------- */
/* get_theme_axes                                                             */
/* -------------------------------------------------------------------------- */

export interface ThemeArgs {
  /** Every `--pm-*` property a theme emits. Off by default, because they are most of the answer's size. */
  customProperties?: boolean
  /**
   * Each system's `tokenValues`: what every colour, space, radius, type-size,
   * size and duration token is worth with its default palette. Off by default,
   * because together they are larger than the rest of the answer.
   */
  tokenValues?: boolean
}

/** A system as the answer gives it: its `tokenValues` only when they were asked for. */
export type ThemeSystem = Omit<RegistrySystem, 'tokenValues'> & {
  tokenValues?: RegistrySystem['tokenValues']
}

export type ThemeAnswer = Omit<Registry['theme'], 'customProperties' | 'prepaint' | 'systems'> & {
  systems: ThemeSystem[]
  customProperties?: string[]
}

/**
 * The parameter space: the axes, the systems that assign them, the palettes
 * that colour them, the token scales and the colour roles.
 *
 * Systems and palettes are listed separately, not combined. Agents often ask
 * "what can I change?", so the answer states that the two lists combine
 * freely: a theme is one system paired with one palette, and every palette is
 * lawful on every system. A catalogue of every pairing would publish a
 * cross-product instead of the two decisions it is made of.
 *
 * The custom properties are behind a flag for the same reason `get_component`
 * hides source. They are the longest list in the registry, and an agent
 * writing a *screen* never needs them. They matter to whoever writes a recipe,
 * which is a different job on the other side of the boundary. Each system's
 * token values are behind a flag for the same reason. They are what a lint
 * config compares raw values with, and `polymorph init` writes them there.
 *
 * The pre-paint script is not included. It is an install detail, it is in the
 * install plan, and a theme question should not be answered with a `<script>`.
 */
export function getThemeAxes(context: ToolContext, args: ThemeArgs = {}): ThemeAnswer {
  const { customProperties, prepaint: _prepaint, systems, ...rest } = context.registry.theme
  const answer: ThemeAnswer = {
    ...rest,
    systems: args.tokenValues
      ? systems
      : systems.map(({ tokenValues: _tokenValues, ...system }) => system),
  }
  return args.customProperties ? { ...answer, customProperties } : answer
}

/* -------------------------------------------------------------------------- */
/* validate                                                                   */
/* -------------------------------------------------------------------------- */

export interface ValidateArgs {
  /** TSX or CSS. Omitted when a `spec` is submitted instead. */
  code?: string
  /**
   * A screen spec: the document, or its JSON text. The tool checks submitted
   * code **or** a spec. A spec is checked against `@polymorph/spec`'s format.
   */
  spec?: SubmittedSpec
  /**
   * The path to lint the code as. Several rules depend on location, so a
   * fragment linted without a path would escape them. A `.css` name also routes
   * to Stylelint instead of ESLint.
   */
  filename?: string
  surface?: Surface
  /**
   * The web framework. A spec is checked against that framework's vocabulary.
   * For `vue`, code with no `filename` that is markup with no block is linted
   * as a component's template. For `svelte`, code with no `filename` that
   * opens with markup is linted as a component, which needs no block. For
   * `solid`, TSX is linted as Solid's (`class`, its handlers, the Solid
   * fixes). For `angular`, TypeScript with no `filename` is linted as a
   * component module, its inline template included, and markup as a
   * component's template. For `elements`, markup with no `filename` is a page,
   * which the red rules do not read, and the answer's `fatal` says so.
   * Otherwise TypeScript and CSS are linted as they are for React. Omitted, it is the project's, as for `fix`
   * (`codeFrameworkOf`): Solid in a project whose package uses
   * `@polymorph/solid-ui` and not `@polymorph/react-ui`, and React otherwise.
   * A spec for `ios` or `android` is checked with no web framework.
   */
  framework?: Framework
}

export type { Rung, Violation }

export interface ValidateAnswer {
  ok: boolean
  /** Which question was asked. A spec is checked against the registry, not linted. */
  kind: 'code' | 'spec'
  surface?: Surface
  filename?: string
  violations?: Violation[]
  /**
   * Reports of rules the groups report as warnings (the usage rules,
   * `docs/rules.md`). They do not make `ok` false.
   */
  warnings?: Violation[]
  /** Spec faults, each with the path in the document that produced it. */
  faults?: SpecFault[]
  /** Set when the submission could not be parsed, in which case nothing ran. */
  fatal: string | null
}

/**
 * Lints submitted code and returns red-rule violations with the rung to climb.
 *
 * Two properties make this worth exposing.
 *
 * **It gives the same answer as the local toolchain.** Not an equivalent
 * answer, the same one, because `@polymorph/rules/verify` is the one path both
 * use, and the repository's own fixture suite calls it too. An agent that
 * fixes what this reports has fixed what CI will report.
 *
 * **It never runs what it is given.** `verify` uses ESLint's `Linter`, which
 * parses and walks an AST, not the `ESLint` class, which discovers and
 * *executes* a config file. Submitted code is only parsed as text, which makes
 * an open `validate` endpoint safe to offer.
 *
 * The rung turns a refusal into an instruction. A rule that only says no gets
 * worked around, with `eslint-disable`, a wrapper div or a copy of the
 * component. Each of those is an invisible deviation, which the system exists
 * to prevent. So every violation carries the ladder entries that answer it, in
 * order, from the registry.
 */
export async function validate(context: ToolContext, args: ValidateArgs): Promise<ValidateAnswer> {
  if (args.spec !== undefined) return validateSubmittedSpec(context, args.spec, args.framework)

  const code = args.code
  if (code === undefined) {
    return { ok: false, kind: 'code', fatal: 'submit either `code` or `spec`' }
  }

  const { surface, filename, framework, vocabulary, wrapped, source } = readingOf(context, {
    ...args,
    code,
  })
  const result = await verify(source, { surface, filename, framework, vocabulary })
  const reports = withClimb(
    context.registry,
    wrapped ? result.diagnostics.map(unwrapped) : result.diagnostics,
  )
  const violations = errorsOf(reports)

  return {
    ok: result.fatal === null && violations.length === 0,
    kind: 'code',
    surface,
    filename,
    violations,
    warnings: warningsOf(reports),
    fatal: result.fatal,
  }
}

/**
 * A screen spec, checked against the registry.
 *
 * This is a different question from linting, answered differently, so the
 * result says which one it was. Code is judged by rules that read an AST. A
 * spec is judged by whether the components exist, the props exist, the
 * variant × tone cell is in the grid, and a declared exception sits at its
 * real rung. Both return "what is wrong and where", which is the part an agent
 * needs to be the same.
 *
 * In the agent loop, the registry tells an agent what the system is, and
 * `validate` on code checks what it has already written. A spec gives the
 * agent something to *produce* that the system can judge before any code
 * exists. A spec for `ios` or `android` is checked against that platform's
 * member package too, so a member it does not draw yet is a fault here, not
 * a surprise at `emit_screen`.
 */
async function validateSubmittedSpec(
  context: ToolContext,
  submitted: SubmittedSpec,
  asked: Framework | undefined,
): Promise<ValidateAnswer> {
  const read = submittedDocument(submitted)
  if ('fatal' in read) return { ok: false, kind: 'spec', fatal: read.fatal }
  const { document } = read

  const platform = (document as { platform?: unknown } | null)?.platform
  const native =
    platform === 'ios' || platform === 'android'
      ? readNativePackage(context.root, platform)
      : undefined
  // A web spec is checked in the framework `emit_screen` writes TSX in for
  // this project. A native spec is checked in no web framework, and the check
  // refuses one the caller names other than React.
  const framework = native === undefined ? codeFrameworkIn(context, asked) : asked
  const result = validateSpec(context.registry, document, {
    ...(framework === undefined ? {} : { framework }),
    ...(native === undefined ? {} : { native }),
  })
  return { ok: result.ok, kind: 'spec', faults: result.faults, fatal: null }
}

/**
 * How `validate` and `fix` read submitted code: the surface, the framework,
 * the path it is linted as, the module a rewritten `<button>` imports from,
 * and the source the rules are given. One function, so the two tools read one
 * fragment the same way.
 *
 * Without `framework`, the project answers (`codeFrameworkOf`), as it does for
 * `fix_file` and `emit_screen`. A fragment has no package to say where its
 * members come from, so the module is the framework's vocabulary unless the
 * project is recorded as vendoring (`vocabularyFor`). A template fragment for
 * Vue, given without a filename, is linted inside a `<template>` block, and
 * its reports keep the lines it was given.
 */
function readingOf(
  context: ToolContext,
  args: { code: string; filename?: string; surface?: Surface; framework?: Framework },
) {
  const surface = args.surface ?? 'application'
  const framework = codeFrameworkIn(context, args.framework)
  const filename = args.filename ?? defaultPath(surface, args.code, framework)
  const wrapped = args.filename === undefined && isTemplateFragment(args.code, framework)
  return {
    surface,
    filename,
    framework,
    vocabulary: vocabularyFor(context, framework),
    wrapped,
    source: wrapped ? `${TEMPLATE_OPEN}${args.code}${TEMPLATE_CLOSE}` : args.code,
  }
}

/**
 * `{` on a line that is not a statement: a selector opening a block.
 *
 * Deliberately narrow. It only has to separate CSS from TSX well enough to pick
 * a default. A caller who cares passes `filename`, and a caller who does not
 * gets an answer that says which one it assumed.
 */
const LOOKS_LIKE_CSS = /^\s*[.#@:*[a-zA-Z][^\n{;()=]*\{/m

/**
 * A filename, when the caller gave none.
 *
 * Guessed from the source instead of defaulting to `.tsx`, because passing CSS
 * to a TypeScript parser produces a parse error when a correct answer was
 * possible. The paths come from `@polymorph/rules`, which decides the rules'
 * notion that "application code lives under `apps/`".
 */
function defaultPath(surface: Surface, code: string, framework?: Framework): string {
  const paths = DEFAULT_PATHS[surface]
  // An Angular component is a TypeScript module, and its template markup.
  if (framework === 'angular' && !looksLikeCss(code)) {
    return paths.code.replace(/\.tsx$/, LOOKS_LIKE_MARKUP.test(code) ? '.html' : '.ts')
  }
  // An elements page is HTML, which the verifier names as unread.
  if (framework === 'elements' && LOOKS_LIKE_MARKUP.test(code)) {
    return paths.code.replace(/\.tsx$/, '.html')
  }
  // A Svelte component is markup at its top level, its scripts included.
  if (framework === 'svelte' && LOOKS_LIKE_MARKUP.test(code)) {
    return paths.code.replace(/\.tsx$/, '.svelte')
  }
  // `.vue` only for code a Vue parser reads as a component: TypeScript or CSS
  // in a `.vue` file has no block, so nothing would be linted and every rule
  // would pass it.
  if (LOOKS_LIKE_VUE.test(code) || isTemplateFragment(code, framework)) {
    return paths.code.replace(/\.tsx$/, '.vue')
  }
  return looksLikeCss(code) ? paths.css : paths.code
}

/** CSS and nothing else: a selector opening a block, with no import, arrow or closing tag. */
const looksLikeCss = (code: string): boolean =>
  LOOKS_LIKE_CSS.test(code) && !/\bimport\b|=>|<\//.test(code)

/** A single-file component: it opens with a `<template>` or `<script>` block. */
const LOOKS_LIKE_VUE = /^\s*(<!--[\s\S]*?-->\s*)*<(template|script)\b/

/** Code that opens with a tag or a comment, after any leading comments. */
const LOOKS_LIKE_MARKUP = /^\s*(<!--[\s\S]*?-->\s*)*</

/**
 * Markup with no block, submitted for Vue: a template fragment such as
 * `<Button class="wide" />`. It is linted inside a `<template>` block.
 */
function isTemplateFragment(code: string, framework?: Framework): boolean {
  return framework === 'vue' && !LOOKS_LIKE_VUE.test(code) && /^\s*</.test(code)
}

/**
 * The block a template fragment is linted in. The opening tag shares the
 * fragment's first line, so every report keeps its line.
 */
const TEMPLATE_OPEN = '<template>'
const TEMPLATE_CLOSE = '\n</template>\n'

/** A report on a wrapped fragment, placed in the fragment as it was given. */
function unwrapped(diagnostic: Diagnostic): Diagnostic {
  const width = TEMPLATE_OPEN.length
  const back = (line: number | null, column: number | null) =>
    line === 1 && column !== null ? Math.max(1, column - width) : column
  const at = (offset: number) => Math.max(0, offset - width)
  return {
    ...diagnostic,
    column: back(diagnostic.line, diagnostic.column) ?? diagnostic.column,
    endColumn: back(diagnostic.endLine, diagnostic.endColumn),
    fix:
      diagnostic.fix === null
        ? null
        : { ...diagnostic.fix, range: [at(diagnostic.fix.range[0]), at(diagnostic.fix.range[1])] },
  }
}

/* -------------------------------------------------------------------------- */
/* fix                                                                        */
/* -------------------------------------------------------------------------- */

export interface FixArgs {
  /**
   * TSX, a Vue or Svelte single-file component, an Angular component module
   * or template, or CSS. A fragment is fine.
   */
  code: string
  /** The path to lint the code as, as for `validate`. A `.css` name routes to Stylelint. */
  filename?: string
  surface?: Surface
  /**
   * The web framework, read as `validate` reads it. Omitted, it is Solid in a
   * project whose package uses `@polymorph/solid-ui` and not
   * `@polymorph/react-ui`, so a rewritten `<button>` imports from there, and
   * React otherwise, for both tools.
   */
  framework?: Framework
}

export interface FixAnswer {
  /** Whether anything is left to report once the fixes are applied. */
  ok: boolean
  /** Whether any fix was applied. */
  changed: boolean
  /** The code with every fix applied, or the code as submitted when none was. */
  code: string
  /** Rule -> how many of its reports the fixes answered. */
  fixed: Record<string, number>
  surface: Surface
  filename: string
  /** What no fix could answer: these are decisions, each with its rungs. */
  violations: Violation[]
  /** Reports of rules the groups report as warnings, which do not make `ok` false. */
  warnings: Violation[]
  /** Set when the submission could not be parsed, in which case nothing changed. */
  fatal: string | null
}

/**
 * `validate`, with the mechanical part of the answer applied.
 *
 * Some violations have exactly one lawful rewrite: a `className` on a member
 * that ignores it, a glyph import the role map already names, a `<button>`
 * whose whole content is its label. An agent told about those fixes them by
 * hand, one lookup at a time, and can get the lookup wrong. This tool applies
 * them instead, using the rules' own fixes through the same
 * `@polymorph/rules/verify` path `validate` reports through. The result is what
 * `eslint --fix` writes in a config that has the `<button>` fix turned on.
 *
 * It leaves the other kind of violation, where the lawful answer is a choice:
 * which variant, which layout primitive, whether this is a zone. Those come
 * back as `validate` reports them, with the rungs. The rules decide the split,
 * not this tool: `packages/rules/src/rules/fix.ts` states the criterion.
 *
 * The code is read in the framework `validate` reads it in, so a Vue
 * template fragment is fixed inside a `<template>` block and returned without
 * it, and an Angular module's inline template is read with `framework:
 * "angular"`.
 *
 * It writes nothing. `fix_file` applies the same fix to a file in the project.
 */
export async function fix(context: ToolContext, args: FixArgs): Promise<FixAnswer> {
  const { surface, filename, framework, vocabulary, wrapped, source } = readingOf(context, args)

  const result = await applyFixes(source, { surface, filename, framework, vocabulary })
  const code = wrapped ? unwrappedCode(result.output, args.code) : result.output
  const reports = withClimb(
    context.registry,
    wrapped ? result.diagnostics.map(unwrapped) : result.diagnostics,
  )
  const violations = errorsOf(reports)

  return {
    ok: result.fatal === null && violations.length === 0,
    changed: code !== args.code,
    code,
    fixed: result.fixed,
    surface,
    filename,
    violations,
    warnings: warningsOf(reports),
    fatal: result.fatal,
  }
}

/**
 * A fixed template fragment without the block it was fixed in. A fix changes
 * only what is inside the block, so the block's tags are where they were put;
 * if they are not, the fragment is returned as it was submitted.
 */
function unwrappedCode(output: string, submitted: string): string {
  if (!output.startsWith(TEMPLATE_OPEN) || !output.endsWith(TEMPLATE_CLOSE)) return submitted
  return output.slice(TEMPLATE_OPEN.length, output.length - TEMPLATE_CLOSE.length)
}
