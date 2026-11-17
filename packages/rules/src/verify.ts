import { Linter, type Linter as LinterNS } from 'eslint'
import stylelint from 'stylelint'
import parser from '@typescript-eslint/parser'

import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import plugin, {
  allRules,
  ANGULAR_VOCABULARY_MODULE,
  angularSettings,
  solidSettings,
  SOLID_VOCABULARY_MODULE,
  vendorableRules,
  VOCABULARY_MODULE,
} from './index'
import owners from '../scoped-token-owners.json' with { type: 'json' }
import { RULE_CLIMB } from './ladder'
import { alternativesIn, type Alternative } from './rules/alternatives'
import { emittedTokens, tokenValues, type TokenValues } from './stylelint/emitted'
import stylelintPlugins, { applicationRules, RULE_NAMES } from './stylelint/index.js'

export type { Alternative }
export { alternativesIn }

/** The repo the emitted token set is built from. Verify always runs in-repo. */
const REPO_ROOT = resolve(import.meta.dirname, '../../..')

/**
 * Runs the red rules on a string.
 *
 * Everything that lints a fragment of source uses the one path through this
 * file: `fixtures.test.ts`, the rules' own acceptance test, and the MCP
 * server's `validate`, which outside agents call. The server promises that
 * "`validate` returns the same diagnostics as the local toolchain on identical
 * input". Sharing one code path makes that true by construction, not by two
 * implementations happening to agree.
 *
 * ## Why this is safe to expose
 *
 * It uses `Linter`, not `ESLint`, and `stylelint.lint({ code, config })`, not a
 * config file. That difference is why `validate` is safe to expose:
 *
 *  - `Linter.verify` only parses. It builds an AST, walks it, and reports. It
 *    does not resolve imports, does not load a config file, and never evaluates
 *    the source it receives.
 *  - `ESLint`, which this file intentionally does not use, finds
 *    `eslint.config.js` on disk and executes it, along with every plugin it
 *    names. Pointed at a directory someone else controls, that runs arbitrary
 *    code.
 *
 * Submitted code is therefore only ever parsed as text. The config is built
 * here, from rule records this repository owns.
 *
 * ## Fixing uses the same path
 *
 * `fix` runs the same rules with the same config and applies their fixes with
 * `Linter.verifyAndFix`, which is what `eslint --fix` runs. The same promise
 * holds: `fix` rewrites what the local toolchain would rewrite, and then
 * reports what the local toolchain would still report. The rules decide what
 * is fixable (`rules/fix.ts` gives the criterion), and no Stylelint rule is.
 *
 * ## Every diagnostic carries its answer
 *
 * A diagnostic holds the rule's own fix, when it has one, and the lawful
 * alternatives its message names, as data (`rules/alternatives.ts`). The
 * rules are given the theme's values here, so a raw colour or length is
 * reported with the nearest token by value (`stylelint/catalogue.js`).
 */

/** An edit, as ESLint's fixer makes it: replace `range` of the source with `text`. */
export interface DiagnosticFix {
  range: [number, number]
  text: string
}

export interface Diagnostic {
  rule: string
  message: string
  line: number
  column: number
  endLine: number | null
  endColumn: number | null
  /** The rule's own rewrite, when the violation has exactly one. `fix` applies it. */
  fix: DiagnosticFix | null
  /** The lawful alternatives the message names, with the rung each is on. */
  alternatives: Alternative[]
}

/** The answers in a message, structured, by the rule's rungs. */
function answersIn(rule: string, message: string): Alternative[] {
  return alternativesIn(message, RULE_CLIMB[rule] ?? [])
}

/**
 * The theme's values for the reports that name the nearest token, or
 * `undefined` where there is no theme to read: the rules then name the token
 * family instead of the step.
 */
function valuesFor(): TokenValues | undefined {
  try {
    return tokenValues(REPO_ROOT)
  } catch {
    return undefined
  }
}

