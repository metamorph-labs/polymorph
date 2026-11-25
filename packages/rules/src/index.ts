import parser from '@typescript-eslint/parser'
import type { Linter, Rule } from 'eslint'

import pkg from '../package.json' with { type: 'json' }
import owners from '../scoped-token-owners.json' with { type: 'json' }
import { noAppCss } from './rules/no-app-css'
import { noExternalDataviz } from './rules/no-external-dataviz'
import { noExternalIcons } from './rules/no-external-icons'
import { noExternalMotion } from './rules/no-external-motion'
import { noRawInteractive } from './rules/no-raw-interactive'
import { dangerLast } from './rules/danger-last'
import { noRawStyles } from './rules/no-raw-styles'
import { oneMainButton } from './rules/one-main-button'
import { oneOpener } from './rules/one-opener'
import { scopedTokenOwners } from './rules/scoped-token-owners'
import { trailingIcon } from './rules/trailing-icon'
import { vendorableImports } from './rules/vendorable-imports'

/**
 * `@polymorph/rules`: the red rules (`docs/rules.md`).
 *
 * Every rule is mechanical, with no judgement calls. The application rules come
 * in two stages, split by what must exist before a rule can be followed:
 *
 *   stage 1 — rules that can apply from the first line of application code.
 *             No raw styles and no app CSS need nothing from the vocabulary.
 *   stage 2 — rules that need the vocabulary and the exception ladder in
 *             place. Forbidding `<button>` only makes sense once `<Button>`
 *             exists, and a one-off needs the `<Bespoke>` escape hatch.
 *
 * File scopes come from configuration, never from hardcoded paths. "App code"
 * is whatever the consuming flat config applies the rules to.
 */

export const PLUGIN_NAME = 'polymorph'

export const rules = {
  'no-raw-styles': noRawStyles,
  'no-app-css': noAppCss,
  'no-raw-interactive': noRawInteractive,
  'no-external-motion': noExternalMotion,
  'no-external-icons': noExternalIcons,
  'no-external-dataviz': noExternalDataviz,
  'scoped-token-owners': scopedTokenOwners,
  'one-opener': oneOpener,
  'one-main-button': oneMainButton,
  'danger-last': dangerLast,
  'trailing-icon': trailingIcon,
  'vendorable-imports': vendorableImports,
} satisfies Record<string, Rule.RuleModule>

export type PolymorphRuleName = keyof typeof rules

export interface PolymorphPlugin {
  meta: { name: string; version: string }
  rules: typeof rules
}

export const plugin: PolymorphPlugin = {
  meta: { name: pkg.name, version: pkg.version },
  rules,
}

/**
 * Namespace prefix -> globs of the files that own it.
 *
 * The globs point at AppShell, the archetypes and the chart frame. If an owner
 * moves and this map is not updated, the rule stops working and a stray
 * `--pm-shell-*` reference goes unreported. A move must update
 * `scoped-token-owners.json` in the same change, and `repo-laws.test.ts` checks
 * that every path still exists.
 */
export const SCOPED_TOKEN_OWNERS: Record<string, string[]> = owners

const q = (name: PolymorphRuleName) => `${PLUGIN_NAME}/${name}` as const

/**
 * The module application code imports members from when it installs the
 * package. The spec emitter uses the same value (`packages/spec/src/emit.ts`).
 *
 * `fixableRawControls` passes it to `no-raw-interactive`. It is intentionally
 * not in the rule groups. The groups are also used by repositories that vendor
 * their members and import them by path, and a fix that imported `Button` from a
 * package they do not have would break the file it fixed. A config therefore
 * opts in to the fix only when it knows where its members live.
 */
export const VOCABULARY_MODULE = '@polymorph/react-ui'

/**
 * The module a Vue app imports members from. `no-raw-styles` governs its
 * imports as it governs `VOCABULARY_MODULE`'s, and the spec emitter writes it
 * for a Vue screen. No fix imports from it: the fixes write TSX.
 */
export const VUE_VOCABULARY_MODULE = '@polymorph/vue-ui'

/**
 * The module a Svelte app imports members from. `no-raw-styles` governs its
 * imports, and no fix imports from it: nothing in a `.svelte` file is
 * rewritten except a `class` or `style` removed from a member.
 */
export const SVELTE_VOCABULARY_MODULE = '@polymorph/svelte-ui'

/**
 * The module a Solid app imports members from. `no-raw-styles` governs its
 * imports, and `fixableSolidControls` passes it to `no-raw-interactive`, whose
 * fixes write Solid TSX as they write React TSX.
 */
export const SOLID_VOCABULARY_MODULE = '@polymorph/solid-ui'

/**
 * The module an Angular app imports members from. No rule reads its imports:
 * an Angular template names a member by its selector (`<pm-button>`), which
 * the component's `imports` resolves, so the rules know a member there by
 * the selector (`rules/angular.ts`). No fix imports from it either.
 */
export const ANGULAR_VOCABULARY_MODULE = '@polymorph/angular-ui'

/**
 * The settings that make every TypeScript file a config applies to read as
 * Angular (`isAngularFile` in `rules/angular.ts`): a report writes its answer
 * in template syntax (`<pm-inline [gap]="4">`), and a component's `styles`,
 * `styleUrl` and `animations` are read. A file that imports `@angular/core`
 * (or another `@angular/` package, `@polymorph/angular` or
 * `@polymorph/angular-ui`) reads as Angular without them, and a template the
 * Angular template parser read always does.
 */
export const angularSettings = { polymorph: { framework: 'angular' } } as const

/**
 * `no-raw-interactive` with its fix switched on. Spread it after the rule groups
 * in a config whose application code imports members from `@polymorph/react-ui`.
 */
export const fixableRawControls: Linter.RulesRecord = {
  [q('no-raw-interactive')]: ['error', { vocabulary: VOCABULARY_MODULE }],
}

/**
 * The settings that make every TSX file a config applies to read as Solid
 * (`isSolidFile` in `rules/jsx.ts`): `class`, `onclick` and `on:click` mean
 * what Solid makes them mean, and the icon fix imports from `@polymorph/solid`.
 * A file that imports `solid-js` reads as Solid without them.
 */
export const solidSettings = { polymorph: { framework: 'solid' } } as const

/**
 * `no-raw-interactive` with its fix switched on for a Solid app. Spread it
 * after the rule groups in a config whose application code imports members
 * from `@polymorph/solid-ui`, beside `settings: solidSettings`.
 */
export const fixableSolidControls: Linter.RulesRecord = {
  [q('no-raw-interactive')]: ['error', { vocabulary: SOLID_VOCABULARY_MODULE }],
}

/**
 * Rules that apply to application code from its first line. Apply them to app
 * globs. The Stylelint rules cover the vocabulary.
 */
export const stageOneRules: Linter.RulesRecord = {
  [q('no-raw-styles')]: 'error',
  [q('no-app-css')]: 'error',
}

/** The usage rules, each at a severity. */
const usageRules = (severity: 'warn' | 'error'): Linter.RulesRecord => ({
  [q('one-main-button')]: severity,
  [q('danger-last')]: severity,
  [q('trailing-icon')]: severity,
})

const USAGE_RULES_AS_WARNINGS = usageRules('warn')

/**
 * The usage rules as errors. Spread it after the rule groups in a config whose
 * screens hold to them already, as `fixableRawControls` is spread: the groups
 * report the usage rules as warnings, so an app that upgrades is not stopped by
 * screens it wrote before the rules existed.
 */
export const usageRulesAsErrors: Linter.RulesRecord = usageRules('error')

/**
 * Rules that need the vocabulary and the exception ladder to exist first.
 *
 * `one-opener` is in this group instead of a group of its own, although it is
 * different from the others. They limit what a screen may express, and it
 * limits what a screen may compose. It belongs to this stage for the stage's
 * reason: a rule about a pair (Hero and the page's `<h1>`) cannot apply until
 * both exist. It is in `allRules` because that is the set the install ships
 * (`packages/cli/src/emit.ts`), so the law ships with the vocabulary instead of
 * living in a repo-local test.
 */
export const stageTwoRules: Linter.RulesRecord = {
  [q('no-raw-interactive')]: 'error',
  [q('no-external-motion')]: 'error',
  [q('no-external-icons')]: 'error',
  /**
   * Chart containment (`docs/charts.md`): the vocabulary does the rendering, and
   * the scale maths comes from a library. It is in this stage for the stage's
   * reason: forbidding `recharts` before `<BarChart>` exists leaves no lawful
   * alternative. It is in `allRules` because that is the set the install ships,
   * so an app that vendors a chart member also gets the rule that stops it from
   * being bypassed.
   */
  [q('no-external-dataviz')]: 'error',
  [q('scoped-token-owners')]: ['error', { owners }],
  [q('one-opener')]: 'error',
  /**
   * The usage rules (`docs/rules.md`): one main Button in a dialog or a
   * section, a danger Button last in its row, and a trailing icon that is a
   * direction or a disclosure. Like `one-opener`, they limit what a screen
   * composes, and they need the vocabulary's Button and scopes to exist.
   *
   * They are warnings here, because this is the group an install applies, and
   * screens written before the rules existed break them: an app that upgrades
   * sees the reports without a failing build. `usageRulesAsErrors`, spread
   * after the groups, makes them errors, as this repository's config does.
   */
  ...USAGE_RULES_AS_WARNINGS,
}

/**
 * The packaging-boundary rule, in its own group.
 *
 * Stages 1 and 2 cover application code: what a screen may express and what it
 * may import. This rule covers the vocabulary: what a component file may import
 * if it will be copied into another repository. It applies to different files,
 * so adding it to a stage would apply it to app code, which has no vendorable
 * tree.
 */
export const vendorableRules: Linter.RulesRecord = {
  [q('vendorable-imports')]: ['error', { root: 'packages/react-ui/src' }],
}

/** Every rule for application code. Excludes the vendorable rule (see above). */
export const allRules: Linter.RulesRecord = { ...stageOneRules, ...stageTwoRules }

export { RULE_CLIMB } from './ladder'

/**
 * The parser the rules need, re-exported so an install includes one.
 *
 * Every rule here is syntactic. `no-raw-styles` reads JSX attributes,
 * `no-external-motion` reads import specifiers, and none of them uses the type
 * checker. They all need a parser that can read TSX, and ESLint's default
 * cannot. Without it, the installed config reports
 * `Parsing error: Unexpected token <` on every file, so the rules look
 * configured but check nothing.
 *
 * This repository's own flat config sets a parser through `typescript-eslint`,
 * so the problem does not appear here. An app that installs polymorph has no
 * config until `polymorph add` writes one, and that is where it would appear.
 * `packages/cli/scratch.test.ts` installs into such an app and lints it.
 */
export { parser }

export default plugin