/** `token-values-only`'s setting: the values when there is a theme to read them from. */
function valuesOption(): true | [true, { values: TokenValues }] {
  const values = valuesFor()
  return values === undefined ? true : [true, { values }]
}

/** Which part of the system the submitted code belongs to. */
export type Surface = 'application' | 'vocabulary'

/**
 * The path a fragment is linted as, when the caller does not give one.
 *
 * Several rules depend on location. `no-motion-outside-vocabulary` checks
 * whether the stylesheet is inside the vocabulary, and `vendorable-imports`
 * checks how far an import reaches from the file's path. A fragment linted
 * without a path would pass them. These are the two paths the repository's own
 * fixtures use, for the same reason.
 */
export const DEFAULT_PATHS: Record<Surface, { code: string; css: string }> = {
  application: { code: 'apps/app/src/Screen.tsx', css: 'apps/app/src/screen.css' },
  vocabulary: {
    code: 'packages/react-ui/src/controls/Component.tsx',
    css: 'packages/recipes/src/controls/component.module.css',
  },
}

export interface VerifyOptions {
  /** Defaults to `application`, the code an outside consumer writes. */
  surface?: Surface
  /** The path to lint the fragment as. See `DEFAULT_PATHS`. */
  filename?: string
  /** Overrides the rule set. Only tests that need a single rule pass it. */
  rules?: LinterNS.RulesRecord
  /**
   * The module members are imported from, which one fix needs: a raw `<button>`
   * rewritten as `Button` needs an import. Defaults to the package's own name,
   * or `@polymorph/solid-ui` for `framework: 'solid'`, and to `null` for
   * `framework: 'elements'`. `null` means a
   * repository that vendors its members and has no single module to import
   * from. The `<button>` is then reported and left unchanged.
   */
  vocabulary?: string | null
  /**
   * The web framework the fragment is written in. Default `react`. `solid`
   * reads every TSX file as Solid (the `settings` a Solid app's config sets)
   * and makes the default `vocabulary` `@polymorph/solid-ui`. `angular` reads
   * a `.ts` file as an Angular component, its inline template extracted and
   * read by the Angular template parser, as an Angular app's config does, and
   * makes the default path a `.ts` one. `vue` and `svelte` change nothing
   * here: a `.vue` or `.svelte` file is read by its own parser whatever this
   * says, so the filename decides. A `.html` file is an Angular template,
   * except in `elements`: an elements page is HTML, which the red rules do not
   * read, so a `.html` file there is a fatal result that says so. Any other
   * file in `elements` is read as React's would be, with no module to import a
   * rewritten `<button>` from, because an element is not imported by name.
   */
  framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'angular' | 'elements'
}

const sorted = (diagnostics: Diagnostic[]): Diagnostic[] =>
  [...diagnostics].sort(
    (a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule),
  )

/**
 * The rules for each surface.
 *
 * `allRules` is the application set: a screen may not express a style decision
 * or bypass the vocabulary. The vocabulary gets the packaging-boundary rule
 * instead. A component is where style decisions live, and `no-raw-styles` would
 * forbid it from doing its job.
 */
function rulesFor(surface: Surface, vocabulary: string | null): LinterNS.RulesRecord {
  if (surface !== 'application') return vendorableRules
  const values = valuesFor()
  return {
    ...allRules,
    'polymorph/scoped-token-owners': ['error', { owners }],
    // The reports that name the nearest token by value read the theme's values.
    'polymorph/no-raw-styles': values ? ['error', { values }] : 'error',
    'polymorph/no-app-css': values ? ['error', { values }] : 'error',
    // The rule reports the same either way. Only its ability to rewrite a
    // `<button>` depends on having a module to import `Button` from.
    'polymorph/no-raw-interactive': vocabulary === null ? 'error' : ['error', { vocabulary }],
  }
}

/** TypeScript, ESM, JSX: the same way this repository parses application code. */
const LANGUAGE_OPTIONS = {
  ecmaVersion: 2022,
  sourceType: 'module',
  parser,
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const

/**
 * An optional peer parser, required from here when a file needs it, or
 * `null` when it is not installed.
 */
function optionalParser(name: string): LinterNS.Parser | null {
  try {
    return createRequire(import.meta.url)(name) as LinterNS.Parser
  } catch {
    return null
  }
}

/**
 * The Vue parser, loaded when a `.vue` file is linted and not before.
 *
 * `vue-eslint-parser` reads a single-file component: its `<script setup>` with
 * the TSX parser, and its template as a second tree the rules walk. It is an
 * optional peer of this package, required lazily from here, so linting TSX
 * needs nothing Vue, and a Vue file linted where the parser is not installed is
 * a fatal result that says what to install.
 */
let vueParser: LinterNS.Parser | null | undefined

function vueParserOrNull(): LinterNS.Parser | null {
  if (vueParser === undefined) vueParser = optionalParser('vue-eslint-parser')
  return vueParser
}

/** Whether a path is a Vue single-file component, which the Vue parser reads. */
export function isVueFile(filename: string): boolean {
  return filename.endsWith('.vue')
}

/**
 * The Svelte parser, loaded when a `.svelte` file is linted and not before.
 *
 * `svelte-eslint-parser` reads a component whole: its scripts with the TSX
 * parser, and its markup as nodes of the same program, which the rules visit
 * directly. It is an optional peer, as the Vue parser is, so a `.svelte` file
 * linted where it is not installed is a fatal result that says what to
 * install.
 */
let svelteParser: LinterNS.Parser | null | undefined

function svelteParserOrNull(): LinterNS.Parser | null {
  if (svelteParser === undefined) svelteParser = optionalParser('svelte-eslint-parser')
  return svelteParser
}

/** Whether a path is a Svelte component, which the Svelte parser reads. */
export function isSvelteFile(filename: string): boolean {
  return filename.endsWith('.svelte')
}

/** What an Angular component is read with: the template parser, and the processor that extracts an inline template. */
interface AngularReaders {
  parser: LinterNS.Parser
  processor: LinterNS.Processor
}

/**
 * The Angular template parser and the processor of
 * `@angular-eslint/eslint-plugin-template`, loaded when an Angular component or
 * template is linted and not before. Both are optional peers, as the Vue and
 * Svelte parsers are, so an Angular file linted where they are not installed
 * is a fatal result that says what to install.
 */
let angularReaders: AngularReaders | null | undefined

function angularReadersOrNull(): AngularReaders | null {
  if (angularReaders !== undefined) return angularReaders
  const templateParser = optionalParser('@angular-eslint/template-parser')
  const templatePlugin = optionalParser('@angular-eslint/eslint-plugin-template') as {
    processors?: Record<string, LinterNS.Processor>
  } | null
  const processor = templatePlugin?.processors?.['extract-inline-html']
  angularReaders =
    templateParser === null || processor === undefined
      ? null
      : { parser: templateParser, processor }
  return angularReaders
}

/** Whether a path is an Angular template, which the Angular template parser reads. */
export function isAngularTemplateFile(filename: string): boolean {
  return filename.endsWith('.html')
}

/** The path a fragment is linted as: the surface's default, a `.ts` module for an Angular one. */
function filenameFor(options: VerifyOptions, surface: Surface): string {
  if (options.filename !== undefined) return options.filename
  const path = DEFAULT_PATHS[surface].code
  return options.framework === 'angular' ? path.replace(/\.tsx$/, '.ts') : path
}

export interface VerifyResult {
  diagnostics: Diagnostic[]
  /** A parse error, when the fragment is not valid TypeScript. */
  fatal: string | null
}

/** The single config used to lint a fragment, for both checking and fixing. */
function codeConfig(options: VerifyOptions): { config: LinterNS.Config[]; filename: string } {
  const surface = options.surface ?? 'application'
  const solid = options.framework === 'solid'
  const vocabulary =
    options.vocabulary === undefined
      ? solid
        ? SOLID_VOCABULARY_MODULE
        : options.framework === 'angular'
          ? ANGULAR_VOCABULARY_MODULE
          : options.framework === 'elements'
            ? null
            : VOCABULARY_MODULE
      : options.vocabulary
  const rules = options.rules ?? rulesFor(surface, vocabulary)
  const filename = filenameFor(options, surface)
  const vue = isVueFile(filename) ? vueParserOrNull() : null
  const svelte = isSvelteFile(filename) ? svelteParserOrNull() : null
  const angular =
    options.framework === 'angular' ||
    (isAngularTemplateFile(filename) && options.framework !== 'elements')
      ? angularReadersOrNull()
      : null
  return {
    filename,
    config: [
      {
        files: ['**/*.{ts,tsx}'],
        plugins: { polymorph: plugin },
        languageOptions: { ...LANGUAGE_OPTIONS },
        // A Solid app's config reads every TSX file as Solid.
        ...(solid ? { settings: solidSettings } : {}),
        // An Angular app's config reads every module as Angular and extracts
        // each component's inline template, which the block below reads.
        ...(angular === null ? {} : { settings: angularSettings, processor: angular.processor }),
        rules,
      },
      // An Angular template: a `templateUrl` file, or an inline template the
      // processor above extracted, through the Angular template parser.
      ...(angular === null
        ? []
        : [
            {
              files: ['**/*.html'],
              plugins: { polymorph: plugin },
              languageOptions: { parser: angular.parser },
              settings: angularSettings,
              rules,
            },
          ]),
      // A single-file component: the template through the Vue parser, the
      // script and the template's expressions through the TSX parser.
      ...(vue === null
        ? []
        : [
            {
              files: ['**/*.vue'],
              plugins: { polymorph: plugin },
              languageOptions: {
                ecmaVersion: LANGUAGE_OPTIONS.ecmaVersion,
                sourceType: LANGUAGE_OPTIONS.sourceType,
                parser: vue,
                parserOptions: { parser, extraFileExtensions: ['.vue'] },
              },
              rules,
            },
          ]),
      // A Svelte component: its markup through the Svelte parser, its scripts
      // and the markup's expressions through the TSX parser.
      ...(svelte === null
        ? []
        : [
            {
              files: ['**/*.svelte'],
              plugins: { polymorph: plugin },
              languageOptions: {
                ecmaVersion: LANGUAGE_OPTIONS.ecmaVersion,
                sourceType: LANGUAGE_OPTIONS.sourceType,
                parser: svelte,
                parserOptions: { parser, extraFileExtensions: ['.svelte'] },
              },
              rules,
            },
          ]),
    ] as LinterNS.Config[],
  }
}

function codeResult(messages: LinterNS.LintMessage[]): VerifyResult {
  // A parse error is a message with no `ruleId`, and it means something
  // different. None of the rules ran, so an empty diagnostic list would look
  // like "this is lawful" when it means "this is not TypeScript".
  const fatal = messages.find((message) => message.fatal)
  if (fatal) return { diagnostics: [], fatal: `${fatal.message} (line ${fatal.line})` }

  return {
    fatal: null,
    diagnostics: sorted(
      messages.map((message) => {
        const rule = message.ruleId ?? 'unknown'
        return {
          rule,
          message: message.message,
          line: message.line,
          column: message.column,
          endLine: message.endLine ?? null,
          endColumn: message.endColumn ?? null,
          fix: message.fix ? { range: message.fix.range, text: message.fix.text } : null,
          alternatives: answersIn(rule, message.message),
        }
      }),
    ),
  }
}

/** Why a Vue or Svelte file cannot be read here, or `null` when it can. */
function unreadableReason(filename: string): string | null {
  if (isVueFile(filename) && vueParserOrNull() === null) {
    return 'a .vue file is read by vue-eslint-parser, which is not installed here'
  }
  if (isSvelteFile(filename) && svelteParserOrNull() === null) {
    return 'a .svelte file is read by svelte-eslint-parser, which is not installed here'
  }
  return null
}

/**
 * Why an Angular fragment cannot be read here, or `null` when it can. Without
 * the template parser a component's template would go unread, and an empty
 * result would claim it lawful.
 */
function unreadableAngular(options: VerifyOptions, filename: string): string | null {
  if (options.framework !== 'angular' && !isAngularTemplateFile(filename)) return null
  return angularReadersOrNull() === null
    ? 'an Angular template is read by @angular-eslint/template-parser and the processor of ' +
        '@angular-eslint/eslint-plugin-template, which are not installed here'
    : null
}

/**
 * Why an elements page is not read: the red rules have no reader for HTML that
 * is not an Angular template, and an empty result would claim the page lawful.
 */
function unreadableElements(options: VerifyOptions, filename: string): string | null {
  return options.framework === 'elements' && isAngularTemplateFile(filename)
    ? 'an elements page is HTML, and the red rules do not read HTML pages'
    : null
}

export function verifyCode(source: string, options: VerifyOptions = {}): VerifyResult {
  const { config, filename } = codeConfig(options)
  const unreadable =
    unreadableElements(options, filename) ??
    unreadableReason(filename) ??
    unreadableAngular(options, filename)
  if (unreadable !== null) return { diagnostics: [], fatal: unreadable }
  return codeResult(new Linter().verify(source, config, { filename, filterCodeBlock }))
}

/**
 * Which blocks a processor extracts are linted: an Angular component's inline
 * templates, which its processor names `….component.html`. `Linter`'s own
 * default lints only `.js` blocks; the `ESLint` class lints a block a config
 * matches, which is the same set here.
 */
const filterCodeBlock = (name: string): boolean => name.endsWith('.html')

/**
 * The CSS rules for each surface.
 *
 * This mostly mirrors the ESLint side, for the same reason. The vocabulary must
 * follow the token law and never know its theme or its own name. Application
 * CSS must follow the motion containment law and may not re-make the theme's
 * decisions: declare a token, branch on the theme's attributes, select a
 * member by its identity attribute, or set the root's font size
 * (`applicationRules`). Applying both sets to both would forbid the vocabulary
 * its own transitions. The Stylelint config that `polymorph add` generates
 * makes the same split, with one override each.
 */
function cssRulesFor(surface: Surface): Record<string, unknown> {
  // Ghost detection runs on both surfaces. Application CSS (a harness
  // stylesheet here, or a consumer's own stylesheet after an install) can also
  // read a `--pm-*` token, and a misspelled one fails silently there as in a
  // recipe. A `var()` naming nothing invalidates the whole declaration, and
  // nothing reports it. The emitted set costs one pairing composition, cached
  // by the module.
  const ghosts = [RULE_NAMES.noGhostTokens] as const
  return surface === 'application'
    ? {
        ...applicationRules,
        [ghosts[0]]: [true, { tokens: emittedTokens(REPO_ROOT) }],
      }
    : {
        [RULE_NAMES.tokenValuesOnly]: valuesOption(),
        [RULE_NAMES.scopedTokenOwners]: [true, { owners }],
        [RULE_NAMES.noThemeSelectors]: true,
        [RULE_NAMES.noMemberSelectors]: true,
        [ghosts[0]]: [true, { tokens: emittedTokens(REPO_ROOT) }],
      }
}

export async function verifyCss(
  source: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const surface = options.surface ?? 'application'
  const filename = options.filename ?? DEFAULT_PATHS[surface].css

  const result = await stylelint.lint({
    code: source,
    codeFilename: filename,
    config: {
      plugins: stylelintPlugins,
      rules: (options.rules ?? cssRulesFor(surface)) as Record<string, unknown>,
    },
  })

  const [file] = result.results
  if (file?.parseErrors?.length) {
    const [first] = file.parseErrors
    return { diagnostics: [], fatal: `${first?.text ?? 'CSS parse error'} (line ${first?.line})` }
  }

  return {
    fatal: null,
    diagnostics: sorted(
      (file?.warnings ?? []).map((warning) => {
        const message = warning.text.replace(/\s*\(polymorph\/[a-z-]+\)$/, '')
        return {
          rule: warning.rule,
          message,
          line: warning.line,
          column: warning.column,
          endLine: warning.endLine ?? null,
          endColumn: warning.endColumn ?? null,
          // No Stylelint rule has a fix (`fixCss`).
          fix: null,
          alternatives: answersIn(warning.rule, message),
        }
      }),
    ),
  }
}

/** `.css` goes to Stylelint, everything else to ESLint. */
export function isStylesheet(filename: string): boolean {
  return filename.endsWith('.css')
}

export async function verify(source: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const surface = options.surface ?? 'application'
  const filename = filenameFor(options, surface)
  return isStylesheet(filename)
    ? verifyCss(source, { ...options, filename })
    : verifyCode(source, { ...options, filename })
}

/* -------------------------------------------------------------------------- */
/* Fixing                                                                     */
/* -------------------------------------------------------------------------- */

export interface FixResult extends VerifyResult {
  /** The source with every fix applied, or the unchanged source when there were none. */
  output: string
  /**
   * Rule -> how many of its reports the fixes resolved. What `diagnostics`
   * still lists had no fix, and each one needs a decision.
   */
  fixed: Record<string, number>
}

/** Reports per rule before, minus reports per rule after. */
function answered(before: Diagnostic[], after: Diagnostic[]): Record<string, number> {
  const count = (diagnostics: Diagnostic[]) => {
    const counts: Record<string, number> = {}
    for (const { rule } of diagnostics) counts[rule] = (counts[rule] ?? 0) + 1
    return counts
  }
  const [was, is] = [count(before), count(after)]
  return Object.fromEntries(
    Object.entries(was)
      .map(([rule, reports]) => [rule, reports - (is[rule] ?? 0)] as const)
      .filter(([, gone]) => gone > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

/**
 * Applies the red rules' fixes until none are left.
 *
 * `verifyAndFix` is the loop `eslint --fix` runs: lint, apply every fix that
 * does not overlap another, lint the result, and repeat. Two overlapping edits
 * can then both apply, one pass apart.
 *
 * A fragment that does not parse is returned unchanged, and so is one whose
 * fixes produce code that does not parse. A rewrite that breaks the file is a
 * bug in a rule, so this changes nothing and reports the error.
 */
export function fixCode(source: string, options: VerifyOptions = {}): FixResult {
  const before = verifyCode(source, options)
  if (before.fatal !== null) return { ...before, output: source, fixed: {} }

  const { config, filename } = codeConfig(options)
  const { output, messages } = new Linter().verifyAndFix(source, config, {
    filename,
    filterCodeBlock,
  })
  const after = codeResult(messages)

  if (after.fatal !== null) {
    return {
      ...before,
      output: source,
      fixed: {},
      fatal: `a fix produced code that does not parse, so nothing was changed: ${after.fatal}`,
    }
  }

  return { ...after, output, fixed: answered(before.diagnostics, after.diagnostics) }
}

/**
 * A stylesheet, which no rule rewrites.
 *
 * The CSS rules only report. A raw value could map to many tokens, and a
 * misspelled token's nearest match is a guess (`stylelint/index.js` explains why
 * that suggestion is not applied). This is `verifyCss` in `fix`'s result shape:
 * the unchanged stylesheet and what is wrong with it. A caller can then pass any
 * file the red rules read without first checking which linter it belongs to.
 */
export async function fixCss(source: string, options: VerifyOptions = {}): Promise<FixResult> {
  return { ...(await verifyCss(source, options)), output: source, fixed: {} }
}

/** `.css` goes to Stylelint and everything else to ESLint, as in `verify`. */
export async function fix(source: string, options: VerifyOptions = {}): Promise<FixResult> {
  const surface = options.surface ?? 'application'
  const filename = filenameFor(options, surface)
  return isStylesheet(filename)
    ? fixCss(source, { ...options, filename })
    : fixCode(source, { ...options, filename })
}
